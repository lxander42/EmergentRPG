# EmergentRPG

Emergent RPG is an experimental, mobile-first, open-world RPG inspired by games like Skyrim, Dwarf Fortress, RimWorld, Valheim, and Factorio. The goal is to create a rich, weighty world where story emerges from systems, not scripts — while still supporting meaningful long-term narrative arcs.

This project is early and intentionally exploratory.

## Vision

We're exploring how emergent gameplay can drive story, politics, and world evolution in an RPG context.

At a high level:
- The world is systemic and reactive
- NPCs are autonomous agents with values, traits, and goals
- Cities, factions, and politics evolve organically over time
- The player can move between different levels of abstraction (adventurer → leader → ruler)
- Death is not failure — your legacy persists

## Core Design Pillars

### Emergence Through Systems

Story arises from interactions between:
- NPC ↔ NPC
- NPC ↔ Player
- NPC ↔ Environment
- Environment ↔ Player
- Systems acting on themselves over time

NPCs have:
- Values
- Interests
- Skills/Stats
- Traits
- Statuses

These influence behavior, dialogue, relationships, and long-term outcomes.

### World Guidance (Not Pure Randomness)

Pure randomness often feels hollow. We aim to balance emergence with structure, likely via:
- A high-level "world AI" or gamemaster system
- Long-term narrative pressures or main quest arcs
- Event systems that nudge the world rather than dictate outcomes

### Progression Across Scales

Inspired by Spore and D&D:
- Seamlessly move between personal, local, and global gameplay
- Play as an adventurer, then a leader, then a ruler
- Advancement may require social buy-in (elections, reputation, fear, ideology)

### Legacy & Continuity

- Death may transition control to a descendant (roguelite elements)
- The world remembers your actions
- Factions, cities, and conflicts persist beyond a single character

## Inspirations

- **Skyrim** – Open world, factions, reputation, story depth
- **Valheim** – Building, survival, combat feel, terrain interaction
- **RimWorld** – Emergent NPC dynamics, world AI events, colony management
- **Factorio** – Systems thinking, resource flow, automation (selectively)
- **D&D** – Skill checks, power scaling, character expression
- *Inspirational Links*
    - [Story Generators reddit post](https://www.reddit.com/r/gamedesign/comments/1o312ry/story_generators_the_final_frontier_of_game_design/)

## Tech Stack

EmergentRPG is built as a mobile-first web app, designed to be developed from a phone with [Claude Code](https://claude.ai/code) and deployed to [Vercel](https://vercel.com). No Unity, no native builds.

| Concern | Choice |
|---|---|
| Framework | Next.js 16 (App Router) + React 19 + TypeScript (strict) |
| 2D rendering | Phaser 4, mounted in a client-only React wrapper |
| UI chrome | Tailwind CSS 4 |
| State | Zustand |
| Persistence | Dexie.js (IndexedDB) for local saves |
| Mobile | Installable PWA (manifest + viewport) |
| Hosting | Vercel (zero-config) |

## Repository Structure

```text
/
├── app/                    # Next.js App Router
│   ├── layout.tsx          # Root layout, viewport + PWA meta
│   ├── page.tsx            # Landing (New Game / Continue)
│   └── play/page.tsx       # Game shell (Phaser + HUD + panels)
├── components/             # React UI (HUD, panels, Phaser wrapper)
├── lib/
│   ├── sim/                # Deterministic world simulation
│   ├── render/             # Phaser scenes + React↔Phaser event bus
│   ├── state/              # Zustand store
│   └── save/               # Dexie schema (IndexedDB)
├── content/                # Data-driven content (factions, traits)
├── public/
│   ├── manifest.webmanifest
│   └── icons/              # Placeholder PWA icons
├── .claude/                # SessionStart hook + permissions
├── CONTRIBUTING.md
└── README.md
```

## Getting Started (web)

Requirements: Node 20+, npm.

```bash
npm install
npm run dev
```

Open <http://localhost:3000>. The landing page offers **New Game** / **Continue**. Game state autosaves to IndexedDB every ~60 ticks.

### Mobile dev workflow (phone + Claude Code + Vercel)

1. Open this repo in Claude Code (CLI, web, or mobile app).
2. The `SessionStart` hook in `.claude/hooks/session-start.sh` installs deps automatically on fresh remote sessions.
3. Push a branch — Vercel deploys a preview URL on every push.
4. Open the preview URL on your phone. Use **Add to Home Screen** to install the PWA for fullscreen play.

### Vercel setup

- Connect this repo on the [Vercel dashboard](https://vercel.com/new). Framework is auto-detected as Next.js.
- Every push to a branch deploys a preview build. Pushes to `main` deploy production.

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start Next.js dev server on `:3000` |
| `npm run build` | Production build |
| `npm run start` | Run the production build locally |
| `npm run lint` | ESLint (flat config) |
| `npm run typecheck` | `tsc --noEmit` |

## License

TBD (early-stage project).
