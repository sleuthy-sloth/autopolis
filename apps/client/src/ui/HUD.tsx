import { useEffect, useRef, type ReactNode } from 'react';
import type { CityStats } from '@autopolis/core';
import type { OverlayMode, TileSelection, Weather } from '../engine/CityScene';
import type { ServerStatus } from '../useEngine';
export type PanelName = 'stories' | 'trends' | 'intervene' | 'city' | 'help';
const PANELS: Array<{ id: PanelName; label: string }> = [
  { id: 'stories', label: 'Stories' }, { id: 'trends', label: 'Trends' },
  { id: 'intervene', label: 'Intervene' }, { id: 'city', label: 'City' }, { id: 'help', label: 'Help' },
];
interface HUDProps {
  selection: TileSelection | null;
  cityStats: CityStats | null;
  city: { treasury: number; taxRate: number; weather: Weather } | null;
  serverStatus: ServerStatus;
  hasWorld: boolean;
  overlay: OverlayMode;
  hasResources: boolean;
  activePanel: PanelName | null;
  onPanelChange: (panel: PanelName | null) => void;
  onOverlayChange: (mode: OverlayMode) => void;
  panelContent: ReactNode;
}
function Metric({ name, value, tone }: { name: string; value: string; tone?: string }) {
  return <div className={`metric ${tone ?? ''}`}><span className="metric-label">{name}</span><strong className="metric-value">{value}</strong></div>;
}
export function HUD({ selection, cityStats, city, serverStatus, hasWorld, overlay, hasResources, activePanel, onPanelChange, onOverlayChange, panelContent }: HUDProps) {
  const navRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef(activePanel);
  activeRef.current = activePanel;
  const changeRef = useRef(onPanelChange);
  changeRef.current = onPanelChange;
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const connected = serverStatus === 'connected';
  useEffect(() => {
    const close = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !activeRef.current || document.querySelector('dialog[open]')) return;
      changeRef.current(null); openerRef.current?.focus();
    };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, []);
  const previousPanel = useRef(activePanel);
  useEffect(() => {
    if (activePanel && previousPanel.current !== activePanel && contentRef.current) {
      contentRef.current.scrollTop = 0;
      contentRef.current.focus();
    }
    previousPanel.current = activePanel;
  }, [activePanel]);
  const title = PANELS.find(p => p.id === activePanel)?.label;
  return <div className="shell">
    <header className="hud-top">
      <div className="brand"><span className="brand-mark" aria-hidden="true">◈</span><div><h1>Autopolis</h1><p>A city that grows itself</p></div></div>
      <div className="world-status">
        {city && <span className="weather-label">{city.weather === 'clear' ? 'Clear skies' : city.weather === 'rain' ? 'Rain' : 'Storm'}</span>}
        <span className={`server ${connected ? 'ok' : 'warn'}`} role="status"><span className="dot" />{connected ? 'City live' : serverStatus === 'connecting' ? 'Connecting' : serverStatus === 'offline' ? 'Engine offline' : 'Reconnecting'}</span>
      </div>
    </header>
    <div className="metrics" aria-label="City health">
      <Metric name="Population" value={cityStats?.population.toLocaleString() ?? '—'} />
      <Metric name="Treasury" value={city ? `${Math.round(city.treasury).toLocaleString()}¤` : '—'} tone="treasury" />
      <Metric name="Power" value={cityStats ? `${Math.round(cityStats.powerCoverage * 100)}%` : '—'} tone="power" />
      <Metric name="Water" value={cityStats ? `${Math.round(cityStats.waterCoverage * 100)}%` : '—'} tone="water" />
    </div>
    <div className="observatory-stage">
      <div className="world-tools">
        <div className="overlay-tools" role="group" aria-label="Coverage view">
          {(['none', 'power', 'water'] as const).map(mode => <button key={mode} aria-pressed={overlay === mode}
            disabled={mode !== 'none' && !hasResources} onClick={() => onOverlayChange(mode)}>{mode === 'none' ? 'Natural' : mode === 'power' ? 'Power' : 'Water'}</button>)}
        </div>
        {selection && <section className="tile-inspector" aria-label="Selected tile">
          <h2>{selection.name}</h2><p>Tile {selection.x}, {selection.y}<span>Elevation {selection.elevation.toFixed(2)}</span></p>
        </section>}
        {!connected && <p className="connection-banner">{hasWorld ? 'Last received city. Reconnecting for updates.' : 'Terrain preview. Connect the engine to grow a city.'}</p>}
      </div>
      {activePanel && <aside className={`drawer drawer-${activePanel}`} aria-labelledby="drawer-title">
        <div className="drawer-head"><h2 id="drawer-title">{title}</h2><button aria-label={`Close ${title}`} className="close-panel" onClick={() => { onPanelChange(null); openerRef.current?.focus(); }}>×</button></div>
        <div ref={contentRef} className="drawer-body" tabIndex={0} role="region" aria-label={`${title} content`}>{panelContent}</div>
      </aside>}
    </div>
    <footer className="observatory-footer">
      <p className="camera-hint">Drag to orbit<span>Scroll to zoom</span>Select to inspect</p>
      <nav ref={navRef} className="panel-nav" aria-label="City tools">{PANELS.map(({ id, label }) => <button key={id} data-nav={id}
        aria-pressed={activePanel === id} aria-controls={activePanel === id ? 'drawer-title' : undefined}
        onClick={e => { openerRef.current = e.currentTarget; onPanelChange(activePanel === id ? null : id); }}>{label}</button>)}</nav>
      <p className="local-note">Your world. On your machine.</p>
    </footer>
  </div>;
}
