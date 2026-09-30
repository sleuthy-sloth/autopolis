import { describe, expect, it } from 'vitest';
import { Charts, type HistoryPoint } from '../ui/Charts';
import { render } from '../../test/render';
describe('city trends', () => {
  it('labels current values rather than historical peaks after spending and population decline', () => {
    const first: HistoryPoint = { tick: 1, population: 200, treasury: 1000, taxRate: 9, powerCoverage: 0.5, waterCoverage: 0.6, roadTiles: 20, railTiles: 0 };
    const h = render(<Charts history={[first, { ...first, tick: 2, population: 100, treasury: 500 }]} />);
    const values = Array.from(h.container.querySelectorAll('.chart-right')).map(e => e.textContent);
    expect(values[0]).toBe('100'); expect(values[1]).toBe('500¤');
    expect(h.container.querySelector('svg')?.getAttribute('aria-label')).toMatch(/population/i);
    h.unmount();
  });
});
