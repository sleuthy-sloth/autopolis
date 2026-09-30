import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SpatialGrid, generateTerrain, type CityStats } from '@autopolis/core';
import { CityScene, type OverlayMode, type SceneStats, type TileSelection, type Weather } from './engine/CityScene';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { CityControls } from './ui/CityControls';
import { HelpPanel, readHelpPreference, dismissHelpPreference } from './ui/HelpPanel';
import { StoriesPanel } from './ui/StoriesPanel';
import { Charts } from './ui/Charts';
import { HUD, type PanelName } from './ui/HUD';
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
  const [activePanel, setActivePanel] = useState<PanelName | null>(() => readHelpPreference() ? 'help' : null);
  const [confirmation, setConfirmation] = useState<'new-city' | 'load' | 'disaster' | null>(null);
  const [pendingDisaster, setPendingDisaster] = useState('');
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

  useEffect(() => { setSelection(null); }, [activeGrid.seed]);

  const newSeed = (): void => {
    setSelection(null);
    if (status === 'connected') {
      send({ type: 'reset' }); // engine regenerates + broadcasts the new world
    } else {
      setServerWorld(null);
      setSeed(Math.floor(Math.random() * 1_000_000_000));
    }
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
  const hasResources = status === 'connected' && serverWorld?.resources != null;
  useEffect(() => { if (!hasResources) setOverlay('none'); }, [hasResources]);
  const changePanel = (panel: PanelName | null): void => {
    if (activePanel === 'help') dismissHelpPreference();
    setActivePanel(panel);
  };
  const diagnostics = <dl className="world-details">
    <dt>Seed</dt><dd>{activeGrid.seed}</dd><dt>Biome</dt><dd>{activeGrid.biome}</dd>
    <dt>Grid</dt><dd>{activeGrid.width} × {activeGrid.height}</dd><dt>Simulation tick</dt><dd>{tick ?? '—'}</dd>
    <dt>Frame rate</dt><dd>{stats ? `${stats.fps.toFixed(0)} fps` : '—'}</dd>
    <dt>Rendered tiles</dt><dd>{stats?.tiles.toLocaleString() ?? '—'}</dd>
    {life && <><dt>Visible citizens</dt><dd>{life.citizens}</dd><dt>Vehicles</dt><dd>{life.cars} cars, {life.ships} ships, {life.trains} trains</dd></>}
  </dl>;
  const panelContent = activePanel === 'stories' ?
    <StoriesPanel events={serverWorld?.events ?? []} tick={tick} connected={status === 'connected'} /> :
    activePanel === 'trends' ? <Charts history={serverWorld?.history ?? []} /> :
    activePanel === 'help' ? <HelpPanel status={status} hasWorld={serverWorld !== null} onDismiss={() => changePanel(null)} /> :
    activePanel === 'city' ? <CityControls connected={status === 'connected'} lastSavedTick={lastSavedTick}
      onSave={saveCity} onLoad={() => setConfirmation('load')} onNewCity={() => setConfirmation('new-city')} diagnostics={diagnostics} /> :
    activePanel === 'intervene' ? <GodPanel disabled={status !== 'connected' || !serverWorld?.city} grid={activeGrid}
      taxRate={serverWorld?.city?.taxRate ?? null} weather={serverWorld?.city?.weather ?? 'clear'}
      onAction={godActionHandler} onGrant={grantTreasury} onWeather={setWeather}
      onDisaster={kind => { setPendingDisaster(kind); setConfirmation('disaster'); }} /> : null;

  return (
    <div className="app">
      <div ref={mountRef} className="viewport" />
      <div className="vignette" />
      <HUD selection={selection} cityStats={serverWorld?.stats ?? null} city={serverWorld?.city ?? null}
        serverStatus={status} hasWorld={serverWorld !== null} overlay={overlay} hasResources={hasResources}
        activePanel={activePanel} onPanelChange={changePanel} onOverlayChange={setOverlay} panelContent={panelContent} />
      {confirmation && <ConfirmDialog
        title={confirmation === 'new-city' ? 'Start a new city?' : confirmation === 'load' ? 'Load your saved city?' : `Trigger ${pendingDisaster}?`}
        description={confirmation === 'disaster' ? 'This damages the current city and costs treasury funds.' : 'This replaces the current world. Unsaved progress may be lost.'}
        confirmLabel={confirmation === 'new-city' ? 'New city' : confirmation === 'load' ? 'Load saved city' : `Trigger ${pendingDisaster}`}
        onCancel={() => setConfirmation(null)}
        onFocusFallback={() => document.querySelector<HTMLButtonElement>('[data-nav="city"]')?.focus()}
        onConfirm={() => {
          if (confirmation === 'new-city') newSeed();
          else if (confirmation === 'load' && status === 'connected') { setSelection(null); loadCity(); }
          else if (confirmation === 'disaster' && status === 'connected') triggerDisaster(pendingDisaster);
          setConfirmation(null);
        }} />}

    </div>
  );
}
