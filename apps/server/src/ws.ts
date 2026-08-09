/**
 * ws.ts — WebSocket bridge between the engine and the viewport.
 *
 * Out:  `world:state` (full sync on connect + when the grid changes),
 *       `tick` heartbeats at 1 Hz.
 * In:   { type: 'reset' }            — reseed the world
 *       { type: 'god', action }      — a human-issued AgentAction (same contract
 *                                      the LLM agents use; agent_id 'god')
 *       { type: 'command', command, amount } — god-mode commands ('grant')
 */
import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'node:http';
import type { AgentAction } from '@autopolis/core';

export interface WsHandlers {
  onConnect: () => unknown;
  onReset: () => void;
  onGodAction: (action: AgentAction) => void;
  onCommand: (command: string, amount?: number) => void;
}

export function attachWs(server: Server, handlers: WsHandlers): (msg: unknown) => void {
  const wss = new WebSocketServer({ server });
  const clients = new Set<WebSocket>();

  wss.on('connection', (socket) => {
    clients.add(socket);
    socket.send(JSON.stringify({ type: 'world:state', ...(handlers.onConnect() as object) }));
    socket.on('message', (raw) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (msg.type === 'reset') {
        handlers.onReset();
      } else if (msg.type === 'god') {
        handlers.onGodAction(msg.action as AgentAction);
      } else if (msg.type === 'command') {
        handlers.onCommand(String(msg.command ?? ''), Number(msg.amount ?? 0));
      }
    });
    socket.on('close', () => clients.delete(socket));
  });

  return (msg: unknown) => {
    const data = JSON.stringify(msg);
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) client.send(data);
    }
  };
}
