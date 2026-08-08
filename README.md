# Autopolis

An emergent city simulation where autonomous AI agents — Mayor, City Planner, Private Developers, and Citizens — procedurally construct, govern, and evolve a city grid in real time, while humans watch from god-mode.

## Architecture (3-tier, decoupled)

```
┌─────────────────────────────────────────────────────────┐
│              Autopolis Client (Browser)                  │
│   Three.js Viewport (60 FPS) + React HUD / Newsfeed     │
└───────────────────────────┬─────────────────────────────┘
                            │ WebSockets (ws://localhost:8788)
┌───────────────────────────▼─────────────────────────────┐
│            Autopolis Core Engine (Server)                │
│   Deterministic Tick Loop (1 Hz) & Spatial Grid Graph    │
└───────────────────────────┬─────────────────────────────┘
                            │ Async Event Stream
┌───────────────────────────▼─────────────────────────────┐
│               Agent Reasoning Pipeline                   │
│    LLM Service (Ollama / DeepSeek API) + Zod Schemas    │
└─────────────────────────────────────────────────────────┘
```

| Tier | Tech | Why |
|---|---|---|
| Viewport | Vite + React 19 + Three.js (InstancedMesh) | 60 FPS rendering; instancing keeps 4k+ tiles to 1 draw call |
| Core engine | Node.js + TypeScript (`@autopolis/core` shared package) | Deterministic sim; one language across tiers; core types shared with client |
| Agent pipeline | Ollama / DeepSeek API + Zod (Phase 3) | Local-first (Ollama on homelab) with cloud fallback |

Chose **Vite over Next.js** (pure client 3D app — no SSR value) and **Node over FastAPI** (shared TS types/Zod schemas between engine and agent pipeline; the LLM call is language-agnostic).

## Repo layout

```
autopolis/
├── packages/core/        Deterministic engine core — pure TS, zero deps, no DOM
│   ├── src/
│   │   ├── grid.ts       SpatialGrid: flat typed arrays + spatial index, neighbors, serialize
│   │   ├── tiles.ts      TileType registry + palette (water/sand/grass/forest/stone/dirt)
│   │   ├── rng.ts        mulberry32 + deterministic 2D hash (seedable, reproducible)
│   │   ├── noise.ts      Value noise + fBm (no deps)
│   │   ├── terrain.ts    Seeded island terrain generation
│   │   └── snapshot.ts   grid → LLM-ready matrix snapshot (used in Phase 3)
│   └── test/             vitest: grid ops, determinism, round-trips
├── apps/client/          Vite + React + Three.js viewport (port 5173)
│   └── src/engine/       CityScene: instanced tiles, grid lines, raycast picking, selection ring
└── apps/server/          Node core engine (port 8788): 1 Hz tick, WS broadcast, /health
```

## Quickstart

```bash
npm install
npm run dev          # engine on :8788, viewport on http://localhost:5173
npm test             # core engine unit tests
npm run typecheck    # all workspaces
npm run build        # client production bundle + server typecheck
```

## Determinism

Everything in `packages/core` is seedable and side-effect free. The same seed always
produces the same terrain, and later the same tick sequence — required for reproducible
agent runs and server-authoritative state.

## Roadmap

- [x] **Phase 1 — Project Setup & Spatial Grid Engine** (current): monorepo scaffold, 2D
      spatial grid matrix, seeded terrain, Three.js grid renderer with raycast tile selection
- [ ] **Phase 2 — Simulation Core & Pathfinding**: road network graph + A*, resource grids
      (power, water, zoning R/C/I)
- [ ] **Phase 3 — Agent Orchestration**: async agent tick runner, strict JSON validation
      (Zod), prompt templates for City Planner / Developer agents

  Agent actions (Phase 3 contract):
  `EXTEND_ROAD | SET_ZONING | BUILD_STRUCTURE | UPGRADE_INFRASTRUCTURE | ADJUST_TAX_RATE`

## Ports

- `5173` — viewport (Vite dev server)
- `8788` — core engine (HTTP + WebSocket). Override with `PORT`.

## Notes

- Client runs standalone (self-generates terrain); when the engine is up it connects and
  the HUD shows live tick state. Phase 2 makes the engine authoritative.
- Engine seed: `SEED` env var (default `1337`).
