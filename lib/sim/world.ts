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
import { tickCombat } from "@/lib/sim/combat";

export { biomeAt, isPassable, type Biome } from "@/lib/sim/biome";

export const WORLD_VERSION = 8;
export const MAP_W = 32;
export const MAP_H = 32;
export const NPC_COUNT = 200;
// Presence accumulates per tick and decays slowly so faction zones develop
// and persist a while after NPCs leave. Tuned so a single NPC sitting on a
// region for ~5 ticks (~1.25s at 1x) crosses the control threshold, and a
// region keeps its controller for ~30s after the last visitor walks away.
const CONTROL_DECAY_EVERY = 16;
const CONTROL_DECAY_FACTOR = 0.85;
const CONTROL_THRESHOLD = 5;
const CONTROL_DROP_BELOW = 0.5;

export type GameOverReason =
  | "starved"
  | { kind: "killed"; killerNpcId: string; killerName: string; factionId: string };

export type PickupNotice = {
  id: string;
  tick: number;
  kind: import("@/content/resources").ResourceKind;
  amount: number;
};

export type ProjectileFx = {
  id: string;
  tick: number;
  fromGx: number;
  fromGy: number;
  toGx: number;
  toGy: number;
  color: number;
};

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
  // factionId -> per-player reputation. Drives hostile/friendly encounters.
  playerReputation: Record<string, number>;
  // pairKey(a,b) -> faction-vs-faction relation. Negative = hostile.
  factionRelations: Record<string, number>;
  // Ring buffer of recent player pickups (resources + loot). Ephemeral —
  // BiomeScene drains them to spawn floating text and they fall off after
  // a short window.
  recentPickups: PickupNotice[];
  // Same idea for ranged projectile fx — short-lived dotted-line shots.
  recentProjectiles: ProjectileFx[];
  // factionId -> last tick at which a member was attacked. Friendlies of
  // an aggrieved faction flee from the player while this is fresh.
  recentFactionAttacks: Record<string, number>;
  gameOver: boolean;
  gameOverReason: GameOverReason | null;
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
    playerReputation: {},
    factionRelations: {},
    recentPickups: [],
    recentProjectiles: [],
    recentFactionAttacks: {},
    gameOver: false,
    gameOverReason: null,
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
  const playerRegion = world.player ? globalToLocal(world.player.gx, world.player.gy) : null;
  const ticks = world.ticks + 1;
  const tickCtx = {
    rng,
    mapW: MAP_W,
    mapH: MAP_H,
    regionControl: world.regionControl,
    npcs: world.npcs,
    playerRegion: playerRegion ? { rx: playerRegion.rx, ry: playerRegion.ry } : null,
    playerReputation: world.playerReputation,
    recentFactionAttacks: world.recentFactionAttacks,
    ticks,
  };
  let npcs = world.npcs.map((n) => tickNpc(n, tickCtx));

  let player = world.player;
  let interiors = world.biomeInteriors;
  let inventory = world.inventory;
  let factions = world.factions;
  let factionRelations = world.factionRelations;
  let playerReputation = world.playerReputation;
  let recentPickups = prunePickups(world.recentPickups, ticks);
  let recentProjectiles = pruneProjectiles(world.recentProjectiles, ticks);
  let recentFactionAttacks = world.recentFactionAttacks;
  const combatDeathEvents: WorldEvent[] = [];
  let gameOver: boolean = world.gameOver;
  let gameOverReason: GameOverReason | null = world.gameOverReason;
  let discoveredRegions = world.discoveredRegions;

  if (player) {
    const stepped = tickPlayer({
      player,
      interiors,
      inventory,
      npcs,
      playerReputation,
      rng,
      ticks,
    });
    player = stepped.player;
    interiors = stepped.interiors;
    inventory = stepped.inventory;
    const npcsBefore = npcs;
    npcs = stepped.npcs;
    playerReputation = stepped.playerReputation;
    // Stamp the player's faction-attack ledger when an NPC took damage from
    // the player this tick (detected by health drop on a still-living NPC).
    for (const before of npcsBefore) {
      const after = npcs.find((n) => n.id === before.id);
      if (!after) {
        // NPC removed from list — handled separately as a death.
        continue;
      }
      if (after.combatHealth < before.combatHealth) {
        recentFactionAttacks = {
          ...recentFactionAttacks,
          [after.factionId]: ticks,
        };
      }
    }
    if (stepped.projectiles.length > 0) {
      let next = recentProjectiles;
      for (const p of stepped.projectiles) {
        next = [
          ...next,
          {
            id: `proj-${ticks}-${next.length}`,
            tick: ticks,
            fromGx: p.fromGx,
            fromGy: p.fromGy,
            toGx: p.toGx,
            toGy: p.toGy,
            color: 0xd96846,
          },
        ];
      }
      recentProjectiles = next.slice(-12);
    }
    if (stepped.pickups.length > 0) {
      let next = recentPickups;
      for (const p of stepped.pickups) {
        next = [
          ...next,
          {
            id: `pkp-${ticks}-${next.length}`,
            tick: ticks,
            kind: p.kind,
            amount: p.amount,
          },
        ];
      }
      recentPickups = next.slice(-12);
    }
    if (stepped.death) {
      gameOver = true;
      gameOverReason = "starved";
      const dropped = dropDeathLoot(player, inventory, interiors, ticks);
      interiors = dropped.interiors;
      inventory = {};
      player = {
        ...player,
        weapons: [],
        route: null,
        pendingAction: null,
        stepCooldown: 0,
      };
    }

    const cur = globalToLocal(player.gx, player.gy);
    const key = regionKey(cur.rx, cur.ry);
    if (!discoveredRegions[key]) {
      discoveredRegions = { ...discoveredRegions, [key]: true as const };
    }
    interiors = ensureNeighbors(interiors, world.seed, cur.rx, cur.ry);
  }

  if (!gameOver) {
    const combat = tickCombat(
      {
        npcs,
        player,
        interiors,
        factions,
        factionRelations,
        playerReputation,
        mapW: MAP_W,
        mapH: MAP_H,
        ticks,
      },
      rng,
    );
    npcs = combat.npcs;
    player = combat.player;
    interiors = combat.interiors;
    factions = combat.factions;
    factionRelations = combat.factionRelations;
    playerReputation = combat.playerReputation;
    if (combat.playerKilledBy && player && player.health <= 0) {
      gameOver = true;
      gameOverReason = {
        kind: "killed",
        killerNpcId: combat.playerKilledBy.npcId,
        killerName: combat.playerKilledBy.name,
        factionId: combat.playerKilledBy.factionId,
      };
      const dropped = dropDeathLoot(player, inventory, interiors, ticks);
      interiors = dropped.interiors;
      inventory = {};
      player = {
        ...player,
        weapons: [],
        route: null,
        pendingAction: null,
        stepCooldown: 0,
      };
    }
    // Build combat-death events to splice into the feed below.
    for (const d of combat.deaths) {
      const killer = d.killerName ? `${d.killerName} ` : "";
      combatDeathEvents.push({
        id: `kill-${ticks}-${d.npcId}`,
        tick: ticks,
        topic: d.killerKind === "player" ? "combat:player-kill" : "combat:npc-kill",
        context:
          d.killerKind === "player"
            ? `You killed ${d.name}.`
            : `${killer}killed ${d.name}.`,
      });
    }
    // Remove dead NPCs from the canonical list.
    npcs = npcs.filter((n) => n.combatHealth > 0);
  }

  const built = updatePresence(
    world.regionPresence,
    npcs,
    ticks % CONTROL_DECAY_EVERY === 0,
  );
  const regionPresence = built.presence;
  const regionControl = built.control;

  const startingEvents =
    combatDeathEvents.length > 0
      ? [...combatDeathEvents, ...world.recentEvents].slice(0, 8)
      : world.recentEvents;
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
    factions,
    factionRelations,
    playerReputation,
    recentPickups,
    recentProjectiles,
    recentFactionAttacks,
    recentEvents: startingEvents,
    gameOver,
    gameOverReason,
  };

  let encounter: WorldEvent | null = null;
  if (player) {
    const region = globalToLocal(player.gx, player.gy);
    encounter = detectEncounter(world.npcs, npcs, next, region, rng);
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

function updatePresence(
  prev: Record<string, Partial<Record<string, number>>>,
  npcs: Npc[],
  decay: boolean,
): {
  presence: Record<string, Partial<Record<string, number>>>;
  control: Record<string, string>;
} {
  const presence: Record<string, Partial<Record<string, number>>> = {};
  for (const key of Object.keys(prev)) {
    const cell = prev[key];
    if (!cell) continue;
    const nextCell: Partial<Record<string, number>> = {};
    let any = false;
    for (const [factionId, score] of Object.entries(cell)) {
      const s = score ?? 0;
      const decayed = decay ? s * CONTROL_DECAY_FACTOR : s;
      if (decayed >= CONTROL_DROP_BELOW) {
        nextCell[factionId] = decayed;
        any = true;
      }
    }
    if (any) presence[key] = nextCell;
  }
  for (const n of npcs) {
    const key = regionKey(n.rx, n.ry);
    const cell = presence[key] ?? (presence[key] = {});
    cell[n.factionId] = (cell[n.factionId] ?? 0) + 1;
  }
  const control: Record<string, string> = {};
  for (const key of Object.keys(presence)) {
    const cell = presence[key]!;
    let bestId: string | null = null;
    let bestScore = 0;
    let tied = false;
    for (const [factionId, score] of Object.entries(cell)) {
      const s = score ?? 0;
      if (s > bestScore) {
        bestScore = s;
        bestId = factionId;
        tied = false;
      } else if (s === bestScore && s > 0) {
        tied = true;
      }
    }
    if (bestId && !tied && bestScore >= CONTROL_THRESHOLD) {
      control[key] = bestId;
    }
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
  const prevById = new Map<string, Npc>();
  for (const p of prevNpcs) prevById.set(p.id, p);
  for (const next of nextNpcs) {
    const prev = prevById.get(next.id);
    if (!prev) continue;
    if (prev.rx === next.rx && prev.ry === next.ry) continue;
    if (next.rx !== playerRegion.rx || next.ry !== playerRegion.ry) continue;
    const faction = findFaction(world.factions, next.factionId);
    if (!faction) continue;
    return buildEncounterEvent(world, next, faction, rng);
  }
  return null;
}

function dropDeathLoot(
  player: Player,
  inventory: Inventory,
  interiors: Record<string, BiomeInterior>,
  ticks: number,
): { interiors: Record<string, BiomeInterior> } {
  const { rx, ry, lx, ly } = globalToLocal(player.gx, player.gy);
  const k = regionKey(rx, ry);
  const interior = interiors[k];
  if (!interior) return { interiors };
  const items: Inventory = {};
  for (const key of Object.keys(inventory) as Array<keyof Inventory>) {
    const v = inventory[key] ?? 0;
    if (v > 0) items[key] = v;
  }
  const weapons = player.weapons.length > 0 ? [...player.weapons] : undefined;
  if (Object.keys(items).length === 0 && !weapons) return { interiors };
  const pile = {
    id: `grave-${ticks}-${rx}-${ry}-${lx}-${ly}`,
    lx,
    ly,
    items,
    weapons,
    fromDeath: true,
  };
  const next = { ...interior, loot: [...interior.loot, pile] };
  return { interiors: { ...interiors, [k]: next } };
}

// Pickups are short-lived (UI hints). After ~10 ticks (~2.5s at 1x), drop.
const PICKUP_TTL_TICKS = 10;
const PROJECTILE_TTL_TICKS = 4;
function prunePickups(prev: PickupNotice[], ticks: number): PickupNotice[] {
  const out: PickupNotice[] = [];
  for (const p of prev) {
    if (ticks - p.tick <= PICKUP_TTL_TICKS) out.push(p);
  }
  return out;
}
function pruneProjectiles(prev: ProjectileFx[], ticks: number): ProjectileFx[] {
  const out: ProjectileFx[] = [];
  for (const p of prev) {
    if (ticks - p.tick <= PROJECTILE_TTL_TICKS) out.push(p);
  }
  return out;
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
