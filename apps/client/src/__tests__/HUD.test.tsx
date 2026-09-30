/**
 * HUD smoke tests — render the real HUD component with a mocked (plain-data)
 * server state and the real simulation core for the grid.
 *
 * Covers: server status chip (all four states + tick), seed/biome/grid chips,
 * population/treasury/weather chips, the New Seed button wiring, the overlay
 * button disabled/enabled behavior, and the newsfeed.
 *
 * No Three.js: HUD imports CityScene types as `import type` (erased at build
 * time) and Charts is pure SVG — nothing touches a WebGL canvas here.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CityDevelopment, SpatialGrid, generateTerrain } from '@autopolis/core';
import { HUD } from '../ui/HUD';
import type { HistoryPoint } from '../ui/Charts';
import type { SceneStats, TileSelection, Weather } from '../engine/CityScene';
import type { ServerStatus } from '../useEngine';

function makeGrid(seed = 42): SpatialGrid {
  const g = new SpatialGrid(8, 8);
  generateTerrain(g, { seed });
  const dev = new CityDevelopment(seed);
  for (let t = 1; t <= 60; t++) dev.step(g, t);
  return g;
}

const stats: SceneStats = { fps: 60, tiles: 64 };
const life = { citizens: 128, cars: 7, ships: 0, trains: 1 };
const city = { treasury: 500, taxRate: 7, weather: 'clear' as Weather };
const selection: TileSelection = { x: 3, y: 2, type: 2, name: 'grass', elevation: 0.523 };
const history: HistoryPoint[] = [
  { tick: 1, population: 10, treasury: 100, taxRate: 7, powerCoverage: 0.5, waterCoverage: 0.4, roadTiles: 8, railTiles: 0 },
  { tick: 2, population: 20, treasury: 150, taxRate: 7, powerCoverage: 0.6, waterCoverage: 0.5, roadTiles: 12, railTiles: 0 },
  { tick: 3, population: 30, treasury: 200, taxRate: 7, powerCoverage: 0.7, waterCoverage: 0.6, roadTiles: 16, railTiles: 2 },
];

interface HarnessOptions {
  serverStatus?: ServerStatus;
  serverTick?: number | null;
  hasResources?: boolean;
  events?: string[];
}

function renderHUD(opts: HarnessOptions = {}) {
  const {
    serverStatus = 'connected',
    serverTick = 41,
    hasResources = true,
    events = ['agent_01 built a road', 'market boomed'],
  } = opts;
  const grid = makeGrid(42);
  const onNewSeed = vi.fn();
  const onCycleOverlay = vi.fn();
  const container = document.createElement('div');
  document.body.appendChild(container);
  let root!: Root;

  act(() => {
    root = createRoot(container);
    root.render(
      <HUD
        grid={grid}
        seed={42}
        selection={selection}
        stats={stats}
        life={life}
        cityStats={{
          zones: { residential: 12, commercial: 4, industrial: 1 },
          infrastructure: { roadTiles: 24, railTiles: 3, powerPlants: 1, waterTowers: 1, roadComponents: 1 },
          population: 48,
          powerCoverage: 0.83,
          waterCoverage: 0.91,
          roadComponents: 1,
        }}
        city={city}
        events={events}
        history={history}
        serverStatus={serverStatus}
        serverTick={serverTick}
        overlay="none"
        hasResources={hasResources}
        onNewSeed={onNewSeed}
        onCycleOverlay={onCycleOverlay}
      />,
    );
  });

  const text = (): string => container.textContent ?? '';
  const chip = (label: string): string => {
    const el = Array.from(container.querySelectorAll<HTMLElement>('.chip')).find((c) =>
      c.textContent?.includes(label),
    );
    return el?.textContent ?? '';
  };
  const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>('button'));
  const byLabel = (label: string): HTMLButtonElement | undefined =>
    buttons.find((b) => b.textContent?.includes(label));

  return {
    root,
    container,
    text,
    chip,
    buttons,
    byLabel,
    onNewSeed,
    onCycleOverlay,
    serverEl: () => container.querySelector<HTMLElement>('.server'),
  };
}

describe('HUD with mock server state', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders the server status chip for each lifecycle state', () => {
    const expectations: Array<{ status: ServerStatus; cls: string }> = [
      { status: 'connected', cls: 'ok' },
      { status: 'connecting', cls: 'warn' },
      { status: 'reconnecting', cls: 'bad' },
      { status: 'offline', cls: 'bad' },
    ];
    for (const { status, cls } of expectations) {
      const h = renderHUD({ serverStatus: status, serverTick: null });
      expect(h.serverEl()?.textContent).toContain(status);
      expect(h.serverEl()?.className).toContain(cls);
      act(() => h.root.unmount());
    }
  });

  it('shows the server tick next to the status when present', () => {
    const h = renderHUD({ serverStatus: 'connected', serverTick: 41 });
    expect(h.serverEl()?.textContent).toContain('connected');
    expect(h.serverEl()?.textContent).toContain('tick 41');
    act(() => h.root.unmount());
  });

  it('renders seed, biome, and grid chips from the world', () => {
    const h = renderHUD();
    expect(h.chip('seed')).toContain('42');
    expect(h.chip('biome')).toContain(makeGrid(42).biome);
    expect(h.chip('grid')).toContain('8×8');
    act(() => h.root.unmount());
  });

  it('renders city stats, life, treasury, weather, and fps chips', () => {
    const h = renderHUD();
    expect(h.chip('pop')).toContain('48');
    expect(h.chip('pop')).toContain('R 12');
    expect(h.chip('👥')).toContain('128');
    expect(h.chip('👥')).toContain('🚆 1');
    expect(h.chip('¤')).toContain('500');
    expect(h.chip('tax')).toContain('7%');
    expect(h.chip('☀️')).toContain('clear');
    expect(h.chip('fps')).toContain('60 fps');
    expect(h.chip('fps')).toContain('64 tiles');
    act(() => h.root.unmount());
  });

  it('New Seed button fires onNewSeed; Overlay fires onCycleOverlay when enabled', () => {
    const h = renderHUD({ hasResources: true });
    expect(h.byLabel('New Seed')).toBeTruthy();
    act(() => {
      h.byLabel('New Seed')?.click();
    });
    expect(h.onNewSeed).toHaveBeenCalledTimes(1);

    const overlay = h.byLabel('Overlay');
    expect(overlay?.disabled).toBe(false);
    act(() => {
      overlay?.click();
    });
    expect(h.onCycleOverlay).toHaveBeenCalledTimes(1);
    act(() => h.root.unmount());
  });

  it('disables the Overlay button when the engine has not sent resources', () => {
    const h = renderHUD({ hasResources: false });
    const overlay = h.byLabel('Overlay');
    expect(overlay?.disabled).toBe(true);
    act(() => {
      overlay?.click();
    });
    expect(h.onCycleOverlay).not.toHaveBeenCalled();
    act(() => h.root.unmount());
  });

  it('renders the newsfeed with the latest events', () => {
    const h = renderHUD({ events: ['first event', 'second event'] });
    const feed = h.container.querySelector('[aria-label="newsfeed"]');
    expect(feed?.textContent).toContain('first event');
    expect(feed?.textContent).toContain('second event');
    act(() => h.root.unmount());
  });

  it('renders the tile inspector for a selection and telemetry for history', () => {
    const h = renderHUD();
    const inspector = h.container.querySelector('.hud-inspector');
    expect(inspector?.textContent).toContain('3, 2');
    expect(inspector?.textContent).toContain('grass');
    expect(inspector?.textContent).toContain('0.523');
    expect(h.container.querySelector('.charts-panel')?.textContent).toContain('City trends');
    act(() => h.root.unmount());
  });
});