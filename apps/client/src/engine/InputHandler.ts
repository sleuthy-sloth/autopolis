/**
 * InputHandler — canvas pointer tracking (for hover raycasting), click
 * selection with drag suppression, pointer-leave hover reset, and viewport
 * resize. Owned by CityScene.
 */
import * as THREE from 'three';
import type { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';

const DRAG_THRESHOLD_PX = 5;

export interface InputHandlerCallbacks {
  /** Fire when a click lands without ending an orbit/zoom drag. */
  onSelect: () => void;
  /** Pointer left the canvas — hover state should be cleared. */
  onPointerLeave: () => void;
}

export class InputHandler {
  readonly raycaster = new THREE.Raycaster();
  /** Normalized pointer; off-screen (-2, -2) until the first pointer move. */
  readonly pointer = new THREE.Vector2(-2, -2);

  private readonly container: HTMLElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly composer: EffectComposer;
  private readonly callbacks: InputHandlerCallbacks;
  private dragStart: { x: number; y: number } | null = null;

  constructor(
    container: HTMLElement,
    renderer: THREE.WebGLRenderer,
    camera: THREE.PerspectiveCamera,
    composer: EffectComposer,
    callbacks: InputHandlerCallbacks,
  ) {
    this.container = container;
    this.renderer = renderer;
    this.camera = camera;
    this.composer = composer;
    this.callbacks = callbacks;

    const el = renderer.domElement;
    el.addEventListener('pointermove', this.onPointerMove);
    el.addEventListener('pointerdown', this.onPointerDown);
    el.addEventListener('click', this.onClick);
    el.addEventListener('pointerleave', this.onPointerLeave);
    window.addEventListener('resize', this.onWindowResize);
  }

  dispose(): void {
    const el = this.renderer.domElement;
    el.removeEventListener('pointermove', this.onPointerMove);
    el.removeEventListener('pointerdown', this.onPointerDown);
    el.removeEventListener('click', this.onClick);
    el.removeEventListener('pointerleave', this.onPointerLeave);
    window.removeEventListener('resize', this.onWindowResize);
  }

  private readonly onPointerMove = (e: PointerEvent): void => {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  };

  private readonly onPointerDown = (e: PointerEvent): void => {
    this.dragStart = { x: e.clientX, y: e.clientY };
  };

  private readonly onClick = (e: MouseEvent): void => {
    // Ignore clicks that ended an orbit/zoom drag.
    if (this.dragStart) {
      const moved = Math.hypot(e.clientX - this.dragStart.x, e.clientY - this.dragStart.y);
      if (moved > DRAG_THRESHOLD_PX) return;
    }
    this.callbacks.onSelect();
  };

  private readonly onPointerLeave = (): void => {
    this.pointer.set(-2, -2);
    this.callbacks.onPointerLeave();
  };

  private readonly onWindowResize = (): void => {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w === 0 || h === 0) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
  };
}