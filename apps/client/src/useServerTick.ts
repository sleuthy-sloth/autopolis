import { useEffect, useState } from 'react';

export type ServerStatus = 'connecting' | 'connected' | 'offline';

/**
 * Connects to the Autopolis core engine (apps/server) and tracks its tick.
 * The viewport runs standalone if the engine is down — the HUD just reports offline.
 */
export function useServerTick(url: string): { status: ServerStatus; tick: number | null } {
  const [status, setStatus] = useState<ServerStatus>('connecting');
  const [tick, setTick] = useState<number | null>(null);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let closed = false;

    try {
      ws = new WebSocket(url);
    } catch {
      setStatus('offline');
      return;
    }

    ws.onopen = () => setStatus('connected');
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string) as { type?: string; tick?: number };
        if (msg.type === 'tick' && typeof msg.tick === 'number') setTick(msg.tick);
      } catch {
        /* non-JSON frame — ignore */
      }
    };
    ws.onerror = () => setStatus('offline');
    ws.onclose = () => {
      if (!closed) setStatus('offline');
    };

    return () => {
      closed = true;
      ws?.close();
    };
  }, [url]);

  return { status, tick };
}
