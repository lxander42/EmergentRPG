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

## What's playable today

Phases 1–3 are merged. The current loop:

- **Settle a home.** Tap a passable region on the world map to claim it; you respawn here on death.
- **Forage.** Tap food and material dots in the biome to collect them. Walking drains energy (~33 steps per energy unit at full); zero energy starts starvation. Open the inventory pill and tap **Eat** on any food row to spend it for `+energy +health`.
- **Craft.** Inventory panel has a Crafting section: stick (1 wood), club (2 wood + 1 stone), sling (2 reed + 1 stone). The highest-attack weapon whose reach covers the target equips implicitly. Durability ticks per landed hit.
- **Combat.** Tap an NPC to open a small floating context menu; tap **Attack** and the player auto-chases until they're in reach, then trades blows. Damage numbers float; the defender flashes white. Sling fires a dotted projectile up to 4 tiles. Killing an NPC drops a faction-flavoured loot pile.
- **NPC vs NPC.** NPCs of rival factions (or with the `violence` value) fight when they share a region. Visible at tile level inside the player's interior; resolved abstractly off-screen, swinging faction `power` and `factionRelations` over time.
- **Hostile chase / friendly flee.** Once you've crossed a faction (rep < 0, or you've personally hit a member), members within 3 regions converge on the player's region. Friendlies of an aggrieved faction drift away.
- **Death persistence.** Inventory + carried weapons drop as a `fromDeath` loot pile at the death tile. Respawn at home with no gear; walk back to recover it. World keeps running.
- **Debug mode.** Bug toggle in the top pill exposes a stats overlay (npcs.length, ticks, player coords, per-faction power and player rep), shows region-level NPC tokens + move telegraphs on the world map, surfaces Teleport / Inspect biome on RegionPanel, and shows the EncounterFeed. Off by default for normal play.

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
  play/page.tsx       Game shell — mounts Phaser + HUD + panels + tutorial
components/
  PhaserGame.tsx      Client-only wrapper that creates Phaser.Game
  TutorialModal.tsx   7-page tutorial fired on startNew (Skip/Begin)
  EncounterToast.tsx  Toast for friendly/hostile encounters (Stand down / Accept)
  EncounterFeed.tsx   Bottom-right combat/event log (debug-mode only)
  FactionLegend.tsx   Faction colour swatch list
  NpcContextMenu.tsx  Floating tap menu (Examine / Attack), draggable
  RecenterButton.tsx  Snap camera back to player after panning
  hud/HUD.tsx         Top pill (home, ticks, pause, speed, biome/world toggle,
                      faction-zone eye toggle, debug bug), health/energy/inventory
                      strips, in-combat dot, branched game-over modal,
                      collapsible debug stats overlay
  panels/NpcPanel.tsx     Stance + combat stats + matchup + Attack
  panels/RegionPanel.tsx  Held-by, food list, Travel/Claim, debug Teleport/Inspect
  panels/InventoryPanel.tsx  Materials with Eat, Weapons, Crafting, Gear placeholder
  panels/ShapeBadge.tsx   Tiny faction-shape icon used by panels
content/              Data-driven content
  factions.ts         Factions: id, name, color, shape, values
  traits.ts           Trait + name pools
  biomes.ts           Biome metadata: title, blurb, swatch, passable
  resources.ts        9 resources (5 food + wood/reed/stone/ore), biome density
  weapons.ts          Stick/club/sling: attack, reach, durability, ranged, recipe
lib/
  sim/                Pure-TS deterministic simulation (no Phaser, no React)
    world.ts          World shape, createWorld, tickWorld, WORLD_VERSION,
                      claimHome, ensureInteriorsForRegion, dropDeathLoot
    npc.ts            Npc type, spawnNpc, tickNpc (region-level), region-
                      level chase / flee override using playerReputation +
                      recentFactionAttacks
    goal.ts           Goal kinds (wander/gather/patrol/raid/trade), pickGoal,
                      goalTarget, isGoalDone, advanceGoalState
    combat.ts         tickCombat (interior + region), resolvePlayerAttack,
                      tile-level pathing, materializeInteriorSlot, projectile
                      emission, NPC-vs-NPC at both scales, ENGAGED_TTL_TICKS
    weapons.ts        WeaponInstance, affordable/spendRecipe/makeWeapon,
                      pickWeaponForRange, consumeUse
    player.ts         Player type, PlayerStats (speed/perception/atk/def/reach),
                      PendingAction (collect | attack), createPlayer
    player-tick.ts    tickPlayer: walk, chase NPCs while pendingAction.attack,
                      pickup loot, manual eat hooked through store, projectile
                      emission, starvation
    faction.ts        FactionState (reputation, power), per-player rep helpers
                      (gain/lose/playerRepOf), pairKey/getRelation/nudgeRelation,
                      isFactionHostile predicate
    events.ts         WorldEvent type, EncounterPayload, buildEncounterEvent
    biome.ts          biomeAt, isPassable, blendNoise
    biome-interior.ts INTERIOR_W=20, generateInterior, BiomeInterior with
                      obstacles + resources + loot, addLoot/removeLoot,
                      findPassableTile
    path.ts           bfs (small grid), bfsPredicate (lazy global tile)
    rng.ts            Seeded mulberry32 — every random in the sim goes through this
  render/             Phaser-side code only (no React imports here)
    scenes/BootScene.ts
    scenes/WorldScene.ts   World map: biome tiles, faction-zone cross-hatch,
                            home marker, player marker, debug-only NPC tokens
                            and move telegraphs
    scenes/BiomeScene.ts   Tile-level: tile fills + obstacles, resources, loot,
                            visitor sprites that read npc.interior, damage-number
                            text pool, hit flash, projectile dotted lines,
                            pickup toasts
    bus.ts            mitt-based pub/sub — currently just for legacy events
  state/
    game-store.ts     Zustand store: world, paused, speed, view, selections,
                      inventory/tutorial/debug toggles, mapShowFactions,
                      npcContextMenu, all game actions (craft, attackNpc, eatFood,
                      teleportToRegion, inspectBiome, openInventory…)
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

`lib/sim/world.ts` exports `WORLD_VERSION` (currently `8`). The store's `loadFromDisk` discards saves whose version doesn't match and starts a fresh world. **Bump this whenever you change the `World`, `Npc`, `FactionState`, `Player`, `BiomeInterior`, or related shapes.** This keeps users from booting into corrupt half-migrated state on the dev branch.

### 5. Phaser is mounted client-only

`components/PhaserGame.tsx` is the only place `phaser` is imported. It uses `next/dynamic({ ssr: false })` so SSR never tries to touch `window`. Don't import Phaser in any other file unless you also wrap it in `dynamic`.

### 6. Game loop drives ticks via Phaser

Both Phaser scenes (`WorldScene` and `BiomeScene`) accumulate real time in `update(_, delta)`, scale by `store.speed`, and call `store.tick()` every `tickStepMs = 250ms`. So 1× = 4 ticks/sec, 4× = 16 ticks/sec. Sim cooldowns are expressed in ticks; convert mentally with `ticks * 250ms`. The active scene is chosen by `store.view` (`world` ↔ `biome`) — switching views starts/stops the corresponding scene, and only one runs at a time.

### 8. Two-scale NPC movement

NPCs canonically live at the **region level** (`rx`, `ry`). When their region matches the player's region, `lib/sim/combat.ts:tickInteriorCombat` materialises an `interior: { lx, ly, … }` slot and steps them tile-by-tile through the biome interior with one-step BFS over obstacles. The region-level `tickNpc` early-returns for these NPCs so they don't double-tick. When they leave (transit through an edge tile), `interior` clears and they go back to region-level movement.

Off-screen NPCs of rival factions sharing a region resolve fights abstractly via `tickRegionCombat`. Inside the player's interior, the same NPCs fight at tile level. The single canonical NPC list is `world.npcs` — there is no parallel `combatants[]`.

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

The world is a `MAP_W × MAP_H` square grid (currently **32 × 32**) of *regions*. `NPC_COUNT = 200`. Each region has a biome derived deterministically from `(x, y)` via `biomeAt`. Water is impassable. Each region also has a lazily-generated **biome interior** (an `INTERIOR_W × INTERIOR_H = 20 × 20` tile grid in `lib/sim/biome-interior.ts`) used when the player's view is `biome` and for tile-level NPC fights.

### Region-level NPC movement

NPCs canonically occupy one region at a time (`rx`, `ry`). When their region differs from the player's, `tickNpc` runs the four-state cycle:

1. **Idle** — `moveCooldown` counts down from a value in `[IDLE_MIN, IDLE_MAX]` ticks.
2. **Decide** — when cooldown hits 0, the NPC consults its `goal` (wander/gather/patrol/raid/trade) for a target region, biased by region control. With probability `MOVE_CHANCE`, picks the best adjacent passable region toward target as `intent`.
3. **Telegraph** — if `intent` is set, cooldown becomes `TELEGRAPH_TICKS`. The render layer paints a faded faction-coloured ghost square at the target plus a dotted pulsing connector. **Debug-mode-only** — the world map is otherwise clean.
4. **Execute** — on the next 0-tick, snap `rx/ry` to `intent`, clear `intent`, advance goal state.

Constants at the top of `lib/sim/npc.ts`:

```ts
const IDLE_MIN = 12;        // ticks
const IDLE_MAX = 30;
const TELEGRAPH_TICKS = 8;
const MOVE_CHANCE = 0.5;
export const NPC_PERCEPTION_REGIONS = 3;  // chase / flee perception
export const FLEE_TTL_TICKS = 480;        // friendly-flee bias decay (~2 min @ 1×)
```

A region-level **chase / flee override** sits at the top of `tickNpc`: if the NPC's faction is hostile to the player (rep < 0 or `engagedTick` recent) and the player's region is within `NPC_PERCEPTION_REGIONS`, override `goalTarget` to the player's region. If a friendly faction was attacked recently (`world.recentFactionAttacks[factionId]` within `FLEE_TTL_TICKS`), bias the target three regions away from the player.

### Tile-level NPC movement (player's region)

When `npc.rx,ry === player region`, `lib/sim/combat.ts:tickInteriorCombat` takes over. NPCs get a nullable `interior: { lx, ly, tileIntent, stepCooldown, lastHitTick, wanderUntil }` slot, materialised on entry, cleared when they leave. Each tick they pick a tile target via `pickDynamicTileTarget` (player tile if hostile, hostile-faction NPC tile, trade peer's tile, region-edge if goal points elsewhere, random edge if `wanderUntil` lapsed) then BFS one step toward it. Reaching an edge tile transits the NPC to the neighbour region.

### Combat resolution

- `Player.stats`: `{ speed, perception, attack, defense, reach }` (defaults 2/6/1/0/1 in `lib/sim/player.ts`).
- `Npc` combat fields: `combatHealth/Max`, `combatAttack`, `combatDefense`, `combatReach=1`, `combatCooldown`, `combatIntent`, `weapon`, `engagedTick`. Stat values seeded from faction values + traits at spawn.
- Damage: `max(1, attacker.attack + weaponBonus - defender.defense)`. `COMBAT_COOLDOWN_TICKS = 4` between attacks.
- Player attack flow: tap NPC → context menu → **Attack** sets `pendingAction.attack`. Each tick `tickPlayer` re-plots a chase route to within reach of the NPC's current tile until they're adjacent or in ranged reach. On contact `resolvePlayerAttack` lands the hit; `pendingAction` persists until the NPC dies, leaves the region, or the player walks elsewhere.
- Off-screen NPC fights: `tickRegionCombat` samples up to `REGION_PAIRS_PER_TICK = 4` hostile pairs per region, exchanges symmetric attacks (capped at `MAX_REGION_HITS_PER_TICK = 6`), and on death shifts faction `power` and `factionRelations`.

### Other tunables

- `AUTOSAVE_EVERY_TICKS = 60` in `lib/state/game-store.ts` — the world snapshots to IndexedDB every 60 ticks (~15s at 1×).
- `WALK_ENERGY_PER_STEP = 0.3`, `STARVE_TICKS_PER_DAMAGE = 80`, `EAT_ENERGY_PER_FOOD = 3`, `EAT_HEALTH_PER_FOOD = 1`.
- `PICKUP_TTL_TICKS = 10`, `PROJECTILE_TTL_TICKS = 4` — UI ring buffers in `world.ts`.
- `ENGAGED_TTL_TICKS = 200` in `combat.ts` — pursuit memory for NPCs the player has hit.

If you change pacing or shape, **bump `WORLD_VERSION`** so existing saves don't desync.

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

Search `WorldScene.ts` for `npc.intent` and `renderTelegraphs`. The ghost square + dotted connector + alpha pulse all live in one block. Note this layer only renders when `useGameStore.getState().debugMode` is true.

### Add a weapon

1. Append a `WeaponKind` entry to `content/weapons.ts` with `attack`, `reach`, `durability`, `ranged`, `recipe`, `swatch`.
2. The InventoryPanel iterates `WEAPON_KINDS` so the new recipe shows up automatically.
3. `pickWeaponForRange` will pick it when its reach covers the target.
4. No `WORLD_VERSION` bump needed unless you also change the `WeaponInstance` shape.

### Add a resource

1. Append to the `ResourceKind` union and `RESOURCES` map in `content/resources.ts`. Set `food: true` if it should be eatable.
2. Add it to the relevant biome's `BIOME_RESOURCES` list.
3. Render its icon in `BiomeScene.drawResourceIcon` (mirror an existing case).
4. Bump `WORLD_VERSION` if any code reads/writes the new key from saved interiors.

### Tune combat or AI

- Per-attack damage / cooldown / weapons: `lib/sim/combat.ts` (`COMBAT_COOLDOWN_TICKS`, `ENGAGED_TTL_TICKS`, `REGION_PAIRS_PER_TICK`).
- Region chase / friendly flee perception: `NPC_PERCEPTION_REGIONS`, `FLEE_TTL_TICKS` in `lib/sim/npc.ts`.
- Player rep penalties: `resolvePlayerAttack` in `lib/sim/combat.ts` (5 per hit, +10 on kill by default).
- Faction-vs-faction relation drift: `nudgeRelation` calls in `tickRegionCombat` / `attackNpcByNpc`.

### Add a HUD / panel surface

Mount in `app/play/page.tsx`. Read selection / state from the Zustand store. Reuse the slide-up panel chrome — `rounded-3xl border bg-[var(--color-surface)] shadow-[…]`. If the surface owns its own selection key (like `inventoryOpen` or `npcContextMenu`), wire mutually-exclusive logic in the store action that opens it. Hit targets ≥ 44px on mobile.

## Coding conventions

- **No comments unless the WHY is non-obvious.** Don't explain what well-named code already says. Don't reference the current task or PR ("added for X feature") — that belongs in commit messages.
- **No unnecessary new files.** Edit existing files when possible. Don't create README/CHANGELOG/docs files unless the user asks.
- **Don't over-engineer.** Don't add abstractions, error handling, or fallbacks for cases that can't happen. Trust internal invariants; only validate at the system boundary.
- **No emojis** in source, markup, or commit messages.
- **Strict TS.** Use proper types. `noUncheckedIndexedAccess` is on, so `arr[i]` is `T | undefined` — handle that explicitly.
- **Path alias.** Use `@/...` from anywhere in the app to reference repo-root-relative paths (configured in `tsconfig.json`).

## Workflow

`main` is the only persistent branch. There is no `dev`. Every task happens in a short-lived branch checked out as a git **worktree** so multiple sessions can run in parallel without stepping on each other.

**For each task:**

```bash
# Create a worktree off the latest main, on a new branch.
git fetch origin main
git worktree add ../emergentrpg-<task-name> -b claude/<task-name> origin/main

cd ../emergentrpg-<task-name>
# ...edit, commit...
git push -u origin claude/<task-name>
```

Then open a PR against `main` (use `mcp__github__create_pull_request` from the GitHub MCP). When the PR merges, GitHub deletes the branch automatically; remove the worktree with `git worktree remove ../emergentrpg-<task-name>`.

**Rules:**

- Branch names use the `claude/<short-task-name>` convention (the Claude Code harness already follows this).
- `main` is protected; merges go through PRs with passing CI. Don't try to push to `main` directly.
- `npm run typecheck && npm run lint && npm run build` must all pass before pushing.
- Vercel publishes a preview URL on every push — open it on a phone before requesting merge.
- Don't keep stale branches around. After a PR merges, the branch goes away. If you find a branch other than `main` left over from a previous session, it's probably safe to delete (confirm with the user first).
- Signed commits aren't enforced. Bot commits pushed via the GitHub MCP / Claude Code on the web aren't GPG-signed by default — that's expected and fine.

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
- **Workbench / tool-gated crafting.** Phase 4. The InventoryPanel has a "Gear (coming soon)" placeholder.
- **Sword / bow / armour / status effects.** Phase 4+.
- **Group combat / formations.** Future.
- **Dialogue trees.** Stub only — encounters are friendly-gift / hostile-fight today.
- **Line-of-sight for ranged attacks.** Sling shots ignore obstacles; LoS lands later.
- **NPCs equipping their own weapons.** NPC `weapon` field exists but spawn always sets it to null.
- **Real art assets.** Placeholder solid-disc PNGs and procedural tile colours are deliberate.
- **Reintroducing Unity, native, 3D.**

## When in doubt

- The user develops on a phone. Every change has to work in mobile browsers — viewport, touch, no hover-only interactions.
- The aesthetic is Mini Motorways. When uncertain about a visual choice, lean towards calm, geometric, light, square.
- The simulation is small on purpose. Don't expand scope; tighten what's there.
