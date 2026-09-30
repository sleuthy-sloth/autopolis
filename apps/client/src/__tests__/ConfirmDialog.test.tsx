import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { render, button } from '../../test/render';
beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function () { this.open = true; } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function () { this.open = false; } });
});
function setup() {
  const props = { title: 'New city?', description: 'Unsaved progress may be lost.', confirmLabel: 'New city', onCancel: vi.fn(), onConfirm: vi.fn(), onFocusFallback: vi.fn() };
  return { props, ...render(<ConfirmDialog {...props} />) };
}
describe('replacement confirmation', () => {
  it('cancel and Escape never accept the destructive action', () => {
    const h = setup();
    act(() => button(h.container, 'Cancel').click());
    act(() => h.container.querySelector('dialog')!.dispatchEvent(new Event('cancel', { cancelable: true })));
    expect(h.props.onCancel).toHaveBeenCalledTimes(2);
    expect(h.props.onConfirm).not.toHaveBeenCalled();
    h.unmount();
  });
  it('wraps keyboard focus between the two confirmation actions', () => {
    const h = setup();
    const cancel = button(h.container, 'Cancel');
    const confirm = button(h.container, 'New city');
    act(() => cancel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })));
    expect(document.activeElement).toBe(confirm);
    act(() => confirm.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })));
    expect(document.activeElement).toBe(cancel);
    h.unmount();
  });
  it('confirmation emits the replacement once', () => {
    const h = setup();
    act(() => button(h.container, 'New city').click());
    expect(h.props.onConfirm).toHaveBeenCalledTimes(1);
    h.unmount();
  });
  it.each(['button', 'fieldset'])('uses a fallback when the opener becomes disabled by %s', kind => {
    const fieldset = document.createElement('fieldset');
    const opener = document.createElement('button');
    fieldset.appendChild(opener); document.body.appendChild(fieldset); opener.focus();
    const h = setup();
    if (kind === 'button') opener.disabled = true; else fieldset.disabled = true;
    h.unmount();
    expect(h.props.onFocusFallback).toHaveBeenCalledTimes(1);
    fieldset.remove();
  });
  it('restores focus to an existing opener or safe fallback', () => {
    const opener = document.createElement('button'); document.body.appendChild(opener); opener.focus();
    const h = setup(); h.unmount(); expect(document.activeElement).toBe(opener);
    opener.focus(); const next = setup(); opener.remove(); next.unmount();
    expect(next.props.onFocusFallback).toHaveBeenCalledTimes(1);
  });
});
