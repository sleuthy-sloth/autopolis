import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
export function render(node: ReactNode) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(node));
  return { container, rerender: (next: ReactNode) => act(() => root.render(next)),
    unmount: () => { act(() => root.unmount()); container.remove(); } };
}
export function button(container: HTMLElement, name: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.trim() === name);
  if (!found) throw new Error(`Missing button: ${name}`);
  return found;
}
export function changeRange(input: HTMLInputElement, value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
