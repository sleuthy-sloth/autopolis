import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { HUD } from '../ui/HUD';
import { render, button } from '../../test/render';
function props() {
  return { selection: null, cityStats: null, city: null, serverStatus: 'connected' as const,
    hasWorld: false, overlay: 'none' as const, hasResources: false, activePanel: null,
    onPanelChange: vi.fn(), onOverlayChange: vi.fn(), panelContent: null };
}
describe('observatory shell', () => {
  it('shows unavailable metrics rather than inventing city values', () => {
    const h = render(<HUD {...props()} />);
    expect(Array.from(h.container.querySelectorAll('.metric-value')).map(e => e.textContent)).toEqual(['—','—','—','—']);
    expect(h.container.querySelector('.tile-inspector')).toBeNull();
    h.unmount();
  });
  it('starts a different panel at the top instead of retaining the previous scroll position', () => {
    const p = props(); const h = render(<HUD {...p} activePanel="stories" panelContent={<p>Stories</p>} />);
    const body = h.container.querySelector<HTMLElement>('.drawer-body')!;
    body.scrollTop = 100;
    h.rerender(<HUD {...p} activePanel="help" panelContent={<p>Help</p>} />);
    expect(body.scrollTop).toBe(0);
    h.unmount();
  });
  it('selects panels and overlays explicitly and disables missing resource data', () => {
    const p = props(); const h = render(<HUD {...p} />);
    expect(button(h.container, 'Power').disabled).toBe(true);
    act(() => button(h.container, 'Stories').click());
    expect(p.onPanelChange).toHaveBeenCalledWith('stories');
    h.rerender(<HUD {...p} activePanel="stories" hasResources overlay="power" panelContent={<p>A complete decision</p>} />);
    expect(button(h.container, 'Stories').getAttribute('aria-pressed')).toBe('true');
    expect(button(h.container, 'Power').getAttribute('aria-pressed')).toBe('true');
    act(() => button(h.container, 'Water').click());
    expect(p.onOverlayChange).toHaveBeenCalledWith('water');
    expect(h.container.querySelectorAll('.drawer')).toHaveLength(1);
    h.unmount();
  });
});
