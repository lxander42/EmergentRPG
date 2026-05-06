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

## What's playable today

The game is in early but functional shape. The current loop on the `main` branch:

- **A 32 × 32 region world** of biomes (grass / forest / sand / stone / water), held by three competing factions whose territory accretes over time as their NPCs occupy it. 200 autonomous NPCs roam the map with faction-flavoured goals (wander / gather / patrol / raid / trade).
- **Settle, forage, survive.** Tap a passable region to claim home. Tap food and material dots in the biome to gather them; walking drains energy, and zero energy starts starvation. Open the inventory pill to **Eat** food on demand for `+energy +health`.
- **Craft and fight.** Stick / club / sling craft from foraged materials. Tap an NPC to open a small floating context menu (Examine / Attack); the player auto-chases until they're in reach, then trades blows. Sling fires at up to 4 tiles with a dotted projectile.
- **Faction relations matter.** Per-player reputation drives encounter sentiment. Attacking an NPC tanks rep with their faction; once you're hostile, members within ~3 regions converge on you. Friendlies of an aggrieved faction drift away. Off-screen, rival-faction NPCs fight each other — kills shift faction power and inter-faction relations over time.
- **Death is a setback, not a reset.** Inventory + carried weapons drop as a `fromDeath` loot pile at the death tile; you respawn at home with no gear, and the rest of the world (NPCs, factions, biomes, relations) keeps running. Walk back to recover what you lost.
- **Mini Motorways aesthetic.** Warm cream background, square region grid, soft pastels, single muted-coral accent. Faction territory renders as a semi-transparent diagonal cross-hatch that visually merges across adjacent same-faction regions.
- **Debug mode.** A bug toggle in the top pill exposes a stats overlay (NPC count, ticks, per-faction power and player rep), shows region-level NPC tokens + telegraphs on the world map, surfaces Teleport / Inspect biome on RegionPanel, and shows an EncounterFeed of recent combat deaths. Off by default.

Bigger features intentionally not built yet: a workbench / tool-gated crafting graph, sword / bow / armour, status effects, group combat, dialogue trees, multiplayer, cloud sync. See [`CLAUDE.md`](./CLAUDE.md) for the contributor-facing scope list.

## Roadmap

The list below is what we believe the project needs to feel like a complete, playable experience — the minimum set of systems where survival, society, and story reinforce each other. Phases 1–3 (the current loop above) are merged. Everything here is open work, grouped by what each phase unlocks rather than strict sequencing.

### Phase 4 — Survival, deepened

The current loop tops out at crafting a sling. The next layer is enough depth in crafting and building to make a settled life feel intentional.

- **Crafting and resource gathering expansion.** Build out the recipe graph: more materials, multi-stage chains, tool-gated tiers, durability and upgrade paths. Ground the existing recipe stubs (workbench, sword, bow in `content/recipes.ts`) into shipped mechanics.
- **Basic building.** Place persistent structures on the world. Workbench first, then walls, doors, storage, beds. Structures bind to a region, survive saves, and gate the higher-tier recipes from the previous bullet.

### Phase 5 — NPCs as an ecosystem

NPCs today are a fixed pool of 200 wanderers. To support emergent politics, they need to behave like a population — born, raised, settled, replaced.

- **Birth, death, and homesteading.** NPCs age, die of old age, have children, and pass faction membership down. Tribes claim regions and develop them: farms, planted fields, stockpiles, herd animals. Resource management becomes a faction-level concern rather than a player-only one.
- **Goal and state refactor for density.** The current five goal kinds (`wander / gather / patrol / raid / trade` in `lib/sim/goal.ts`) read fine when NPCs are spread out and feel chaotic when ten of them share a region. Rework the goal/state system around longer arcs and social context so a busy village reads as a village instead of a swarm.

### Phase 6 — A living world

- **Animals and PvE.** Wildlife, predator/prey loops, neutral creatures, and dangerous beasts. Reuses the tile-level combat system and adds the first non-political reason to leave home.

### Phase 7 — Story you can talk to

Emergence only matters if the player can read the story coming out of it. These two systems give the world a voice without leaning on per-token LLM cost for every line.

- **NPC ↔ player communication.** A dialogue layer that surfaces NPC values, goals, and history without sending every utterance through an LLM. Likely a hybrid: deterministic templates and structured pickers driven by NPC state, with optional cached or batched LLM passes for flavour where the budget allows.
- **History simulation.** Record what happens — births, deaths, battles, betrayals, faction shifts — into a queryable chronicle. The player (and NPCs) can refer to it, the world remembers, and emergent lore stops vanishing into the tick stream.

### Phase 8 — Shared world

- **Multiplayer and persistent world.** Move authoritative state off the device. Multiple players inhabit one continuously-running world; the simulation keeps ticking when nobody is logged in. This is the last MVP milestone because every system before it has to be stable under a single-player save first.

When all eight milestones land, the project is what we'd call a minimum viable game: a world worth surviving in, a society worth living among, a story worth telling, and other people to tell it to.

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
│   └── play/page.tsx       # Game shell (Phaser + HUD + panels + tutorial)
├── components/             # React UI: HUD, slide-up panels, NPC context
│                           # menu, encounter toast/feed, tutorial modal
├── lib/
│   ├── sim/                # Deterministic world simulation
│   │                       # world / npc / goal / combat / weapons / player /
│   │                       # player-tick / faction / events / biome /
│   │                       # biome-interior / path / rng
│   ├── render/             # Phaser scenes (WorldScene + BiomeScene) + bus
│   ├── state/              # Zustand store
│   └── save/               # Dexie schema (IndexedDB)
├── content/                # Data-driven content
│                           # factions / traits / biomes / resources / weapons
├── public/
│   ├── manifest.webmanifest
│   └── icons/              # Placeholder PWA icons
├── .claude/                # SessionStart hook + permissions
├── CLAUDE.md               # Contributor / agent orientation
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
