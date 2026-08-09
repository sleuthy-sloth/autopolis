/**
 * GodPanel — the human as an agent.
 *
 * Every control here issues a real AgentAction through the same Zod contract
 * the LLM planner uses: executor placement laws, treasury costs, newsfeed
 * entries. You play by the same rules as city_planner_01.
 */
import { useState } from 'react';
import type { SpatialGrid } from '@autopolis/core';

export interface GodActionInput {
  action: string;
  coordinates: { from: [number, number]; to: [number, number] };
  metadata?: Record<string, string | number | boolean>;
  reasoning?: string;
}

interface GodPanelProps {
  grid: SpatialGrid;
  taxRate: number | null;
  onAction: (a: GodActionInput) => void;
  onGrant: () => void;
}

export function GodPanel({ grid, taxRate, onAction, onGrant }: GodPanelProps) {
  const cx = Math.floor(grid.width / 2);
  const cy = Math.floor(grid.height / 2);
  const [tax, setTax] = useState(taxRate ?? 9);

  const point = (dx: number, dy: number): [number, number] => [cx + dx, cy + dy];
  const send = (action: string, from: [number, number], to: [number, number], metadata?: Record<string, string | number | boolean>): void =>
    onAction({ action, coordinates: { from, to }, metadata, reasoning: 'god-mode directive' });

  return (
    <aside className="god-panel">
      <h3>🏛 GOD MODE</h3>

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
          onMouseUp={() => send('ADJUST_TAX_RATE', [0, 0], [0, 0], { tax_rate: tax })}
          onTouchEnd={() => send('ADJUST_TAX_RATE', [0, 0], [0, 0], { tax_rate: tax })}
        />
      </label>

      <div className="god-buttons">
        <button onClick={onGrant}>+1,000¤</button>
        <button onClick={() => send('BUILD_STRUCTURE', point(-3, -3), point(-3, -3), { structure: 'POWER_PLANT' })}>
          ⚡ plant
        </button>
        <button onClick={() => send('BUILD_STRUCTURE', point(3, 3), point(3, 3), { structure: 'WATER_TOWER' })}>
          💧 tower
        </button>
        <button onClick={() => send('EXTEND_ROAD', point(0, 2), point(5, 2))}>🛣 road east</button>
        <button onClick={() => send('SET_ZONING', point(-2, 4), point(1, 6), { zone: 'RESIDENTIAL' })}>🏠 zone R</button>
        <button onClick={() => send('SET_ZONING', point(-1, -1), point(1, 1), { zone: 'COMMERCIAL' })}>🏢 zone C</button>
        <button onClick={() => send('SET_ZONING', point(4, -4), point(6, -2), { zone: 'INDUSTRIAL' })}>🏭 zone I</button>
      </div>
    </aside>
  );
}
