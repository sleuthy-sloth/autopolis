/**
 * Autopolis Core Engine — entrypoint.
 *
 * HTTP:  GET /health → JSON engine status
 * WS:    broadcast { type: 'tick', tick } every second
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
    res.end(
      JSON.stringify({
        ok: true,
        service: 'autopolis-core',
        tick: world.tick,
        grid: { width: world.grid.width, height: world.grid.height, seed: world.seed },
      }),
    );
    return;
  }
  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ ok: false, error: 'not found' }));
});

const broadcast = attachWs(server);

setInterval(() => {
  world.step();
  broadcast({ type: 'tick', tick: world.tick });
}, 1000);

server.listen(PORT, () => {
  console.log(
    `[autopolis] core engine on :${PORT} — tick 1 Hz, seed ${world.seed}, grid ${world.grid.width}x${world.grid.height}`,
  );
});
