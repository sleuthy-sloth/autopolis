/**
 * WebSocket bridge — the client ↔ engine channel.
 * Phase 1 broadcasts tick state; Phase 3 adds agent actions flowing the other way.
 */
import type { Server } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';

type Message = Record<string, unknown>;

export function attachWs(server: Server): (msg: Message) => void {
  const wss = new WebSocketServer({ server });
  const clients = new Set<WebSocket>();

  wss.on('connection', (socket) => {
    clients.add(socket);
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
