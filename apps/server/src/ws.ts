/**
 * WebSocket bridge — the client ↔ engine channel.
 *
 * Downstream (engine → client): full `world:state` on connect and whenever the
 * grid changes; lightweight `tick` heartbeats in between.
 * Upstream (client → engine): `{ type: 'reset' }` regenerates the world.
 */
import type { Server } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';

type Message = Record<string, unknown>;

export interface WsHandlers {
  onConnect: () => Message;
  onReset: () => void;
}

export function attachWs(server: Server, handlers: WsHandlers): (msg: Message) => void {
  const wss = new WebSocketServer({ server });
  const clients = new Set<WebSocket>();

  wss.on('connection', (socket) => {
    clients.add(socket);
    socket.send(JSON.stringify(handlers.onConnect()));
    socket.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString()) as { type?: string };
        if (msg.type === 'reset') handlers.onReset();
      } catch {
        /* non-JSON frame — ignore */
      }
    });
    socket.on('close', () => clients.delete(socket));
    socket.on('error', () => clients.delete(socket));
  });

  return (msg: Message): void => {
    const data = JSON.stringify(msg);
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) client.send(data);
    }
  };
}
