import type { CityStats, SpatialGrid } from '@autopolis/core';
import type { OverlayMode, SceneStats, TileSelection, Weather } from '../engine/CityScene';
import type { ServerStatus } from '../useEngine';
import { Charts, type HistoryPoint } from './Charts';

interface HUDProps {
  grid: SpatialGrid;
  seed: number;
  selection: TileSelection | null;
  stats: SceneStats | null;
  life: { citizens: number; cars: number; ships: number; trains: number } | null;
  cityStats: CityStats | null;
  city: { treasury: number; taxRate: number; weather: Weather } | null;
  events: string[];
  history: HistoryPoint[];
  serverStatus: ServerStatus;
  serverTick: number | null;
  overlay: OverlayMode;
  hasResources: boolean;
  onNewSeed: () => void;
  onCycleOverlay: () => void;
}

function fpsClass(fps: number | undefined): string {
  if (fps === undefined) return 'muted';
  if (fps < 30) return 'fps bad';
  if (fps < 55) return 'fps warn';
  return 'fps ok';
}

export function HUD({
  grid,
  seed,
  selection,
  stats,
  life,
  cityStats,
  city,
  events,
  history,
  serverStatus,
  serverTick,
  overlay,
  hasResources,
  onNewSeed,
  onCycleOverlay,
}: HUDProps) {
  const serverClass =
    serverStatus === 'connected' ? 'ok' : serverStatus === 'connecting' ? 'warn' : 'bad';
  const overlayLabel = overlay === 'none' ? 'off' : overlay;

  return (
    <>
      <div className="hud-top">
        <div className="brand">
          <span className="brand-mark">◈</span> AUTOPOLIS{' '}
          <span className="phase-tag">PHASE 4 · GOD-MODE DASHBOARD</span>
        </div>
        <div className="hud-controls">
          {cityStats && (
            <span className="chip stats">
              <strong>{cityStats.population.toLocaleString()}</strong> pop
              <span className="sep">·</span>
              <strong>R</strong> {cityStats.zones.residential}
              <strong className="dim">C</strong> {cityStats.zones.commercial}
              <strong className="dim">I</strong> {cityStats.zones.industrial}
              <span className="sep">·</span>⚡ {(cityStats.powerCoverage * 100).toFixed(0)}%
              <span className="sep">·</span>💧 {(cityStats.waterCoverage * 100).toFixed(0)}%
              <span className="sep">·</span>🛣 {cityStats.infrastructure.roadTiles.toLocaleString()}
              <span className="sep">·</span>🚆 {cityStats.infrastructure.railTiles}
            </span>
          )}
          {life && (
            <span className="chip">
              👥 {life.citizens} <span className="sep">·</span> 🚗 {life.cars}
              {life.ships > 0 && (
                <>
                  {' '}
                  <span className="sep">·</span> ⛵ {life.ships}
                </>
              )}
              {life.trains > 0 && (
                <>
                  {' '}
                  <span className="sep">·</span> 🚆 {life.trains}
                </>
              )}
            </span>
          )}
          {city && (
            <span className="chip">
              ¤ {Math.round(city.treasury).toLocaleString()}
              <span className="sep">·</span> tax <strong>{city.taxRate}%</strong>
            </span>
          )}
          <span className="chip">
            biome <strong>{grid.biome}</strong>
          </span>
          {city && (
            <span className={`chip weather ${city.weather}`}>
              {city.weather === 'clear' ? '☀️' : city.weather === 'rain' ? '🌧' : '⛈'}{' '}
              <strong>{city.weather}</strong>
            </span>
          )}
          <span className="chip">
            seed <strong>{seed}</strong>
          </span>
          <span className="chip">
            grid <strong>
              {grid.width}×{grid.height}
            </strong>
          </span>
          <button
            className="btn"
            onClick={onCycleOverlay}
            disabled={!hasResources}
            title={hasResources ? 'Cycle power/water coverage overlay' : 'Engine offline — no coverage data'}
          >
            Overlay: {overlayLabel}
          </button>
          <button className="btn" onClick={onNewSeed}>
            ⟳ New Seed
          </button>
          <span className={`server ${serverClass}`}>
            <span className="dot" />
            {serverStatus}
            {serverTick !== null ? ` · tick ${serverTick}` : ''}
          </span>
        </div>
      </div>

      <aside className="hud-inspector">
        <h3>TILE INSPECTOR</h3>
        {selection ? (
          <dl>
            <dt>position</dt>
            <dd>
              {selection.x}, {selection.y}
            </dd>
            <dt>type</dt>
            <dd>{selection.name}</dd>
            <dt>elevation</dt>
            <dd>{selection.elevation.toFixed(3)}</dd>
          </dl>
        ) : (
          <p className="muted">
            Hover to highlight.
            <br />
            Click a tile to inspect.
          </p>
        )}
      </aside>

      <div className="hud-telemetry">
        <span className={fpsClass(stats?.fps)}>
          {stats ? `${stats.fps.toFixed(0)} fps` : '-- fps'}
        </span>
        {stats && <span className="muted">{stats.tiles.toLocaleString()} tiles</span>}
      </div>

      <Charts history={history} />

      <div className="hud-feed" aria-label="newsfeed">
        <h3>NEWSFEED</h3>
        {events.length === 0 ? (
          <p className="muted">Agents have not acted yet…</p>
        ) : (
          <ul>
            {events.slice(0, 4).map((e, i) => (
              <li key={e + i}>{e}</li>
            ))}
          </ul>
        )}
      </div>

      <footer className="hud-hint">drag · orbit &nbsp;·&nbsp; scroll · zoom &nbsp;·&nbsp; click · inspect</footer>
    </>
  );
}
