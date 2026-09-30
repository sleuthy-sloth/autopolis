import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SpatialGrid } from '@autopolis/core';
import { GodPanel } from '../ui/GodPanel';
import { render, button, changeRange } from '../../test/render';
afterEach(() => { document.body.innerHTML = ''; });
function setup(disabled = false) {
  const props = { grid: new SpatialGrid(64, 64), taxRate: 9, weather: 'clear' as const,
    disabled, onAction: vi.fn(), onGrant: vi.fn(), onWeather: vi.fn(), onDisaster: vi.fn() };
  return { props, ...render(<GodPanel {...props} />) };
}
describe('intervention reliability', () => {
  it('disables every engine action while disconnected', () => {
    const h = setup(true);
    for (const b of h.container.querySelectorAll('button')) {
      expect(b.matches(':disabled')).toBe(true);
      act(() => b.click());
    }
    expect(h.props.onAction).not.toHaveBeenCalled();
    expect(h.props.onGrant).not.toHaveBeenCalled();
    expect(h.props.onWeather).not.toHaveBeenCalled();
    expect(h.props.onDisaster).not.toHaveBeenCalled();
    h.unmount();
  });
  it('applies a keyboard-editable tax draft exactly once', () => {
    const h = setup();
    changeRange(h.container.querySelector('input')!, '11');
    expect(h.props.onAction).not.toHaveBeenCalled();
    act(() => button(h.container, 'Apply tax').click());
    expect(h.props.onAction).toHaveBeenCalledTimes(1);
    expect(h.props.onAction.mock.calls[0][0]).toMatchObject({ action: 'ADJUST_TAX_RATE', metadata: { tax_rate: 11 } });
    h.unmount();
  });
  it('preserves drafts on unrelated updates and follows a changed authoritative tax', () => {
    const h = setup();
    changeRange(h.container.querySelector('input')!, '11');
    h.rerender(<GodPanel {...h.props} weather="rain" />);
    expect(h.container.querySelector('input')!.value).toBe('11');
    h.rerender(<GodPanel {...h.props} taxRate={12} />);
    expect(h.container.querySelector('input')!.value).toBe('12');
    h.unmount();
  });
});
