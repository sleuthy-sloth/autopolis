import { useCallback, useEffect, useRef, useState } from 'react';

export type ServerStatus = 'connecting' | 'connected' | 'reconnecting' | 'offline';

export interface EngineMessage {
  type?: string;
  tick?: number;
  grid?: unknown;
  stats?: unknown;
  resources?: unknown;
  city?: unknown;
  events?: unknown;
  history?: unknown;
}

/** Max delay between reconnect attempts (exponential backoff ceiling). */
const MAX_RECONNECT_DELAY_MS = 30_000;

/**
 * WebSocket endpoint for the Autopolis core engine (apps/server).
 * VITE_AUTOPOLIS_WS_URL overrides the dev default — the URL is only
 * hardcoded here, never in components.
 */
const DEFAULT_WS_URL = import.meta.env.VITE_AUTOPOLIS_WS_URL ?? 'ws://localhost:8788';

/**
 * Connects to the Autopolis core engine (apps/server).
 * - `tick` heartbeats arrive every second once the city is static.
 * - `world:state` carries the authoritative grid + stats + resource grids.
 * - `send({ type: 'reset' })` asks the engine to regenerate the world.
 * - `godAction(action)` issues a human AgentAction through the same Zod
 *   contract the LLM agents use (executor, treasury, newsfeed all apply).
 * - `command('grant', amount)` injects treasury.
 *
 * Drops are retried with exponential backoff (1s → 2s → 4s … capped at
 * 30s); the backoff resets to 1s whenever a connection opens.
 */
export function useEngine(
  url: string = DEFAULT_WS_URL,
  onState: (msg: EngineMessage) => void,
): {
  status: ServerStatus;
  tick: number | null;
  send: (msg: unknown) => void;
  godAction: (action: {
    action: string;
    coordinates: { from: [number, number]; to: [number, number] };
    metadata?: Record<string, string | number | boolean>;
    reasoning?: string;
  }) => void;
  command: (command: string, amount?: number, value?: string) => void;
} {
  const [status, setStatus] = useState<ServerStatus>('connecting');
  const [tick, setTick] = useState<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const malformedRef = useRef(0);
  const onStateRef = useRef(onState);
  onStateRef.current = onState;

  useEffect(() => {
    let disposed = false;
    let retries = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const scheduleReconnect = () => {
      if (disposed || timer !== null) return;
      const delay = Math.min(MAX_RECONNECT_DELAY_MS, 1_000 * 2 ** retries);
      retries += 1;
      console.debug(`[engine] reconnecting to ${url} in ${delay}ms (attempt ${retries})`);
      timer = setTimeout(() => {
        timer = null;
        connect();
      }, delay);
    };

    const connect = () => {
      if (disposed) return;
      let ws: WebSocket;
      try {
        ws = new WebSocket(url);
      } catch (err) {
        // Unrecoverable (e.g. malformed URL) — no point retrying in a loop.
        console.error(`[engine] unable to open WebSocket to ${url}:`, err);
        setStatus('offline');
        return;
      }
      wsRef.current = ws;

      ws.onopen = () => {
        retries = 0; // reset backoff — we're connected again
        setStatus('connected');
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data as string) as EngineMessage;
          if (msg.type === 'tick' && typeof msg.tick === 'number') setTick(msg.tick);
          else if (msg.type === 'world:state') onStateRef.current(msg);
        } catch {
          malformedRef.current += 1;
          const preview = String(ev.data).slice(0, 80).replace(/\s+/g, ' ');
          console.debug(
            `[engine] dropped non-JSON frame #${malformedRef.current} from ${url}: "${preview}"`,
          );
        }
      };
      // onerror is typically followed by onclose; let onclose drive the state.
      ws.onerror = () => setStatus('reconnecting');
      ws.onclose = () => {
        if (disposed) return;
        wsRef.current = null;
        setStatus('reconnecting');
        scheduleReconnect();
      };
    };

    connect();

    return () => {
      disposed = true;
      if (timer !== null) clearTimeout(timer);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [url]);

  const send = useCallback((msg: unknown): void => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }, []);

  const godAction = useCallback(
    (action: {
      action: string;
      coordinates: { from: [number, number]; to: [number, number] };
      metadata?: Record<string, string | number | boolean>;
      reasoning?: string;
    }): void => {
      send({ type: 'god', action: { agent_id: 'god', ...action } });
    },
    [send],
  );

  const command = useCallback(
    (command: string, amount?: number, value?: string): void => {
      send({ type: 'command', command, amount, value });
    },
    [send],
  );

  return { status, tick, send, godAction, command };
}