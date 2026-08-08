import type { SpatialGrid } from '@autopolis/core';
import type { SceneStats, TileSelection } from '../engine/CityScene';
import type { ServerStatus } from '../useServerTick';

interface HUDProps {
  grid: SpatialGrid;
  seed: number;
  selection: TileSelection | null;
  stats: SceneStats | null;
  serverStatus: ServerStatus;
  serverTick: number | null;
  onNewSeed: () => void;
}

function fpsClass(fps: number | undefined): string {
  if (fps === undefined) return 'muted';
  if (fps < 30) return 'fps bad';
  if (fps < 55) return 'fps warn';
  return 'fps ok';
}

export function HUD({ grid, seed, selection, stats, serverStatus, serverTick, onNewSeed }: HUDProps) {
  const serverClass =
    serverStatus === 'connected' ? 'ok' : serverStatus === 'connecting' ? 'warn' : 'bad';

  return (
    <>
      <header className="hud-top">
        <div className="brand">
          <span className="brand-mark">◈</span> AUTOPOLIS
          <span className="phase-tag">PHASE 1 · SPATIAL GRID ENGINE</span>
        </div>
        <div className="hud-controls">
          <span className="chip">
            seed <strong>{seed}</strong>
          </span>
          <span className="chip">
            grid <strong>
              {grid.width}×{grid.height}
            </strong>
          </span>
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
