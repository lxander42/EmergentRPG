# CLAUDE.md

Project orientation for Claude Code sessions. Read this first.

## What this repo is

**EmergentRPG** — a mobile-first, browser-based systemic RPG where story emerges from the simulation, not scripts. The goal is a small, weighty world of autonomous NPCs and competing factions that runs whether the player is watching or not.

It is **not** a Unity game. The repo started as a Unity scaffold with no game code; the entire game lives in this Next.js + Phaser app. Don't propose Unity, native, or 3D directions unless explicitly asked.

Design pillars (from `README.md`):

- Story arises from systems, not scripts.
- NPCs are autonomous agents with values, traits, goals.
- Factions and politics evolve over time.
- The player can move between scales (adventurer → leader → ruler) — only adventurer scope is built today.
- Death is not failure; legacy persists.

Visual language is **Mini Motorways**: warm cream background, square region grid, soft pastels, a single muted-coral accent, geometric clarity over flourish.

## Tech stack

| Concern | Choice | Notes |
|---|---|---|
| Framework | Next.js 16 (App Router) | Turbopack build by default. |
| UI runtime | React 19 | Server Components by default; isolate interactivity in leaf `"use client"` components. |
| Language | TypeScript (strict, `noUncheckedIndexedAccess`) | No `any`. |
| 2D engine | Phaser 4 | Mounted client-only via `next/dynamic({ ssr: false })`. |
| Styling | Tailwind CSS 4 | CSS-driven config in `app/globals.css` via `@theme`. PostCSS plugin is `@tailwindcss/postcss`. |
| Font | Outfit, via `next/font/google` | `Inter` is **banned** by the design skill. |
| Icons | `@phosphor-icons/react` | `lucide-react` is **banned** by the design skill — do not reintroduce. |
| State | Zustand | One store, `lib/state/game-store.ts`. |
| Persistence | Dexie (IndexedDB) | Local-only, no cloud sync today. |
| Hosting | Vercel | Zero-config; Framework Preset must be **Next.js**. |
| Lint | ESLint 9 (flat config) | Pinned at `^9.39.4` because ESLint 10 breaks `eslint-plugin-react`. `next lint` was removed in Next 16; use `eslint .`. |
| Package manager | npm | Phone-friendly, Vercel default. |

Node `>=20`. Always check `package.json` before importing a third-party module — install it first if it's missing.

## Commands

```bash
npm install            # only needed on a fresh checkout
npm run dev            # next dev on :3000
npm run typecheck      # tsc --noEmit
npm run lint           # eslint .
npm run build          # next build (Turbopack)
npm run start          # serve the production build locally
```

`npm run typecheck && npm run lint && npm run build` should all pass before pushing. The `.claude/hooks/session-start.sh` hook runs `npm ci` automatically on fresh Claude Code on the web sessions, so you can usually skip the install step.

## Repository tour

```
app/                  Next.js App Router
  layout.tsx          Outfit font, viewport, PWA meta
  page.tsx            Landing — New Game / Continue
  play/page.tsx       Game shell — mounts Phaser + HUD + panels
components/
  PhaserGame.tsx      Client-only wrapper that creates Phaser.Game
  hud/HUD.tsx         Floating top pill (home, ticks, pause, speed)
  panels/NpcPanel.tsx Slide-up details for the selected NPC
  panels/RegionPanel.tsx Slide-up details for the selected region
content/              Data-driven content
  factions.ts         Three factions: id, name, color, values
  traits.ts           Trait + name pools
  biomes.ts           Biome metadata: title, blurb, swatch, passable
lib/
  sim/                Pure-TS deterministic simulation (no Phaser, no React)
    world.ts          World shape, createWorld, tickWorld, WORLD_VERSION
    npc.ts            NPC type, spawnNpc, tickNpc (telegraph + move logic)
    faction.ts        FactionState (reputation, power)
    events.ts         WorldEvent type, maybeEmitEvent
    biome.ts          biomeAt, isPassable
    rng.ts            Seeded mulberry32 — every random in the sim goes through this
  render/             Phaser-side code only (no React imports here)
    scenes/BootScene.ts
    scenes/WorldScene.ts  Tilemap, grid, NPC sprites, telegraph visuals, input
    bus.ts            mitt-based pub/sub — currently just for legacy events
  state/
    game-store.ts     Zustand store: world, paused, speed, selections
  save/
    db.ts             Dexie schema + saveWorld / loadWorld / hasSave
public/
  manifest.webmanifest PWA manifest
  icons/              Placeholder PWA icons (192, 512)
.claude/
  hooks/session-start.sh   Idempotent npm install for fresh remote sessions
  settings.json            SessionStart hook + permission allowlist
```

## Architecture invariants

These are the rules that make the codebase coherent. Follow them.

### 1. Sim and render are separate

Everything under `lib/sim/` is pure TypeScript that runs in a vanilla browser context. **No Phaser, React, DOM, Dexie, or fetch imports** belong there. The simulation must be driveable from a Node script as well as from the browser — that's how we'll one day write tests for it.

`lib/render/` knows about Phaser and reads from the Zustand store. It must not mutate world state directly; mutations only go through store actions.

### 2. Single source of truth: the Zustand store

The store wraps a `World` object plus UI selections. Components and Phaser scenes both read from it. The `bus` in `lib/render/bus.ts` exists for legacy reasons; **prefer adding store actions over new bus events.**

Selection rule: `selectedNpcId` and `selectedRegion` are mutually exclusive. The `selectNpc` and `selectRegion` actions enforce this. Don't set them directly.

### 3. The simulation is deterministic given a seed

Every random choice goes through the seeded RNG in `lib/sim/rng.ts`. Never call `Math.random()` from inside `lib/sim/`. The `World` carries `seed` plus `rngState` so a save can be replayed exactly.

If you add stochastic behaviour, take the rng as a parameter (see `tickNpc`) — don't construct a new one.

### 4. Save migrations via `WORLD_VERSION`

`lib/sim/world.ts` exports `WORLD_VERSION` (currently `3`). The store's `loadFromDisk` discards saves whose version doesn't match and starts a fresh world. **Bump this whenever you change the `World`, `Npc`, `FactionState`, or related shapes.** This keeps users from booting into corrupt half-migrated state on the dev branch.

### 5. Phaser is mounted client-only

`components/PhaserGame.tsx` is the only place `phaser` is imported. It uses `next/dynamic({ ssr: false })` so SSR never tries to touch `window`. Don't import Phaser in any other file unless you also wrap it in `dynamic`.

### 6. Game loop drives ticks via Phaser

The Phaser `WorldScene.update(_, delta)` accumulates real time, scales by `store.speed`, and calls `store.tick()` every `tickStepMs = 250ms`. So 1× = 4 ticks/sec, 4× = 16 ticks/sec. Sim cooldowns are expressed in ticks; convert mentally with `ticks * 250ms`.

### 7. Mobile-first defaults

- Use `min-h-[100dvh]`, never `h-screen` (iOS Safari URL bar bug).
- The Phaser parent has `touch-action: none` via the `.no-touch-scroll` class so pinch/pan don't trigger browser zoom or rubber-band scroll.
- Viewport meta is locked at `maximumScale: 1, userScalable: false` in `app/layout.tsx`. Don't relax it without a reason.
- Hit targets ≥ 44px on phones; the existing buttons use `h-9`–`h-10`.

## Design system

Defined as CSS variables in `app/globals.css` under `@theme`. Use them; don't hard-code hex.

| Token | Hex | Use |
|---|---|---|
| `--color-bg` | `#f6f1e8` | Page background, Phaser canvas bg |
| `--color-surface` | `#ffffff` | Panels, HUD pills |
| `--color-surface-warm` | `#fbf6ed` | Hover states, subtle fills |
| `--color-border` | `#e6dcc8` | 1px hairlines |
| `--color-border-strong` | `#cfc3a8` | Around colour swatches |
| `--color-fg` | `#2c2820` | Primary text (warm near-black, **never `#000`**) |
| `--color-fg-muted` | `#7a7368` | Secondary text, mono labels |
| `--color-accent` | `#d96846` | The single accent — selection rings, save indicator |
| `--color-grid` | `#c4baa6` | Map grid lines |
| `--color-tile-*` | various | Biome fills, mirrored in `WorldScene.ts`'s `COLORS` |

Faction colours live in `content/factions.ts` as numeric `0xRRGGBB` (Phaser format). When you need a CSS string from one, use the `factionHex` helper pattern: `"#" + color.toString(16).padStart(6, "0")`.

Typography:

- Display / headlines: `text-[2.75rem] font-medium tracking-tight leading-[1.05]`. Don't go bigger.
- Body: `text-base text-[var(--color-fg-muted)] leading-relaxed max-w-[60ch]` (or `34ch` for hero copy).
- Mono numerals + labels: `font-mono text-[11px] uppercase tracking-wider`. Used for tick counter, coordinates, dt/dl labels.

Tactile feedback: every interactive surface uses the shared `.tactile` class (defined in `globals.css`). It animates `transform` only, with a `-1px` lift on hover and a press-down on `:active`. Don't build custom hover styles — extend `.tactile` or use it as-is.

Banned by the design skill (see `~/.claude/skills/design-taste-frontend/SKILL.md`):

- Inter (use Outfit/Geist/Cabinet Grotesk/Satoshi — Outfit is loaded).
- `lucide-react` (Phosphor only).
- Pure black `#000` (use `var(--color-fg)`).
- Emojis in code, markup, or alt text. Use icons.
- 3-equal-card horizontal feature rows.
- Generic shadows / neon glows. Use tinted, soft shadows like the existing `shadow-[0_20px_48px_-20px_rgba(44,40,32,0.25)]`.

Design dials (from the taste skill, tuned for this project): **DESIGN_VARIANCE 4 / MOTION_INTENSITY 3 / VISUAL_DENSITY 3**. Mini Motorways calls for clarity over flourish, so keep these low — no Framer Motion magnetic micro-physics here.

## Sim model and tunable constants

The world is a `MAP_W × MAP_H` square grid (currently 12 × 12) of *regions*. Each region has a biome derived deterministically from `(x, y)` via `biomeAt`. Water is impassable.

NPCs occupy one region at a time (`rx`, `ry`). Movement is a four-state cycle:

1. **Idle** — `moveCooldown` counts down from a value in `[IDLE_MIN, IDLE_MAX]` ticks (3–7.5s).
2. **Decide** — when cooldown hits 0, roll `MOVE_CHANCE` (0.5) against picking an adjacent passable region as `intent`.
3. **Telegraph** — if `intent` is set, cooldown becomes `TELEGRAPH_TICKS` (~2s). The render layer paints a faded faction-coloured ghost square at the target plus a dotted pulsing connector.
4. **Execute** — on the next 0-tick, snap `rx/ry` to `intent`, clear `intent`, return to idle. The render layer detects the rx/ry change and tweens the sprite ~750ms with a trail line.

All five constants live at the top of `lib/sim/npc.ts`:

```ts
const IDLE_MIN = 12;        // ticks
const IDLE_MAX = 30;
const TELEGRAPH_TICKS = 8;
const MOVE_CHANCE = 0.5;
```

If you change pacing, **bump `WORLD_VERSION`** so existing saves don't get out-of-date cooldown distributions. (Adding new optional fields is also a `WORLD_VERSION` bump.)

`AUTOSAVE_EVERY_TICKS = 60` in `lib/state/game-store.ts` — the world snapshots to IndexedDB every 60 ticks (~15s at 1×).

## Common tasks

### Add a faction

1. Append to `content/factions.ts`. Pick a Mini Motorways-style pastel (saturation similar to existing entries, distinct hue).
2. Bump `WORLD_VERSION` in `lib/sim/world.ts` so existing saves regenerate.
3. No render changes needed — `WorldScene` reads the colour from each NPC.

### Add a biome

1. Extend the `Biome` union in `lib/sim/biome.ts`, slot it into `biomeAt`'s threshold ladder, and decide passability in `isPassable`.
2. Add the metadata entry to `content/biomes.ts` (title, blurb, swatch, passable). The swatch must match the colour in `lib/render/scenes/WorldScene.ts`'s `COLORS` map.
3. Add the colour to `WorldScene.COLORS` and the `tileAt` mapping.
4. Add a CSS variable in `app/globals.css` if any DOM surface needs to mirror it.
5. Bump `WORLD_VERSION`.

### Add a slide-up panel

Follow the shape of `NpcPanel.tsx` / `RegionPanel.tsx`:

- `"use client"` at the top.
- Read selection from the store; return `null` if nothing selected.
- Reuse the panel chrome — `rounded-3xl border bg-[var(--color-surface)] shadow-[...]` and the close button pattern.
- If the panel has its own selection key in the store, add it to the mutual-exclusion logic in `selectNpc` / `selectRegion`.
- Mount it in `app/play/page.tsx` alongside `<NpcPanel />` and `<RegionPanel />`.

### Tweak NPC pacing

Edit constants at the top of `lib/sim/npc.ts`. Bump `WORLD_VERSION` so old saves regenerate with the new distribution.

### Change the visual telegraph

Search `WorldScene.ts` for `npc.intent` and `view.intent`. The ghost square + dotted connector + alpha pulse all live in one block.

## Coding conventions

- **No comments unless the WHY is non-obvious.** Don't explain what well-named code already says. Don't reference the current task or PR ("added for X feature") — that belongs in commit messages.
- **No unnecessary new files.** Edit existing files when possible. Don't create README/CHANGELOG/docs files unless the user asks.
- **Don't over-engineer.** Don't add abstractions, error handling, or fallbacks for cases that can't happen. Trust internal invariants; only validate at the system boundary.
- **No emojis** in source, markup, or commit messages.
- **Strict TS.** Use proper types. `noUncheckedIndexedAccess` is on, so `arr[i]` is `T | undefined` — handle that explicitly.
- **Path alias.** Use `@/...` from anywhere in the app to reference repo-root-relative paths (configured in `tsconfig.json`).

## PR workflow

Per `CONTRIBUTING.md`:

- Branch off `dev`, PR into `dev`. Promote `dev → main` periodically.
- Signed commits are required for human contributors. (Bot commits pushed via the GitHub MCP / Claude Code on the web are not GPG-signed; flag this for the user if it's a blocker.)
- `npm run typecheck && npm run lint` must pass before requesting review.
- Vercel publishes a preview URL on every push — open it on a phone before merging.
- The session's working branch is set in the system prompt; create a new branch when starting a new task rather than reusing one whose PR is already merged.

## Vercel notes

- Framework Preset must be **Next.js**. New projects on this org default to unset, which makes the build succeed but the edge layer 404 every route. Fix in **Project Settings → Build & Development → Framework Preset**, then redeploy without build cache.
- No environment variables are needed today.
- The Vercel app is auto-detected on push; preview deploys land at `emergent-rpg-git-<branch>-logans-projects-35854e95.vercel.app`.

## Things that are intentionally not in scope

Don't add these without an explicit user ask. They've been considered and deferred:

- **AI / LLM features** (Claude API narration, NPC dialogue). An earlier branch wired this up and stripped it. Stay deterministic until the core loop is solid.
- **Multiplayer / netcode.**
- **Cloud save sync** (Vercel KV / Postgres). IndexedDB only for now.
- **Service worker / offline mode.** PWA manifest only.
- **Combat, inventory, dialogue trees.** Stub data structures only.
- **Real art assets.** Placeholder solid-disc PNGs and procedural tile colours are deliberate.
- **Reintroducing Unity, native, 3D.**

## When in doubt

- The user develops on a phone. Every change has to work in mobile browsers — viewport, touch, no hover-only interactions.
- The aesthetic is Mini Motorways. When uncertain about a visual choice, lean towards calm, geometric, light, square.
- The simulation is small on purpose. Don't expand scope; tighten what's there.
