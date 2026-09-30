import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SpatialGrid, generateTerrain, type CityStats } from '@autopolis/core';
import { CityScene, type OverlayMode, type SceneStats, type TileSelection, type Weather } from './engine/CityScene';
import { HUD } from './ui/HUD';
import { GodPanel, type GodActionInput } from './ui/GodPanel';
import type { HistoryPoint } from './ui/Charts';
import { useEngine, type EngineMessage } from './useEngine';

const GRID_SIZE = 64;

interface ServerWorld {
  grid: SpatialGrid;
  stats: CityStats | null;
  resources: { power: number[]; water: number[] } | null;
  city: { treasury: number; taxRate: number; weather: Weather } | null;
  events: string[];
  history: HistoryPoint[];
  lastSavedTick: number | null;
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
    // lastSavedTick rides along on world:state; type it narrowly here since
    // EngineMessage (useEngine) only declares the fields it interprets itself.
    const raw = msg as EngineMessage & { lastSavedTick?: unknown };
    setServerWorld({
      grid: SpatialGrid.deserialize(msg.grid as Parameters<typeof SpatialGrid.deserialize>[0]),
      stats: (msg.stats as CityStats | undefined) ?? null,
      resources: (msg.resources as { power: number[]; water: number[] } | undefined) ?? null,
      city: (msg.city as { treasury: number; taxRate: number; weather: Weather } | undefined) ?? null,
      events: (msg.events as string[] | undefined) ?? [],
      history: (msg.history as HistoryPoint[] | undefined) ?? [],
      lastSavedTick: typeof raw.lastSavedTick === 'number' ? raw.lastSavedTick : null,
    });
  }, []);

  const { status, tick, send, godAction, command } = useEngine(undefined, handleState);

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

  useEffect(() => {
    if (serverWorld?.city?.weather) sceneRef.current?.setWeather(serverWorld.city.weather);
  }, [serverWorld?.city?.weather]);

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

  const godActionHandler = (a: GodActionInput): void => {
    if (status === 'connected') godAction(a);
  };

  const grantTreasury = (): void => {
    if (status === 'connected') command('grant', 1000);
  };

  const setWeather = (w: Weather): void => {
    if (status === 'connected') command('weather', undefined, w);
  };

  const triggerDisaster = (kind: string): void => {
    if (status === 'connected') command('disaster', undefined, kind);
  };

  const saveCity = (): void => {
    if (status === 'connected') command('save');
  };

  const loadCity = (): void => {
    if (status === 'connected') command('load');
  };

  const lastSavedTick = serverWorld?.lastSavedTick ?? null;

  return (
    <div className="app">
      <div ref={mountRef} className="viewport" />
      <div className="vignette" />
      <HUD
        grid={activeGrid}
        seed={serverWorld?.grid.seed ?? seed}
        selection={selection}
        stats={stats}
        life={life}
        cityStats={serverWorld?.stats ?? null}
        city={serverWorld?.city ?? null}
        events={serverWorld?.events ?? []}
        history={serverWorld?.history ?? []}
        serverStatus={status}
        serverTick={tick}
        overlay={overlay}
        hasResources={serverWorld?.resources !== null}
        onNewSeed={newSeed}
        onCycleOverlay={cycleOverlay}
      />
      <GodPanel
        disabled={status !== 'connected' || !serverWorld?.city}
        grid={activeGrid}
        taxRate={serverWorld?.city?.taxRate ?? null}
        weather={serverWorld?.city?.weather ?? 'clear'}
        onAction={godActionHandler}
        onGrant={grantTreasury}
        onWeather={setWeather}
        onDisaster={triggerDisaster}
      />
      <div
        className="persistence-bar"
        style={{
          position: 'absolute',
          bottom: 20,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          zIndex: 10,
        }}
      >
        <span className="chip">
          💾 {lastSavedTick !== null ? `last saved tick ${lastSavedTick.toLocaleString()}` : 'never saved'}
        </span>
        <button
          className="btn"
          onClick={saveCity}
          disabled={status !== 'connected'}
          title={status === 'connected' ? 'Save city snapshot to disk' : 'Engine offline — no snapshot target'}
        >
          💾 Save
        </button>
        <button
          className="btn"
          onClick={loadCity}
          disabled={status !== 'connected'}
          title={status === 'connected' ? 'Reload city from its snapshot' : 'Engine offline — no snapshot source'}
        >
          🗂 Load
        </button>
      </div>
    </div>
  );
}
