/**
 * Client test setup — runs before every test file in the `client` vitest
 * project (jsdom environment).
 *
 * - Marks the environment as React-act-ready (React 19 requires
 *   IS_REACT_ACT_ENVIRONMENT to be set for `act(...)` to drive commits).
 * - Polyfills requestAnimationFrame (jsdom does not implement it). The Canvas
 *   smoke tests skip entirely when WebGL is unavailable, so this polyfill only
 *   keeps React/Three imports happy in environments that DO have WebGL.
 */
import { afterEach, vi } from 'vitest';

declare global {
  interface Window {
    IS_REACT_ACT_ENVIRONMENT: boolean;
  }
}

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(window as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

if (typeof globalThis.requestAnimationFrame !== 'function') {
  // Minimal stub — never actually scheduled in jsdom-only test runs.
  const raf = (cb: FrameRequestCallback): number => setTimeout(() => cb(performance.now()), 16) as unknown as number;
  const caf = (id: number): void => clearTimeout(id);
  globalThis.requestAnimationFrame = raf;
  globalThis.cancelAnimationFrame = caf;
}

afterEach(() => {
  // Keep stray act()-driven updates from leaking between tests.
  vi.restoreAllMocks();
});