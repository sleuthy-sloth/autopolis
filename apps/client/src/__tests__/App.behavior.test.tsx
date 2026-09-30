import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SpatialGrid, generateTerrain } from '@autopolis/core';
import App from '../App';
import { installMemoryStorage } from '../../test/storage';
import { render, button } from '../../test/render';
import { MockWebSocket, installMockWebSocket, restoreMockWebSocket } from '../../test/mockWebSocket';
// Only the WebGL renderer is replaced: real App, engine hook and UI execute.
vi.mock('../engine/CityScene', () => ({ CityScene: class {
  dispose() {} replaceGrid() {} setOverlay() {} setWeather() {}
} }));
beforeEach(() => {
  installMockWebSocket(); installMemoryStorage();
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function () { this.open = true; } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function () { this.open = false; } });
});
afterEach(() => { restoreMockWebSocket(); vi.unstubAllGlobals(); document.body.innerHTML = ''; });
export function snapshot(tick = 42) {
  const grid = new SpatialGrid(64, 64); generateTerrain(grid, { seed: 1337 });
  return { type: 'world:state', tick, grid: grid.serialize(), lastSavedTick: 30,
    stats: { population: 100, zones: { residential: 10, commercial: 3, industrial: 2 },
      infrastructure: { roadTiles: 10, railTiles: 0, powerPlants: 1, waterTowers: 1, roadComponents: 1 },
      powerCoverage: 0.5, waterCoverage: 0.6, roadComponents: 1 },
    city: { treasury: 1000, taxRate: 9, weather: 'clear' }, events: [], history: [],
    resources: { power: Array(4096).fill(1), water: Array(4096).fill(1) } };
}
describe('real App city lifecycle', () => {
  it('cancels replacement without sending reset and confirms it once', () => {
    const h = render(<App />); const ws = MockWebSocket.instances.at(-1)!;
    act(() => { ws.open(); ws.message(snapshot()); });
    if (!Array.from(h.container.querySelectorAll('button')).some(b => b.textContent === 'New city')) act(() => button(h.container, 'City').click());
    act(() => button(h.container, 'New city').click());
    act(() => button(h.container.querySelector('dialog')!, 'Cancel').click());
    expect(ws.sent).toEqual([]);
    if (!Array.from(h.container.querySelectorAll('button')).some(b => b.textContent === 'New city')) act(() => button(h.container, 'City').click());
    act(() => button(h.container, 'New city').click());
    act(() => button(h.container.querySelector('dialog')!, 'New city').click());
    expect(ws.sent.map(s => JSON.parse(s))).toEqual([{ type: 'reset' }]);
    h.unmount();
  });
  it('does not load when the connection drops during confirmation', () => {
    const h = render(<App />); const ws = MockWebSocket.instances.at(-1)!;
    act(() => { ws.open(); ws.message(snapshot()); });
    act(() => button(h.container, 'City').click());
    act(() => button(h.container, 'Load saved city').click());
    act(() => ws.closeRemote());
    act(() => button(h.container.querySelector('dialog')!, 'Load saved city').click());
    expect(ws.sent).toEqual([]);
    h.unmount();
  });
});

describe('App observatory integration', () => {
  it('opens first-use help, dismisses it, and makes it reopenable', () => {
    const h = render(<App />);
    expect(h.container.querySelector('.help-panel')).not.toBeNull();
    act(() => button(h.container, 'Explore the city').click());
    expect(h.container.querySelector('.help-panel')).toBeNull();
    act(() => button(h.container, 'Help').click());
    expect(h.container.querySelector('.help-panel')).not.toBeNull();
    h.unmount();
  });
  it('keeps last-known city readable while disabling disconnected actions and overlays', () => {
    const h = render(<App />); const ws = MockWebSocket.instances.at(-1)!;
    act(() => { ws.open(); ws.message(snapshot()); });
    act(() => button(h.container, 'Intervene').click());
    expect(button(h.container, 'Power plant').matches(':disabled')).toBe(false);
    act(() => button(h.container, 'Power').click());
    act(() => ws.closeRemote());
    expect(button(h.container, 'Power plant').matches(':disabled')).toBe(true);
    expect(button(h.container, 'Power').disabled).toBe(true);
    expect(button(h.container, 'Natural').getAttribute('aria-pressed')).toBe('true');
    expect(h.container.querySelector('.metrics')?.textContent).toContain('100');
    expect(h.container.textContent).toMatch(/last received/i);
    h.unmount();
  });
  it('focuses the scrollable region when opening a content-only panel', () => {
    const h = render(<App />);
    act(() => button(h.container, 'Trends').click());
    const body = h.container.querySelector('.drawer-body')!;
    expect(document.activeElement).toBe(body);
    expect(body.getAttribute('tabindex')).toBe('0');
    expect(body.getAttribute('aria-label')).toBe('Trends content');
    h.unmount();
  });
  it('closes a drawer with Escape and returns focus to its opener', () => {
    const h = render(<App />);
    const trigger = button(h.container, 'Stories'); trigger.focus();
    act(() => trigger.click());
    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(h.container.querySelector('.drawer')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    h.unmount();
  });
});
