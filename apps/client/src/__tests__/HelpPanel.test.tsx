import { afterEach, describe, expect, it, vi } from 'vitest';
import { HelpPanel, readHelpPreference, dismissHelpPreference } from '../ui/HelpPanel';
import { render } from '../../test/render';
import { installMemoryStorage } from '../../test/storage';
afterEach(() => vi.unstubAllGlobals());
describe('first-use help', () => {
  it('remembers dismissal and survives browser storage exceptions', () => {
    const storage = installMemoryStorage();
    expect(readHelpPreference()).toBe(true);
    dismissHelpPreference(); expect(readHelpPreference()).toBe(false);
    vi.spyOn(storage, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    vi.spyOn(storage, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    expect(readHelpPreference()).toBe(true);
    expect(() => dismissHelpPreference()).not.toThrow();
  });
  it('distinguishes a terrain preview from a disconnected existing city', () => {
    const h = render(<HelpPanel status="reconnecting" hasWorld={false} onDismiss={() => {}} />);
    expect(h.container.textContent).toMatch(/terrain preview/i);
    expect(h.container.textContent).toContain('npm run dev');
    h.rerender(<HelpPanel status="reconnecting" hasWorld onDismiss={() => {}} />);
    expect(h.container.textContent).toMatch(/last received city/i);
    expect(h.container.textContent).toMatch(/default planner/i);
    h.unmount();
  });
});
