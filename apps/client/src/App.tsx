import { useEffect, useMemo, useRef, useState } from 'react';
import { SpatialGrid, generateTerrain } from '@autopolis/core';
import { CityScene, type SceneStats, type TileSelection } from './engine/CityScene';
import { HUD } from './ui/HUD';
import { useServerTick } from './useServerTick';

const GRID_SIZE = 64;
const ENGINE_WS_URL = 'ws://localhost:8788';

export default function App() {
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1_000_000_000));
  const mountRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<TileSelection | null>(null);
  const [stats, setStats] = useState<SceneStats | null>(null);
  const { status, tick } = useServerTick(ENGINE_WS_URL);

  const grid = useMemo(() => {
    const g = new SpatialGrid(GRID_SIZE, GRID_SIZE);
    generateTerrain(g, { seed });
    return g;
  }, [seed]);

  useEffect(() => {
    if (!mountRef.current) return;
    const scene = new CityScene(mountRef.current, grid, {
      onSelection: setSelection,
      onStats: setStats,
    });
    return () => scene.dispose();
  }, [grid]);

  const newSeed = (): void => setSeed(Math.floor(Math.random() * 1_000_000_000));

  return (
    <div className="app">
      <div ref={mountRef} className="viewport" />
      <HUD
        grid={grid}
        seed={seed}
        selection={selection}
        stats={stats}
        serverStatus={status}
        serverTick={tick}
        onNewSeed={newSeed}
      />
    </div>
  );
}
