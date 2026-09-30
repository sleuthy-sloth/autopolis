import { describe, expect, it } from 'vitest';
import { StoriesPanel } from '../ui/StoriesPanel';
import { render } from '../../test/render';
describe('city stories', () => {
  it('keeps every supplied event readable including long decisions', () => {
    const long = 't120 city_planner_01: '.concat('Connecting districts and extending infrastructure. '.repeat(10));
    const h = render(<StoriesPanel events={[long, 'two', 'three', 'four', 'five', 'six', 'seven', 'eight']} tick={120} connected />);
    expect(h.container.querySelectorAll('li')).toHaveLength(8);
    expect(h.container.textContent).toContain(long);
    h.unmount();
  });
  it('explains planner timing then decisions, with an offline override', () => {
    const h = render(<StoriesPanel events={[]} tick={20} connected />);
    expect(h.container.textContent).toMatch(/two minutes/i);
    h.rerender(<StoriesPanel events={[]} tick={150} connected />);
    expect(h.container.textContent).toMatch(/decisions.*appear/i);
    h.rerender(<StoriesPanel events={[]} tick={20} connected={false} />);
    expect(h.container.textContent).toMatch(/connect/i);
    h.unmount();
  });
});
