/**
 * useEngine smoke tests — WebSocket status lifecycle.
 *
 * Drives the real hook with a mocked WebSocket double (see
 * apps/client/test/mockWebSocket.ts): connection open, malformed frames,
 * tick/world:state messages, error/close → reconnecting with exponential
 * backoff, backoff reset on reconnect, URL-failure → offline, and the
 * send/godAction/command wire format.
 *
 * No Three.js / canvas involved — this test never touches the viewport.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useEffect } from 'react';
import { useEngine, type EngineMessage, type ServerStatus } from '../useEngine';
import {
  MockWebSocket,
  installMockWebSocket,
  restoreMockWebSocket,
} from '../../test/mockWebSocket';

type Engine = ReturnType<typeof useEngine>;

function transitions(records: Array<{ status: ServerStatus }>): ServerStatus[] {
  const out: ServerStatus[] = [];
  for (const r of records) {
    if (out[out.length - 1] !== r.status) out.push(r.status);
  }
  return out;
}

/** Render a host component bound to the real useEngine hook. */
function mountHarness(url: string, onState?: (msg: EngineMessage) => void) {
  const statuses: Array<{ status: ServerStatus; tick: number | null }> = [];
  const bridge: Partial<Engine> = {};
  const container = document.createElement('div');
  document.body.appendChild(container);
  let root!: Root;

  function Host() {
    const engine = useEngine(url, onState ?? (() => {}));
    useEffect(() => {
      Object.assign(bridge, engine);
      statuses.push({ status: engine.status, tick: engine.tick });
    });
    return (
      <>
        <div data-testid="status">{engine.status}</div>
        <div data-testid="tick">{engine.tick ?? 'null'}</div>
      </>
    );
  }

  act(() => {
    root = createRoot(container);
    root.render(<Host />);
  });

  return {
    root,
    container,
    statuses,
    bridge,
    statusText: () => container.querySelector('[data-testid="status"]')?.textContent ?? '',
    tickText: () => container.querySelector('[data-testid="tick"]')?.textContent ?? '',
    ws: () => MockWebSocket.instances[MockWebSocket.instances.length - 1],
  };
}

describe('useEngine — WebSocket status transitions', () => {
  beforeEach(() => {
    installMockWebSocket();
    vi.useFakeTimers();
  });

  afterEach(() => {
    restoreMockWebSocket();
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('starts connecting and reaches connected on open', () => {
    const h = mountHarness('ws://localhost:8788');
    expect(h.statusText()).toBe('connecting');

    act(() => {
      h.ws().open();
    });

    expect(h.statusText()).toBe('connected');
    expect(transitions(h.statuses)).toEqual(['connecting', 'connected']);
  });

  it('drops to reconnecting on error and close, then reconnects', () => {
    const h = mountHarness('ws://localhost:8788');
    act(() => {
      h.ws().open();
    });
    expect(h.statusText()).toBe('connected');

    // error alone maps to reconnecting (onclose drives the retry schedule)
    act(() => {
      h.ws().fail();
    });
    expect(h.statusText()).toBe('reconnecting');

    // explicit close: already reconnecting, and the 1000ms retry is scheduled
    act(() => {
      h.ws().closeRemote();
    });
    expect(h.statusText()).toBe('reconnecting');

    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(MockWebSocket.instances.length).toBe(2);
    expect(MockWebSocket.instances[1].url).toBe('ws://localhost:8788');

    act(() => {
      MockWebSocket.instances[1].open();
    });
    expect(h.statusText()).toBe('connected');
    expect(transitions(h.statuses)).toEqual([
      'connecting',
      'connected',
      'reconnecting',
      'connected',
    ]);
  });

  it('resets the backoff after a successful reconnect', () => {
    const h = mountHarness('ws://localhost:8788');
    act(() => {
      h.ws().open();
      h.ws().closeRemote();
    });
    // first drop: 1000ms
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(MockWebSocket.instances.length).toBe(2);
    act(() => {
      MockWebSocket.instances[1].open(); // success → retries reset to 0
      MockWebSocket.instances[1].closeRemote(); // drop again
    });
    // backoff must be 1000ms again, not 2000ms
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(MockWebSocket.instances.length).toBe(3);
  });

  it('goes offline when the WebSocket constructor throws (bad URL)', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    MockWebSocket.throwOnNext = true;
    const h = mountHarness('ws://definitely-bad-url');
    expect(h.statusText()).toBe('offline');
    expect(transitions(h.statuses)).toEqual(['connecting', 'offline']);
    err.mockRestore();
  });

  it('survives malformed frames and keeps the connection', () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const h = mountHarness('ws://localhost:8788');
    act(() => {
      h.ws().open();
      h.ws().messageRaw('this is {{{ not json');
    });
    expect(h.statusText()).toBe('connected');
    expect(debug).toHaveBeenCalled();
    debug.mockRestore();

    // connection still usable afterwards
    act(() => {
      h.ws().message({ type: 'tick', tick: 42 });
    });
    expect(h.statusText()).toBe('connected');
    expect(h.tickText()).toBe('42');
  });

  it('routes tick → tick state and world:state → onState callback', () => {
    const onState = vi.fn();
    const h = mountHarness('ws://localhost:8788', onState);
    act(() => {
      h.ws().open();
      h.ws().message({ type: 'tick', tick: 7 });
    });
    expect(h.tickText()).toBe('7');

    const world: EngineMessage = { type: 'world:state', grid: { width: 8, height: 8 } };
    act(() => {
      h.ws().message(world);
    });
    expect(onState).toHaveBeenCalledWith(world);
  });

  it('send only fires when the socket is open, with the expected wire format', () => {
    const h = mountHarness('ws://localhost:8788');

    // not open yet → dropped silently
    act(() => {
      h.bridge.send?.({ type: 'reset' });
    });
    expect(h.ws().sent).toEqual([]);

    act(() => {
      h.ws().open();
    });
    expect(h.statusText()).toBe('connected');

    act(() => {
      h.bridge.send?.({ type: 'reset' });
      h.bridge.godAction?.({
        action: 'BUILD_ROAD',
        coordinates: { from: [1, 2], to: [3, 4] },
      });
      h.bridge.command?.('grant', 1000);
    });
    expect(h.ws().sent).toHaveLength(3);
    expect(h.ws().sent[0]).toBe('{"type":"reset"}');
    const god = JSON.parse(h.ws().sent[1]) as Record<string, unknown>;
    expect(god.type).toBe('god');
    expect((god.action as { agent_id: string }).agent_id).toBe('god');
    expect(JSON.parse(h.ws().sent[2])).toEqual({ type: 'command', command: 'grant', amount: 1000 });
  });

  it('closes the socket on unmount', () => {
    const h = mountHarness('ws://localhost:8788');
    act(() => {
      h.root.unmount();
    });
    expect(h.ws().readyState).toBe(MockWebSocket.CLOSED);
  });
});