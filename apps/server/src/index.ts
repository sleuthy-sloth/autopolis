/**
 * Autopolis Core Engine — entrypoint.
 *
 * HTTP:  GET /health → JSON engine status + city stats
 * WS:    world:state on connect/grid-change, tick heartbeats at 1 Hz;
 *        accepts { type: 'reset' } from clients
 *
 * Port via PORT env (default 8788), world seed via SEED env (default 1337).
 */
import http from 'node:http';
import { World } from './world';
import { attachWs } from './ws';

const PORT = Number(process.env.PORT ?? 8788);
const SEED = Number(process.env.SEED ?? 1337);

const world = new World(SEED);

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(world.health()));
    return;
  }
  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ ok: false, error: 'not found' }));
});

const broadcast = attachWs(server, {
  onConnect: () => world.stateMessage(),
  onReset: () => {
    world.reset();
    broadcast(world.stateMessage());
  },
});

setInterval(() => {
  const changed = world.step();
  if (changed) broadcast(world.stateMessage());
  else broadcast({ type: 'tick', tick: world.tick });
}, 1000);

server.listen(PORT, () => {
  console.log(
    `[autopolis] core engine on :${PORT} — tick 1 Hz, seed ${world.seed}, grid ${world.grid.width}x${world.grid.height}`,
  );
});
