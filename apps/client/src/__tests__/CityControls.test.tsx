import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { CityControls } from '../ui/CityControls';
import { render, button } from '../../test/render';
describe('city save availability', () => {
  it('disables engine persistence offline and load without a known snapshot', () => {
    const props = { connected: false, lastSavedTick: null, diagnostics: null, onSave: vi.fn(), onLoad: vi.fn(), onNewCity: vi.fn() };
    const h = render(<CityControls {...props} />);
    expect(button(h.container, 'Save city').disabled).toBe(true);
    expect(button(h.container, 'Load saved city').disabled).toBe(true);
    h.rerender(<CityControls {...props} connected />);
    expect(button(h.container, 'Save city').disabled).toBe(false);
    expect(button(h.container, 'Load saved city').disabled).toBe(true);
    h.rerender(<CityControls {...props} connected lastSavedTick={42} />);
    expect(button(h.container, 'Load saved city').disabled).toBe(false);
    act(() => button(h.container, 'Save city').click());
    expect(props.onSave).toHaveBeenCalledTimes(1);
    expect(h.container.textContent).toContain('42');
    h.unmount();
  });
});
