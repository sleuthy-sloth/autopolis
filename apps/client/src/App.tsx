import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SpatialGrid, generateTerrain, type CityStats } from '@autopolis/core';
import { CityScene, type OverlayMode, type SceneStats, type TileSelection } from './engine/CityScene';
import { HUD } from './ui/HUD';
import { useEngine, type EngineMessage } from './useEngine';

const GRID_SIZE = 64;
const ENGINE_WS_URL = 'ws://localhost:8788';

interface ServerWorld {
  grid: SpatialGrid;
  stats: CityStats | null;
  resources: { power: number[]; water: number[] } | null;
  city: { treasury: number; taxRate: number } | null;
  events: string[];
}

export default function App() {
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1_000_000_000));
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<CityScene | null>(null);
  const [selection, setSelection] = useState<TileSelection | null>(null);
  const [stats, setStats] = useState<SceneStats | null>(null);
  const [life, setLife] = useState<{ citizens: number; cars: number; ships: number; trains: number } | null>(null);
  const [overlay, setOverlay] = useState<OverlayMode>('none');
  const [serverWorld, setServerWorld] = useState<ServerWorld | null>(null);

  // Standalone fallback: client-generated terrain (used until/unless the engine is up).
  const localGrid = useMemo(() => {
    const g = new SpatialGrid(GRID_SIZE, GRID_SIZE);
    generateTerrain(g, { seed });
    return g;
  }, [seed]);

  const activeGrid = serverWorld?.grid ?? localGrid;

  const handleState = useCallback((msg: EngineMessage) => {
    if (!msg.grid) return;
    setServerWorld({
      grid: SpatialGrid.deserialize(msg.grid as Parameters<typeof SpatialGrid.deserialize>[0]),
      stats: (msg.stats as CityStats | undefined) ?? null,
      resources: (msg.resources as { power: number[]; water: number[] } | undefined) ?? null,
      city: (msg.city as { treasury: number; taxRate: number } | undefined) ?? null,
      events: (msg.events as string[] | undefined) ?? [],
    });
  }, []);

  const { status, tick, send } = useEngine(ENGINE_WS_URL, handleState);

  // Mount the scene once; grid swaps happen in place via replaceGrid.
  useEffect(() => {
    if (!mountRef.current) return;
    const scene = new CityScene(mountRef.current, activeGrid, {
      onSelection: setSelection,
      onStats: setStats,
      onLife: setLife,
    });
    sceneRef.current = scene;
    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    sceneRef.current?.replaceGrid(activeGrid);
  }, [activeGrid]);

  useEffect(() => {
    sceneRef.current?.setOverlay(overlay, serverWorld?.resources ?? null);
  }, [overlay, serverWorld]);

  const newSeed = (): void => {
    if (status === 'connected') {
      send({ type: 'reset' }); // engine regenerates + broadcasts the new world
    } else {
      setServerWorld(null);
      setSeed(Math.floor(Math.random() * 1_000_000_000));
    }
  };

  const cycleOverlay = (): void => {
    setOverlay((m) => (m === 'none' ? 'power' : m === 'power' ? 'water' : 'none'));
  };

  return (
    <div className="app">
      <div ref={mountRef} className="viewport" />
      <HUD
        grid={activeGrid}
        seed={serverWorld?.grid.seed ?? seed}
        selection={selection}
        stats={stats}
        life={life}
        cityStats={serverWorld?.stats ?? null}
        city={serverWorld?.city ?? null}
        events={serverWorld?.events ?? []}
        serverStatus={status}
        serverTick={tick}
        overlay={overlay}
        hasResources={serverWorld?.resources !== null}
        onNewSeed={newSeed}
        onCycleOverlay={cycleOverlay}
      />
    </div>
  );
}
