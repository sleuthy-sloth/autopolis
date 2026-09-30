/**
 * WeatherSystem — sky/fog/lights per weather state, the rain particle field
 * (budget tiered by device capability), storm lightning flashes, and the
 * continuous water ripples. Owned by CityScene.
 */
import * as THREE from 'three';
import { hash2, type SpatialGrid } from '@autopolis/core';
import type { Weather } from './CityScene';
import type { TileRenderer } from './TileRenderer';

/** Sky gradients per weather state (top → horizon). */
const SKIES: Record<Weather, { top: string; horizon: string; hemi: number; sun: number; fog: number }> = {
  clear: { top: '#739aa6', horizon: '#dce5dc', hemi: 1.05, sun: 2.0, fog: 1.0 },
  rain: { top: '#46505c', horizon: '#9aa6b2', hemi: 0.85, sun: 1.4, fog: 1.0 },
  storm: { top: '#1b1f26', horizon: '#59636e', hemi: 0.6, sun: 1.0, fog: 1.0 },
};

/**
 * Rain particle budget tiered by device capability: low-end hardware (mobile UA
 * or ≤4 cores) skips the per-frame particle update entirely, mid-range gets a
 * lighter drizzle, high-end the full storm. Exported for HUD/debug use.
 */
export function rainCount(): number {
  if (typeof navigator === 'undefined') return 0;
  const cores = navigator.hardwareConcurrency || 0;
  const mobile = /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);
  if (mobile || cores <= 4) return 0;
  if (cores <= 8) return 300;
  return 900;
}

const RAIN_COUNT = rainCount();

export class WeatherSystem {
  private weather: Weather = 'clear';

  private readonly scene: THREE.Scene;
  private readonly hemiLight: THREE.HemisphereLight;
  private readonly sunLight: THREE.DirectionalLight;
  private readonly getGrid: () => SpatialGrid;
  private readonly skyTexture: THREE.CanvasTexture;
  private readonly rainPoints: THREE.Points;
  private readonly rainVelocities: Float32Array;
  private readonly rainBounds: { x: number; z: number; top: number };
  private stormFlash = 0;

  constructor(
    scene: THREE.Scene,
    hemiLight: THREE.HemisphereLight,
    sunLight: THREE.DirectionalLight,
    extent: number,
    getGrid: () => SpatialGrid,
  ) {
    this.scene = scene;
    this.hemiLight = hemiLight;
    this.sunLight = sunLight;
    this.getGrid = getGrid;

    // Sky — gradient background that tracks the weather.
    this.skyTexture = this.buildSkyTexture('clear');
    scene.background = this.skyTexture;
    scene.fog = new THREE.Fog(new THREE.Color(SKIES.clear.horizon), extent * 1.5, extent * 3.4);

    // Rain — a falling particle field over the city, hidden until weather asks.
    const rainGeo = new THREE.BufferGeometry();
    const rainPos = new Float32Array(RAIN_COUNT * 3);
    this.rainBounds = { x: extent * 0.75, z: extent * 0.75, top: extent * 0.9 };
    this.rainVelocities = new Float32Array(RAIN_COUNT);
    for (let i = 0; i < RAIN_COUNT; i++) {
      rainPos[i * 3] = (hash2(i, 7, 0x51ed) - 0.5) * this.rainBounds.x * 2;
      rainPos[i * 3 + 1] = hash2(i, 11, 0x51ed) * this.rainBounds.top;
      rainPos[i * 3 + 2] = (hash2(i, 13, 0x51ed) - 0.5) * this.rainBounds.z * 2;
      this.rainVelocities[i] = 26 + hash2(i, 17, 0x51ed) * 14;
    }
    rainGeo.setAttribute('position', new THREE.Float32BufferAttribute(rainPos, 3));
    const rainMat = new THREE.PointsMaterial({
      color: 0x9fb4cc,
      size: 0.14,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    this.rainPoints = new THREE.Points(rainGeo, rainMat);
    this.rainPoints.visible = false;
    scene.add(this.rainPoints);
  }

  /** 2×256 vertical gradient canvas → scene background. */
  private buildSkyTexture(weather: Weather): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 2;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    const sky = SKIES[weather];
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, sky.top);
    grad.addColorStop(1, sky.horizon);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 2, 256);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  /** Change the global weather: sky, fog, lights, rain. */
  setWeather(weather: Weather): void {
    if (weather === this.weather) return;
    this.weather = weather;
    const sky = SKIES[weather];
    const next = this.buildSkyTexture(weather);
    this.skyTexture.image = next.image;
    this.skyTexture.needsUpdate = true;
    (this.scene.fog as THREE.Fog).color.set(sky.horizon);
    this.rainPoints.visible = weather !== 'clear';
    const rainMat = this.rainPoints.material as THREE.PointsMaterial;
    rainMat.opacity = weather === 'storm' ? 0.85 : 0.55;
    rainMat.color.set(weather === 'storm' ? 0x8fa3c0 : 0x9fb4cc);
    this.hemiLight.intensity = sky.hemi;
    this.sunLight.intensity = sky.sun;
    this.sunLight.color.set(weather === 'clear' ? 0xfff4e0 : weather === 'rain' ? 0xdfe4ea : 0xc8ccd4);
  }

  /** Rain fall + storm lightning flashes. */
  update(dt: number): void {
    if (!this.rainPoints.visible) return;
    const attr = this.rainPoints.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    for (let i = 0; i < RAIN_COUNT; i++) {
      arr[i * 3 + 1] -= this.rainVelocities[i] * dt;
      if (arr[i * 3 + 1] < 0) {
        arr[i * 3 + 1] = this.rainBounds.top;
        arr[i * 3] = (hash2(i, 31, this.getGrid().seed) - 0.5) * this.rainBounds.x * 2;
        arr[i * 3 + 2] = (hash2(i, 37, this.getGrid().seed) - 0.5) * this.rainBounds.z * 2;
      }
    }
    attr.needsUpdate = true;

    if (this.weather === 'storm') {
      this.stormFlash -= dt;
      if (this.stormFlash <= 0 && Math.random() < dt * 0.25) this.stormFlash = 0.09;
      this.hemiLight.intensity = SKIES.storm.hemi + (this.stormFlash > 0 ? 2.6 : 0);
    }
  }

  /** Animate a continuous water field without moving terrain. */
  animateWater(elapsed: number, tiles: TileRenderer): void {
    const material = tiles.waterSurfaceMesh?.material as THREE.Material | undefined;
    if (material?.userData.waterTime) material.userData.waterTime.value = elapsed;
  }

  dispose(): void {
    this.skyTexture.dispose();
  }
}