# CLAUDE.md

Project orientation. Read `README.md` first for vision, current state, and tech stack — this file covers what's not obvious from the code. For per-task context, read the prompt or the GitHub issue you've been pointed at.

## Architectural invariants

1. **Sim and render are separate.** `lib/sim/` is pure TypeScript — no Phaser, React, DOM, Dexie, or fetch. The simulation must be driveable from a Node script. `lib/render/` may import Phaser and read the Zustand store, but never mutates world state directly.

2. **Single source of truth: the Zustand store** (`lib/state/game-store.ts`). Components and Phaser scenes both read from it. The mitt `bus` in `lib/render/bus.ts` is legacy — prefer adding store actions over new bus events. `selectedNpcId` and `selectedRegion` are mutually exclusive; use the `selectNpc` / `selectRegion` actions, don't set them directly.

3. **The simulation is deterministic.** Every random goes through `lib/sim/rng.ts`. Never call `Math.random()` from inside `lib/sim/`. Take an `rng` as a parameter; don't construct a new one.

4. **Bump `WORLD_VERSION`** in `lib/sim/world.ts` whenever `World`, `Npc`, `FactionState`, `Player`, `BiomeInterior`, or related shapes change. Mismatched saves are discarded on load.

5. **Phaser is client-only.** Mounted via `next/dynamic({ ssr: false })` in `components/PhaserGame.tsx`. Don't import `phaser` elsewhere without the same wrap.

6. **NPCs move at two scales.** Canonically at the region level (`rx`, `ry`). When their region matches the player's, `lib/sim/combat.ts` materialises an `interior` slot and steps them tile-by-tile; the region-level tick early-returns for those NPCs so they don't double-tick.

7. **Ticks come from the active Phaser scene.** Both scenes accumulate real time, scale by `store.speed`, and call `store.tick()` every 250 ms. Cooldowns inside the sim are expressed in ticks.

## Mobile-first defaults

- `min-h-[100dvh]`, never `h-screen` (iOS Safari URL bar bug).
- Hit targets ≥ 44px.
- Viewport locked at `maximumScale: 1, userScalable: false` in `app/layout.tsx`. Don't relax it.
- `.no-touch-scroll` on the Phaser parent disables pinch/pan/rubber-band.

## Conventions

- Strict TS with `noUncheckedIndexedAccess`. No `any`. `arr[i]` is `T | undefined` — handle it.
- No comments unless the WHY is non-obvious. Don't reference current task / PR.
- No emojis in source, markup, or commit messages.
- Path alias `@/...` resolves to repo root.
- Don't create new docs files (README/CHANGELOG) unless asked.
- Edit existing files when possible; don't add abstractions, error handling, or fallbacks for cases that can't happen.

## Design

Tokens live in `app/globals.css` under `@theme`. Faction colours in `content/factions.ts` use Phaser `0xRRGGBB`. Mini Motorways aesthetic — calm, geometric, square; lean low on flourish. Use the shared `.tactile` class for interactive surfaces.

Banned: `Inter` (use Outfit, already loaded), `lucide-react` (Phosphor only), pure black `#000` (use `var(--color-fg)`).

## Workflow

`main` is the only persistent branch. Each task on a short-lived `claude/<task-name>` branch in a worktree off `origin/main`. `npm run typecheck && npm run lint && npm run build` must pass before pushing.

After finishing a feature, **always open a PR to `main`** via the `mcp__github__create_pull_request` MCP tool — that's the review handoff. Don't merge directly; don't leave a pushed branch sitting without a PR. One feature, one branch, one PR.

Once the PR is open, **always subscribe to it** via `mcp__github__subscribe_pr_activity` so review comments and CI failures arrive in-session as `<github-webhook-activity>` events. Don't end the turn without subscribing.
