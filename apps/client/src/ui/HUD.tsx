import type { CityStats, SpatialGrid } from '@autopolis/core';
import type { OverlayMode, SceneStats, TileSelection } from '../engine/CityScene';
import type { ServerStatus } from '../useEngine';

interface HUDProps {
  grid: SpatialGrid;
  seed: number;
  selection: TileSelection | null;
  stats: SceneStats | null;
  life: { citizens: number; cars: number } | null;
  cityStats: CityStats | null;
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
      <header className="hud-top">
        <div className="brand">
          <span className="brand-mark">◈</span> AUTOPOLIS
          <span className="phase-tag">PHASE 2.5 · ENTITY &amp; VISUAL LAYER</span>
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
              <span className="sep">·</span>🛣 {(cityStats.infrastructure.roadTiles).toLocaleString()}
            </span>
          )}
          {life && (
            <span className="chip">
              👥 {life.citizens} <span className="sep">·</span> 🚗 {life.cars}
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
      </header>

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

      <footer className="hud-hint">drag · orbit &nbsp;·&nbsp; scroll · zoom &nbsp;·&nbsp; click · inspect</footer>
    </>
  );
}
