/**
 * Charts — hand-rolled SVG telemetry (no chart library).
 * Population, treasury, and power/water coverage from the server's history
 * buffer (1 sample/sec, ~6 min window).
 */
import { useMemo } from 'react';

export interface HistoryPoint {
  tick: number;
  population: number;
  treasury: number;
  taxRate: number;
  powerCoverage: number;
  waterCoverage: number;
  roadTiles: number;
  railTiles: number;
}

const W = 272;
const H = 52;
const PAD = 2;

function sparkline(
  values: number[],
  min: number,
  max: number,
  color: string,
  fill = false,
): React.ReactNode {
  if (values.length < 2) return null;
  const span = Math.max(max - min, 1e-9);
  const pts = values.map((v, i) => {
    const x = PAD + (i / (values.length - 1)) * (W - PAD * 2);
    const y = H - PAD - ((v - min) / span) * (H - PAD * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const line = <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="1.4" strokeLinejoin="round" />;
  if (!fill) return line;
  const area = `${PAD},${H - PAD} ${pts.join(' ')} ${W - PAD},${H - PAD}`;
  return (
    <>
      {line}
      <polygon points={area} fill={color} opacity="0.12" />
    </>
  );
}

function Panel({ label, children, right }: { label: string; children: React.ReactNode; right?: string }) {
  return (
    <div className="chart">
      <div className="chart-head">
        <span className="chart-label">{label}</span>
        {right && <span className="chart-right">{right}</span>}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="chart-svg">
        {children}
      </svg>
    </div>
  );
}

export function Charts({ history }: { history: HistoryPoint[] }) {
  const pop = useMemo(() => history.map((h) => h.population), [history]);
  const treasury = useMemo(() => history.map((h) => h.treasury), [history]);
  const power = useMemo(() => history.map((h) => h.powerCoverage * 100), [history]);
  const water = useMemo(() => history.map((h) => h.waterCoverage * 100), [history]);

  if (history.length < 2) {
    return (
      <div className="charts-panel panel">
        <h3>TELEMETRY</h3>
        <p className="muted">Collecting data…</p>
      </div>
    );
  }

  const popMax = Math.max(...pop);
  const popMin = Math.min(...pop);
  const trMax = Math.max(...treasury);
  const trMin = Math.min(...treasury);

  return (
    <div className="charts-panel panel">
      <h3>TELEMETRY</h3>
      <Panel label="POPULATION" right={`${popMax.toLocaleString()}`}>
        {sparkline(pop, 0, Math.max(popMax, 1), '#6fae4f', true)}
      </Panel>
      <Panel label="TREASURY" right={`${Math.round(trMax).toLocaleString()}¤`}>
        {sparkline(treasury, 0, Math.max(trMax, 1), '#e8c15a', true)}
      </Panel>
      <Panel label="COVERAGE" right={`⚡${power[power.length - 1].toFixed(0)}% 💧${water[water.length - 1].toFixed(0)}%`}>
        {sparkline(power, 0, 100, '#5fd0ff')}
        {sparkline(water, 0, 100, '#45aaf2')}
      </Panel>
    </div>
  );
}
