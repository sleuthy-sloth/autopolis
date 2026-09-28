/**
 * Seed-regeneration flow + WebGL-guarded App smoke test.
 *
 * `newSeed()` in App.tsx branches on connection state:
 *   - connected → send({ type: 'reset' }) and wait for the new world
 *   - otherwise  → drop the server world and roll a new local seed
 *
 * We test that decision flow end-to-end with the REAL `useEngine` hook and
 * REAL `HUD` component (mocked WebSocket — see test/mockWebSocket.ts), so the
 * branch logic is covered in plain jsdom.
 *
 * WEBGL GUARD: the full `<App/>` render mounts a CityScene, which constructs a
 * THREE.WebGLRenderer (an actual `canvas.getContext('webgl')` call). jsdom
 * provides no WebGL, so that test is skipped here and only runs in
 * WebGL-capable environments (e.g. a headed browser CI). Detection:
 * `canvas.getContext('webgl')` / `experimental-webgl` must return a context.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useMemo, useState } from 'react';
import { SpatialGrid, generateTerrain } from '@autopolis/core';
import { HUD } from '../ui/HUD';
import { useEngine } from '../useEngine';
import {
  MockWebSocket,
  installMockWebSocket,
  restoreMockWebSocket,
} from '../../test/mockWebSocket';

function hasWebGL(): boolean {
  // jsdom ships no WebGLRenderingContext at all — bail before touching the
  // canvas so the (noisy) "Not implemented" virtual-console message never
  // fires in unit test runs.
  if (typeof WebGLRenderingContext === 'undefined') return false;
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl') ?? c.getContext('experimental-webgl'));
  } catch {
    return false;
  }
}

/** Replicates App.tsx's newSeed decision with the real hook + real HUD. */
function SeedHarness({ url }: { url: string }) {
  const [seed, setSeed] = useState(12345);
  const [serverGrid, setServerGrid] = useState<SpatialGrid | null>(null);
  const [overlay, setOverlay] = useState<'none' | 'power' | 'water'>('none');
  const { status, tick, send } = useEngine(url, () => {}); // world:state ignored here

  const localGrid = useMemo(() => {
    const g = new SpatialGrid(8, 8);
    generateTerrain(g, { seed });
    return g;
  }, [seed]);

  const newSeed = (): void => {
    if (status === 'connected') {
      send({ type: 'reset' }); // engine regenerates + broadcasts the new world
    } else {
      setServerGrid(null);
      setSeed(Math.floor(Math.random() * 1_000_000_000));
    }
  };

  return (
    <HUD
      grid={serverGrid ?? localGrid}
      seed={serverGrid?.seed ?? seed}
      selection={null}
      stats={null}
      life={null}
      cityStats={null}
      city={null}
      events={[]}
      history={[]}
      serverStatus={status}
      serverTick={tick}
      overlay={overlay}
      hasResources={false}
      onNewSeed={newSeed}
      onCycleOverlay={() => setOverlay((m) => (m === 'none' ? 'power' : m === 'power' ? 'water' : 'none'))}
    />
  );
}

function mountHarness(url: string) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  let root!: Root;

  act(() => {
    root = createRoot(container);
    root.render(<SeedHarness url={url} />);
  });

  const seedText = (): string => {
    const chip = Array.from(container.querySelectorAll<HTMLElement>('.chip')).find((c) =>
      c.textContent?.includes('seed'),
    );
    return (chip?.textContent ?? '').replace('seed', '').trim();
  };

  const clickNewSeed = (): void => {
    const btn = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find((b) =>
      b.textContent?.includes('New Seed'),
    );
    expect(btn, 'New Seed button must exist').toBeTruthy();
    act(() => {
      btn?.click();
    });
  };

  return {
    root,
    container,
    seedText,
    clickNewSeed,
    statusText: () =>
      container.querySelector<HTMLElement>('.server')?.textContent?.trim() ?? '',
    ws: () => MockWebSocket.instances[MockWebSocket.instances.length - 1],
  };
}

describe('seed regeneration flow (App.newSeed semantics)', () => {
  beforeEach(() => {
    installMockWebSocket();
  });

  afterEach(() => {
    restoreMockWebSocket();
    document.body.innerHTML = '';
  });

  it('connected → clicking New Seed sends {type:"reset"} and keeps the local seed', () => {
    const h = mountHarness('ws://localhost:8788');
    act(() => {
      h.ws().open();
    });
    expect(h.statusText()).toContain('connected');
    expect(h.seedText()).toBe('12345');

    h.clickNewSeed();

    expect(h.ws().sent).toEqual(['{"type":"reset"}']);
    expect(h.seedText()).toBe('12345'); // server world is expected to replace it
  });

  it('connecting (no socket yet) → clicking New Seed rolls a new local seed', () => {
    const h = mountHarness('ws://localhost:8788');
    expect(h.statusText()).toContain('connecting');
    expect(h.seedText()).toBe('12345');

    h.clickNewSeed();

    expect(h.ws().sent).toEqual([]); // nothing sent — engine not connected
    const updated = Number(h.seedText());
    expect(updated).not.toBeNaN();
    expect(updated).not.toBe(12345);
  });

  it('reconnecting (after a drop) → still regenerates locally, sending nothing', () => {
    const h = mountHarness('ws://localhost:8788');
    act(() => {
      h.ws().open();
      h.ws().closeRemote();
    });
    expect(h.statusText()).toContain('reconnecting');

    h.clickNewSeed();

    expect(h.ws().sent).toEqual([]);
    const updated = Number(h.seedText());
    expect(updated).not.toBeNaN();
    expect(updated).not.toBe(12345);
  });
});

// ---------------------------------------------------------------------------
// WebGL-guarded full-App smoke test.
// jsdom has no WebGL → `hasWebGL()` is false here, so this test is SKIPPED in
// this environment (that is the documented guard). It runs only where a real
// WebGL context can be created.
// ---------------------------------------------------------------------------
const webglAvailable = hasWebGL();

describe.skipIf(!webglAvailable)('App — full mount (requires WebGL)', () => {
  it('renders the app shell and HUD when WebGL is available', async () => {
    const { default: App } = await import('../App');
    const container = document.createElement('div');
    document.body.appendChild(container);
    let root!: Root;

    act(() => {
      root = createRoot(container);
      root.render(<App />);
    });

    expect(container.querySelector('.app')).toBeTruthy();
    expect(container.querySelector('.hud-top')).toBeTruthy();

    act(() => {
      root.unmount();
    });
  });
});