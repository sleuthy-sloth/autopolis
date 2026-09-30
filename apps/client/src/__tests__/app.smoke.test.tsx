import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { render, button } from '../../test/render';
import { installMemoryStorage } from '../../test/storage';
import { MockWebSocket, installMockWebSocket, restoreMockWebSocket } from '../../test/mockWebSocket';
vi.mock('../engine/CityScene', () => ({ CityScene: class {
  dispose() {} replaceGrid() {} setOverlay() {} setWeather() {}
} }));
beforeEach(() => {
  installMockWebSocket(); installMemoryStorage();
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function () { this.open = true; } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function () { this.open = false; } });
});
afterEach(() => { restoreMockWebSocket(); vi.unstubAllGlobals(); document.body.innerHTML = ''; });
describe('App terrain-preview smoke flow', () => {
  it('can regenerate local terrain without sending an unavailable engine action', () => {
    const h = render(<App />);
    act(() => button(h.container, 'City').click());
    const seedBefore = h.container.querySelector('.world-details dd')!.textContent;
    act(() => button(h.container, 'New city').click());
    act(() => button(h.container.querySelector('dialog')!, 'New city').click());
    expect(h.container.querySelector('.world-details dd')!.textContent).not.toBe(seedBefore);
    expect(MockWebSocket.instances.at(-1)!.sent).toEqual([]);
    expect(h.container.querySelector('.viewport')).not.toBeNull();
    h.unmount();
  });
});
