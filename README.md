# ◈ Autopolis

### Emergent city simulation — autonomous AI agents build a city while you watch from god-mode.

[![TypeScript](https://img.shields.io/badge/TypeScript-7-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev)
[![Three.js](https://img.shields.io/badge/Three.js-r185-000000?logo=threedotjs&logoColor=white)](https://threejs.org)
[![Node](https://img.shields.io/badge/Node-25-5FA04E?logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Codeberg](https://img.shields.io/badge/Codeberg-mirror-2185D0?logo=codeberg&logoColor=white)](https://codeberg.org/sleuthy-sloth/autopolis)

> A city where the Mayor, City Planner, private Developers, and thousands of Citizens
> are **AI agents** — building roads, zoning districts, and arguing about budgets in real time.
> Your job? Watch. Tweak the world. Reap the chaos.

![Autopolis Phase 1 viewport — seeded island terrain with raycast tile selection](docs/phase1-viewport.png)

## 🏙️ The Vision

Autopolis is a browser-based **emergent city simulation**. A deterministic simulation core runs the city at
1 tick per second while specialized LLM agents — each with a personality, a portfolio, and a mandate —
make decisions asynchronously: extending roads, re-zoning neighborhoods, and raising taxes at the worst
possible moment. The result is a city that *grows itself*, with all the brilliance and absurdity that implies.

Everything is **local-first**: the sim core is pure TypeScript on your machine, and the agent brain can run on
Ollama (your homelab) with DeepSeek as a cloud fallback. No accounts, no telemetry, no city sold to advertisers.

## 🧱 Architecture — 3 tiers, fully decoupled

```text
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

| Tier | Tech | Role |
|---|---|---|
| **Viewport** | Three.js (InstancedMesh) + React 19 + Vite | 60 FPS rendering — the entire 4,096-tile grid is **one draw call** |
| **Core engine** | Node.js + TypeScript (shared `@autopolis/core`) | Deterministic simulation: grid state, ticks, and later pathfinding & resources |
| **Agent pipeline** *(Phase 3)* | Ollama / DeepSeek API + Zod | Asynchronous agent reasoning → validated JSON actions |

**Why Vite over Next.js?** This is a pure client 3D application — server-side rendering buys nothing.
**Why Node over FastAPI?** One language across all three tiers means the Zod schemas that validate agent output
live in the same type system as the state they mutate.

## 🤖 Agent Action Contract (Phase 3)

Every agent decision is emitted as **strictly validated JSON** — no markdown, no chit-chat:

```json
{
  "agent_id": "city_planner_01",
  "action": "EXTEND_ROAD",
  "coordinates": { "from": [12, 45], "to": [12, 60] },
  "metadata": { "road_type": "avenue", "budget_allocated": 1500 },
  "reasoning": "Connecting eastern residential sector to industrial park to reduce commuting traffic."
}
```

Allowed actions: `EXTEND_ROAD` · `SET_ZONING` · `BUILD_STRUCTURE` · `UPGRADE_INFRASTRUCTURE` · `ADJUST_TAX_RATE`

## 🗺️ Roadmap

- [x] **Phase 1 — Project Setup & Spatial Grid Engine** *(shipped)*
  - Monorepo scaffold (TypeScript, npm workspaces, 3 workspaces)
  - `SpatialGrid` — typed-array matrix + spatial queries, byte-identical determinism
  - Seeded fBm island terrain generation (no noise libraries — homegrown, dependency-free)
  - Three.js isometric grid renderer with raycast tile selection (hover highlight + selection ring)
  - React HUD: tile inspector, live FPS/tick telemetry, seed regeneration
  - Node engine skeleton: 1 Hz tick loop, `/health`, WebSocket broadcast
  - **19/19 unit tests**, verified at **60 fps with 4,096 instanced tiles**
- [x] **Phase 2 — Simulation Core & Pathfinding** *(shipped)*
  - `RoadGraph` — road network graph (adjacency, connectivity components)
  - **A\* pathfinding** — binary-heap, deterministic; vehicles (4-dir road graph) & citizens (8-dir terrain)
  - **Resource grids** — power & water flood from plants/towers with range attenuation; blocked by water
  - **Zoning R/C/I** — residential / commercial / industrial districts + population & coverage stats
  - `CityDevelopment` — deterministic seeded growth: ring roads, avenues, districts, plants appear over ticks
  - Server-authoritative sync: engine broadcasts full `world:state` (grid + stats + coverage), client renders
  - God-mode controls: `New Seed` resets the world live over WebSocket; power/water coverage overlay
  - **47/47 unit tests**; city at tick 12: pop 1,932 · 220 road tiles · 1 road component · 28% power / 22% water
- [ ] **Phase 3 — Agent Orchestration**: async agent tick runner, Zod-validated JSON actions,
      prompt templates for City Planner & Developer agents wired to state updates
- [ ] **Phase 4 — God-Mode HUD**: live agent action newsfeed, budget/population charts,
      global modifiers (tax rates, weather, natural disasters)

## 📁 Repository Layout

```text
autopolis/
├── packages/core/            Deterministic engine core — pure TS, zero dependencies
│   ├── src/
│   │   ├── grid.ts           SpatialGrid: flat typed arrays, neighbors, serialize/deserialize
│   │   ├── tiles.ts          TileType registry + palette (stable numeric codes)
│   │   ├── rng.ts            mulberry32 + deterministic 2D hash (seeded, reproducible)
│   │   ├── noise.ts          Value noise + fBm — dependency-free
│   │   ├── terrain.ts        Seeded island terrain generation
│   │   └── snapshot.ts       Grid → LLM-ready matrix snapshot (Phase 3 input)
│   └── test/                 19 vitest tests: determinism, round-trips, snapshot contract
├── apps/client/              Vite + React 19 + Three.js viewport (port 5173)
│   └── src/engine/           CityScene: instanced tiles, grid lines, raycast picking, selection ring
└── apps/server/              Node core engine (port 8788): 1 Hz tick, WS broadcast, /health
```

## 🚀 Getting Started

**Requirements:** Node.js 20+ (developed on 25), npm.

```bash
git clone git@github.com:sleuthy-sloth/autopolis.git
cd autopolis
npm install
npm run dev          # engine on :8788 + viewport on http://localhost:5173
```

Open **http://localhost:5173** — you should see a procedurally generated island:

| Control | Action |
|---|---|
| 🖱️ **Drag** | Orbit the camera |
| 🔍 **Scroll** | Zoom |
| 👆 **Click a tile** | Inspect it (position / type / elevation) |
| ⟳ **New Seed** | Regenerate the world |

The viewport runs standalone; when the engine is up (it is, via `npm run dev`) the HUD shows
`connected · tick N` as the 1 Hz simulation marches on.

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Engine + viewport together |
| `npm test` | Core engine unit tests (vitest) |
| `npm run typecheck` | Strict typecheck across all workspaces |
| `npm run build` | Production bundle (client) + typecheck (server) |

## 🎲 Determinism by Design

The simulation core never touches `Math.random()`. Every run derives from a seed through
`mulberry32` PRNG and avalanche-hashed value noise — **same seed, same island, same city, every time**.
This is what makes the agent pipeline (Phase 3) reproducible: any agent run can be replayed
tick-for-tick, and the server stays the single source of truth.

```ts
const a = new SpatialGrid(64, 64);
const b = new SpatialGrid(64, 64);
generateTerrain(a, { seed: 1337 });
generateTerrain(b, { seed: 1337 });
a.equals(b); // true — guaranteed
```

## 🏗️ Simulation Core (Phase 2)

The city **grows itself** on a deterministic schedule — roads first, then districts:

| Tick | What the city does |
|---|---|
| 1 | Ring road + 4 arterial avenues |
| 2 | Power plant + water tower, residential ring, commercial core, industrial band |
| 5 | Outer ring road (beltway) |
| 6 | Outer residential ring |
| 8–9 | Second power plant + water tower — capacity grows with the city |
| 10 | Arterial extensions to the island edge |

- **Roads** pave anything except water (beltways don't stop for hills); downtown flattens stone.
- **Power & water** flood from plants/towers through land, attenuating over range (max 14 tiles),
  blocked by water — click **`Overlay: off → power → water`** to see live coverage (green = served).
- **A\*** routes vehicles on the road graph (4-dir) and citizens across terrain (8-dir, diagonal √2).
- The engine is authoritative: it broadcasts full world state over WebSocket; the viewport just renders.
  `⟳ New Seed` regenerates the world through the same channel.

## 🌐 Mirrors

| Host | URL | Role |
|---|---|---|
| **GitHub** | https://github.com/sleuthy-sloth/autopolis | Primary |
| **Codeberg** | https://codeberg.org/sleuthy-sloth/autopolis | Mirror — `git push origin main` fans out to both automatically |

Both hosts stay in sync with a single push: the `origin` remote carries dual push URLs
(GitHub via SSH, Codeberg via HTTPS/credential-manager).

## 📜 License

MIT © Steven Koehl. See [LICENSE](LICENSE).
