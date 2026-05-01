import { createRng } from "@/lib/sim/rng";
import { initialFactions, findFaction, type FactionState } from "@/lib/sim/faction";
import { spawnNpc, tickNpc, type Npc } from "@/lib/sim/npc";
import {
  buildEncounterEvent,
  maybeEmitEvent,
  type WorldEvent,
} from "@/lib/sim/events";
import {
  generateInterior,
  globalToLocal,
  isLocalObstacle,
  regionCenterGlobal,
  regionKey,
  type BiomeInterior,
} from "@/lib/sim/biome-interior";
import type { Player } from "@/lib/sim/player";
import { createPlayer } from "@/lib/sim/player";
import { tickPlayer } from "@/lib/sim/player-tick";
import type { Inventory } from "@/lib/sim/inventory";
import { biomeAt, isPassable, type Biome } from "@/lib/sim/biome";

export { biomeAt, isPassable, type Biome } from "@/lib/sim/biome";

export const WORLD_VERSION = 6;
export const MAP_W = 32;
export const MAP_H = 32;
export const NPC_COUNT = 200;
const CONTROL_REBUILD_EVERY = 4;

export type World = {
  version: number;
  seed: number;
  rngState: number;
  ticks: number;
  npcs: Npc[];
  factions: FactionState[];
  recentEvents: WorldEvent[];
  player: Player | null;
  home: { rx: number; ry: number } | null;
  biomeInteriors: Record<string, BiomeInterior>;
  inventory: Inventory;
  // regionKey -> factionId -> presence count (sparse)
  regionPresence: Record<string, Partial<Record<string, number>>>;
  // regionKey -> factionId of the faction currently controlling this region
  regionControl: Record<string, string>;
  // Set as the player visits regions. Phase 4 reads this for fog-of-war
  // on the world map; for Phase 1 it's just bookkeeping.
  discoveredRegions: Record<string, true>;
  gameOver: boolean;
};

export function createWorld(seed = Date.now() & 0xffffffff): World {
  const rng = createRng(seed);
  const npcs: Npc[] = [];
  for (let i = 0; i < NPC_COUNT; i++) npcs.push(spawnNpc(rng, i, MAP_W, MAP_H));
  return {
    version: WORLD_VERSION,
    seed,
    rngState: rng.state(),
    ticks: 0,
    npcs,
    factions: initialFactions(),
    recentEvents: [],
    player: null,
    home: null,
    biomeInteriors: {},
    inventory: {},
    regionPresence: {},
    regionControl: {},
    discoveredRegions: {},
    gameOver: false,
  };
}

export function findNpc(world: World, id: string): Npc | undefined {
  return world.npcs.find((n) => n.id === id);
}

export function ensureInteriorsForRegion(world: World, rx: number, ry: number): World {
  const targets: Array<[number, number]> = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const x = rx + dx;
      const y = ry + dy;
      if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) continue;
      if (!world.biomeInteriors[regionKey(x, y)]) targets.push([x, y]);
    }
  }
  if (targets.length === 0) return world;
  const next = { ...world.biomeInteriors };
  for (const [x, y] of targets) {
    next[regionKey(x, y)] = generateInterior(world.seed, x, y);
  }
  return { ...world, biomeInteriors: next };
}

export function claimHome(world: World, rx: number, ry: number): World | null {
  if (!isPassable(rx, ry, MAP_W, MAP_H)) return null;
  const biome: Biome = biomeAt(rx, ry);
  if (biome === "water") return null;

  const seeded = ensureInteriorsForRegion(world, rx, ry);
  const center = regionCenterGlobal(rx, ry);
  const interior = seeded.biomeInteriors[regionKey(rx, ry)];
  if (!interior) return null;

  const spawn = nudgeToOpen(seeded, center.gx, center.gy);
  const player = createPlayer(spawn);
  const discoveredRegions = { ...seeded.discoveredRegions, [regionKey(rx, ry)]: true as const };
  return {
    ...seeded,
    player,
    home: { rx, ry },
    discoveredRegions,
  };
}

export function tickWorld(world: World): { world: World; event: WorldEvent | null } {
  if (world.gameOver) return { world, event: null };

  const rng = createRng(world.rngState);
  const tickCtx = {
    rng,
    mapW: MAP_W,
    mapH: MAP_H,
    regionControl: world.regionControl,
    npcs: world.npcs,
  };
  const npcs = world.npcs.map((n) => tickNpc(n, tickCtx));
  const ticks = world.ticks + 1;

  let player = world.player;
  let interiors = world.biomeInteriors;
  let inventory = world.inventory;
  let gameOver: boolean = world.gameOver;
  let discoveredRegions = world.discoveredRegions;

  if (player) {
    const stepped = tickPlayer({ player, interiors, inventory });
    player = stepped.player;
    interiors = stepped.interiors;
    inventory = stepped.inventory;
    if (stepped.death) {
      gameOver = true;
      player = { ...player, route: null, pendingAction: null, stepCooldown: 0 };
    }

    const cur = globalToLocal(player.gx, player.gy);
    const key = regionKey(cur.rx, cur.ry);
    if (!discoveredRegions[key]) {
      discoveredRegions = { ...discoveredRegions, [key]: true as const };
    }
    interiors = ensureNeighbors(interiors, world.seed, cur.rx, cur.ry);
  }

  let regionPresence = world.regionPresence;
  let regionControl = world.regionControl;
  if (ticks % CONTROL_REBUILD_EVERY === 0) {
    const built = buildPresence(npcs);
    regionPresence = built.presence;
    regionControl = built.control;
  }

  const next: World = {
    ...world,
    ticks,
    npcs,
    rngState: rng.state(),
    player,
    biomeInteriors: interiors,
    inventory,
    regionPresence,
    regionControl,
    discoveredRegions,
    gameOver,
  };

  let encounter: WorldEvent | null = null;
  if (player) {
    const playerRegion = globalToLocal(player.gx, player.gy);
    encounter = detectEncounter(world.npcs, npcs, next, playerRegion, rng);
    if (encounter) {
      next.recentEvents = [encounter, ...next.recentEvents].slice(0, 8);
      next.rngState = rng.state();
    }
  }

  let event: WorldEvent | null = encounter;
  if (!event) {
    event = maybeEmitEvent(next, rng);
    if (event) {
      next.recentEvents = [event, ...next.recentEvents].slice(0, 8);
      next.rngState = rng.state();
    }
  }
  return { world: next, event };
}

function buildPresence(npcs: Npc[]): {
  presence: Record<string, Partial<Record<string, number>>>;
  control: Record<string, string>;
} {
  const presence: Record<string, Partial<Record<string, number>>> = {};
  for (const n of npcs) {
    const key = regionKey(n.rx, n.ry);
    const cell = presence[key] ?? (presence[key] = {});
    cell[n.factionId] = (cell[n.factionId] ?? 0) + 1;
  }
  const control: Record<string, string> = {};
  for (const key of Object.keys(presence)) {
    const cell = presence[key]!;
    let bestId: string | null = null;
    let bestCount = 0;
    let tied = false;
    for (const [factionId, count] of Object.entries(cell)) {
      const c = count ?? 0;
      if (c > bestCount) {
        bestCount = c;
        bestId = factionId;
        tied = false;
      } else if (c === bestCount && c > 0) {
        tied = true;
      }
    }
    if (bestId && !tied) control[key] = bestId;
  }
  return { presence, control };
}

function detectEncounter(
  prevNpcs: Npc[],
  nextNpcs: Npc[],
  world: World,
  playerRegion: { rx: number; ry: number; lx: number; ly: number },
  rng: import("@/lib/sim/rng").Rng,
): WorldEvent | null {
  for (let i = 0; i < nextNpcs.length; i++) {
    const next = nextNpcs[i]!;
    const prev = prevNpcs[i];
    if (!prev) continue;
    if (prev.rx === next.rx && prev.ry === next.ry) continue;
    if (next.rx !== playerRegion.rx || next.ry !== playerRegion.ry) continue;
    const faction = findFaction(world.factions, next.factionId);
    if (!faction) continue;
    return buildEncounterEvent(world, next, faction, rng);
  }
  return null;
}

function ensureNeighbors(
  interiors: Record<string, BiomeInterior>,
  seed: number,
  rx: number,
  ry: number,
): Record<string, BiomeInterior> {
  let next = interiors;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const x = rx + dx;
      const y = ry + dy;
      if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) continue;
      const key = regionKey(x, y);
      if (next[key]) continue;
      if (next === interiors) next = { ...interiors };
      next[key] = generateInterior(seed, x, y);
    }
  }
  return next;
}

function nudgeToOpen(world: World, gx: number, gy: number): { gx: number; gy: number } {
  for (let r = 0; r <= 4; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const nx = gx + dx;
        const ny = gy + dy;
        const { rx, ry, lx, ly } = globalToLocal(nx, ny);
        const interior = world.biomeInteriors[regionKey(rx, ry)];
        if (!interior) continue;
        if (!isLocalObstacle(interior, lx, ly)) return { gx: nx, gy: ny };
      }
    }
  }
  return { gx, gy };
}
