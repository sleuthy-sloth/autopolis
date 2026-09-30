/**
 * GodPanel — the human as an agent.
 *
 * Every control here issues a real AgentAction through the same Zod contract
 * the LLM planner uses: executor placement laws, treasury costs, newsfeed
 * entries. Weather + disasters are global modifiers with real consequences.
 */
import { useEffect, useState } from 'react';
import type { SpatialGrid } from '@autopolis/core';
import type { Weather } from '../engine/CityScene';

export interface GodActionInput {
  action: string;
  coordinates: { from: [number, number]; to: [number, number] };
  metadata?: Record<string, string | number | boolean>;
  reasoning?: string;
}

interface GodPanelProps {
  grid: SpatialGrid;
  disabled: boolean;
  taxRate: number | null;
  weather: Weather;
  onAction: (a: GodActionInput) => void;
  onGrant: () => void;
  onWeather: (w: Weather) => void;
  onDisaster: (kind: string) => void;
}

export function GodPanel({ disabled, grid, taxRate, weather, onAction, onGrant, onWeather, onDisaster }: GodPanelProps) {
  const cx = Math.floor(grid.width / 2);
  const cy = Math.floor(grid.height / 2);
  const [tax, setTax] = useState(taxRate ?? 9);

  useEffect(() => setTax(taxRate ?? 9), [taxRate]);

  const point = (dx: number, dy: number): [number, number] => [cx + dx, cy + dy];
  const send = (action: string, from: [number, number], to: [number, number], metadata?: Record<string, string | number | boolean>): void =>
    { if (!disabled) onAction({ action, coordinates: { from, to }, metadata, reasoning: 'god-mode directive' }); }

  return (
    <div className="god-panel">
      <p className="muted">Influence the city. Results and placement failures appear in Stories.</p>
      {disabled && <p className="connection-note">Connect to the engine to intervene.</p>}
      <fieldset disabled={disabled}>
      <legend>Economy</legend>

      <label className="god-row">
        <span>
          tax rate <strong>{tax}%</strong>
        </span>
        <input
          type="range"
          min={0}
          max={30}
          step={1}
          value={tax}
          onChange={(e) => setTax(Number(e.target.value))}
          aria-label="Tax rate"
        />
      </label>

      <button className="btn" disabled={disabled || taxRate === null || tax === taxRate}
        onClick={() => send('ADJUST_TAX_RATE', [0, 0], [0, 0], { tax_rate: tax })}>Apply tax</button>
      <button className="btn" onClick={() => { if (!disabled) onGrant(); }}>Grant +1,000¤</button>
      </fieldset>
      <fieldset disabled={disabled}>
      <legend>Construction</legend>
      <p className="muted">Quick builds use fixed sites near the map center. Structures cost 200¤, roads 10¤ per changed tile, zones 5¤ per changed tile.</p>
      <div className="god-buttons">
        <button onClick={() => send('BUILD_STRUCTURE', point(-3, -3), point(-3, -3), { structure: 'POWER_PLANT' })}>
          Power plant
        </button>
        <button onClick={() => send('BUILD_STRUCTURE', point(3, 3), point(3, 3), { structure: 'WATER_TOWER' })}>
          Water tower
        </button>
        <button onClick={() => send('EXTEND_ROAD', point(0, 2), point(5, 2))}>Road east</button>
        <button onClick={() => send('SET_ZONING', point(-2, 4), point(1, 6), { zone: 'RESIDENTIAL' })}>Residential zone</button>
        <button onClick={() => send('SET_ZONING', point(-1, -1), point(1, 1), { zone: 'COMMERCIAL' })}>Commercial zone</button>
        <button onClick={() => send('SET_ZONING', point(4, -4), point(6, -2), { zone: 'INDUSTRIAL' })}>Industrial zone</button>
      </div>

      <p className="muted">Sites relative to center: power (−3, −3); water (+3, +3); road (0, +2) to (+5, +2); residential (−2, +4) to (+1, +6); commercial (−1, −1) to (+1, +1); industrial (+4, −4) to (+6, −2). Water and transport tiles cannot host structures.</p>
      </fieldset>
      <fieldset disabled={disabled}>
      <legend>Weather</legend>
      <div className="god-row">
        <span>
          weather <strong>{weather}</strong>
        </span>
        <div className="god-buttons">
          <button className={weather === 'clear' ? 'active' : ''} onClick={() => !disabled && onWeather('clear')}>
            ☀️ clear
          </button>
          <button className={weather === 'rain' ? 'active' : ''} onClick={() => !disabled && onWeather('rain')}>
            🌧 rain
          </button>
          <button className={weather === 'storm' ? 'active' : ''} onClick={() => !disabled && onWeather('storm')}>
            ⛈ storm
          </button>
        </div>
      </div>

      </fieldset>
      <fieldset disabled={disabled} className="danger-section">
      <legend>Disasters</legend>
      <p className="muted">These damage your city. You’ll confirm before triggering one.</p>
      <div className="god-row">
        <div className="god-buttons">
          <button onClick={() => !disabled && onDisaster('earthquake')}>🌋 quake</button>
          <button onClick={() => !disabled && onDisaster('flood')}>🌊 flood</button>
          <button onClick={() => !disabled && onDisaster('fire')}>🔥 fire</button>
        </div>
      </div>
      </fieldset>
    </div>
  );
}
