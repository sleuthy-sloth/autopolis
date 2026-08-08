import { useCallback, useEffect, useRef, useState } from 'react';

export type ServerStatus = 'connecting' | 'connected' | 'offline';

export interface EngineMessage {
  type?: string;
  tick?: number;
  grid?: unknown;
  stats?: unknown;
  resources?: unknown;
}

/**
 * Connects to the Autopolis core engine (apps/server).
 * - `tick` heartbeats arrive every second once the city is static.
 * - `world:state` carries the authoritative grid + stats + resource grids.
 * - `send({ type: 'reset' })` asks the engine to regenerate the world.
 */
export function useEngine(
  url: string,
  onState: (msg: EngineMessage) => void,
): { status: ServerStatus; tick: number | null; send: (msg: unknown) => void } {
  const [status, setStatus] = useState<ServerStatus>('connecting');
  const [tick, setTick] = useState<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const onStateRef = useRef(onState);
  onStateRef.current = onState;

  useEffect(() => {
    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket(url);
    } catch {
      setStatus('offline');
      return;
    }
    wsRef.current = ws;

    ws.onopen = () => setStatus('connected');
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string) as EngineMessage;
        if (msg.type === 'tick' && typeof msg.tick === 'number') setTick(msg.tick);
        else if (msg.type === 'world:state') onStateRef.current(msg);
      } catch {
        /* non-JSON frame — ignore */
      }
    };
    ws.onerror = () => setStatus('offline');
    ws.onclose = () => setStatus('offline');

    return () => {
      wsRef.current = null;
      ws?.close();
    };
  }, [url]);

  const send = useCallback((msg: unknown): void => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }, []);

  return { status, tick, send };
}
