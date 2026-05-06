import { createRng, type Rng } from "@/lib/sim/rng";
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
import {
  decayReputation,
  pickFactionOfOrigin,
  pickLifeName,
  type Legacy,
} from "@/lib/sim/legacy";
import { FACTIONS } from "@/content/factions";
import {
  countDiscoveredRegions,
  effectivePerception,
  markPerceptionDiscovered,
} from "@/lib/sim/fog";

export { biomeAt, isPassable, type Biome } from "@/lib/sim/biome";

export const WORLD_VERSION = 17;
export const MAP_W = 32;
export const MAP_H = 32;
export const NPC_COUNT = 200;
export const REPUTATION_DECAY_ON_REBIRTH = 0.5;
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

export type MapMarker = {
  id: string;
  rx: number;
  ry: number;
  name: string;
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

// Per-life state. Dropped wholesale on death and rebuilt by beginNewLife.
// Persistent world data (npcs, factions, biomeInteriors, regionControl,
// playerReputation, legacies, etc.) lives at the top level on World.
export type LifeState = {
  player: Player;
  inventory: Inventory;
  bornAtTick: number;
  kills: number;
  discoveredThisLife: Record<string, Uint8Array>;
  recentPickups: PickupNotice[];
  recentProjectiles: ProjectileFx[];
  gameOver: boolean;
  gameOverReason: GameOverReason | null;
};

export type World = {
  version: number;
  seed: number;
  rngState: number;
  ticks: number;
  npcs: Npc[];
  factions: FactionState[];
  recentEvents: WorldEvent[];
  home: { rx: number; ry: number } | null;
  biomeInteriors: Record<string, BiomeInterior>;
  // regionKey -> factionId -> presence count (sparse)
  regionPresence: Record<string, Partial<Record<string, number>>>;
  // regionKey -> factionId of the faction currently controlling this region
  regionControl: Record<string, string>;
  // Per-region 20x20 tile bitmaps marking tiles ever within perception of
  // the player. Drives fog-of-war on both the biome and world maps.
  discoveredTiles: Record<string, Uint8Array>;
  // Kinds the player has explicitly examined. Drives whether obstacle
  // blurbs and (later) item descriptions are revealed in the UI.
  examinedKinds: Record<string, true>;
  // Player-placed map markers. Persist across lives.
  mapMarkers: MapMarker[];
  // factionId -> per-player reputation. Drives hostile/friendly encounters.
  // Halved on rebirth so past misdeeds linger but don't doom the new life.
  playerReputation: Record<string, number>;
  // pairKey(a,b) -> faction-vs-faction relation. Negative = hostile.
  factionRelations: Record<string, number>;
  // factionId -> last tick at which a member was attacked. Friendlies of
  // an aggrieved faction flee from the player while this is fresh.
  recentFactionAttacks: Record<string, number>;
  // Append-only ledger of completed lives.
  legacies: Legacy[];
  // The current life (or null if nobody lives — pre-first-claim or between
  // game-over and rebirth).
  life: LifeState | null;
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
    home: null,
    biomeInteriors: {},
    regionPresence: {},
    regionControl: {},
    discoveredTiles: {},
    examinedKinds: {},
    mapMarkers: [],
    playerReputation: {},
    factionRelations: {},
    recentFactionAttacks: {},
    legacies: [],
    life: null,
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

function takenNpcNames(npcs: Npc[]): string[] {
  return npcs.map((n) => n.name);
}

function makeLife(
  spawn: { gx: number; gy: number },
  identity: { name: string; factionOfOriginId: string },
  bornAtTick: number,
): LifeState {
  return {
    player: createPlayer(spawn, identity),
    inventory: {},
    bornAtTick,
    kills: 0,
    discoveredThisLife: {},
    recentPickups: [],
    recentProjectiles: [],
    gameOver: false,
    gameOverReason: null,
  };
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
  const rng = createRng(seeded.rngState);
  const identity = {
    name: pickLifeName(rng, takenNpcNames(seeded.npcs)),
    factionOfOriginId: pickFactionOfOrigin(rng),
  };
  const life = makeLife(spawn, identity, seeded.ticks);
  const perception = effectivePerception(life.player);
  const discoveredTiles = markPerceptionDiscovered(
    seeded.discoveredTiles,
    spawn.gx,
    spawn.gy,
    perception,
    MAP_W,
    MAP_H,
  );
  const discoveredThisLife = markPerceptionDiscovered(
    {},
    spawn.gx,
    spawn.gy,
    perception,
    MAP_W,
    MAP_H,
  );
  return {
    ...seeded,
    rngState: rng.state(),
    home: { rx, ry },
    discoveredTiles,
    life: { ...life, discoveredThisLife },
  };
}

// Pick a random passable forest region using the world's rng and claim it
// as home. Used to drop a fresh game straight into play without making the
// player choose a starting region.
export function claimRandomForestHome(world: World): World | null {
  const rng = createRng(world.rngState);
  const candidates: Array<{ rx: number; ry: number }> = [];
  for (let ry = 0; ry < MAP_H; ry++) {
    for (let rx = 0; rx < MAP_W; rx++) {
      if (biomeAt(rx, ry) !== "forest") continue;
      if (!isPassable(rx, ry, MAP_W, MAP_H)) continue;
      candidates.push({ rx, ry });
    }
  }
  if (candidates.length === 0) {
    for (let ry = 0; ry < MAP_H; ry++) {
      for (let rx = 0; rx < MAP_W; rx++) {
        if (!isPassable(rx, ry, MAP_W, MAP_H)) continue;
        if (biomeAt(rx, ry) === "water") continue;
        candidates.push({ rx, ry });
      }
    }
  }
  if (candidates.length === 0) return null;
  const pick = candidates[rng.int(0, candidates.length)]!;
  return claimHome({ ...world, rngState: rng.state() }, pick.rx, pick.ry);
}

// Build the next life on top of the existing world. Called after a death
// when the player taps "Begin a new life". Picks a deterministic spawn
// (home if friendly, else nearest passable friendly-or-neutral region —
// preferring regions with a wandering NPC of the new player's faction-of-
// origin), halves player reputation, and assigns a fresh name + faction.
export function beginNewLife(world: World): World {
  const rng = createRng(world.rngState);
  const identity = {
    name: pickLifeName(rng, takenNpcNames(world.npcs)),
    factionOfOriginId: pickFactionOfOrigin(rng),
  };
  const playerReputation = decayReputation(
    world.playerReputation,
    REPUTATION_DECAY_ON_REBIRTH,
  );

  let seeded = world;
  let spawnRegion: { rx: number; ry: number } | null = null;
  const home = seeded.home;
  if (home) {
    seeded = ensureInteriorsForRegion(seeded, home.rx, home.ry);
    if (!isHostileRegion(seeded, home.rx, home.ry, playerReputation)) {
      spawnRegion = home;
    }
  }
  if (!spawnRegion) {
    const wandering = pickWanderingFactionRegion(seeded, identity.factionOfOriginId);
    if (wandering) spawnRegion = wandering;
  }
  if (!spawnRegion) {
    const fallback =
      nearestFriendlyRegion(seeded, seeded.home ?? { rx: 0, ry: 0 }, playerReputation) ??
      seeded.home ??
      pickAnyPassableRegion(seeded);
    spawnRegion = fallback;
  }

  seeded = ensureInteriorsForRegion(seeded, spawnRegion.rx, spawnRegion.ry);
  const center = regionCenterGlobal(spawnRegion.rx, spawnRegion.ry);
  const spawn = nudgeToOpen(seeded, center.gx, center.gy);
  const life = makeLife(spawn, identity, seeded.ticks);
  const perception = effectivePerception(life.player);
  const discoveredTiles = markPerceptionDiscovered(
    seeded.discoveredTiles,
    spawn.gx,
    spawn.gy,
    perception,
    MAP_W,
    MAP_H,
  );
  const discoveredThisLife = markPerceptionDiscovered(
    {},
    spawn.gx,
    spawn.gy,
    perception,
    MAP_W,
    MAP_H,
  );
  return {
    ...seeded,
    rngState: rng.state(),
    playerReputation,
    discoveredTiles,
    life: { ...life, discoveredThisLife },
  };
}

function isHostileRegion(
  world: World,
  rx: number,
  ry: number,
  rep: Record<string, number>,
): boolean {
  const controllerId = world.regionControl[regionKey(rx, ry)];
  if (!controllerId) return false;
  if ((rep[controllerId] ?? 0) < 0) return true;
  const def = FACTIONS.find((f) => f.id === controllerId);
  if (def?.values.includes("violence")) return true;
  return false;
}

function pickWanderingFactionRegion(
  world: World,
  factionId: string,
): { rx: number; ry: number } | null {
  for (const n of world.npcs) {
    if (n.factionId !== factionId) continue;
    if (!isPassable(n.rx, n.ry, MAP_W, MAP_H)) continue;
    return { rx: n.rx, ry: n.ry };
  }
  return null;
}

function nearestFriendlyRegion(
  world: World,
  from: { rx: number; ry: number },
  rep: Record<string, number>,
): { rx: number; ry: number } | null {
  const seen = new Set<string>();
  const queue: Array<{ rx: number; ry: number }> = [{ rx: from.rx, ry: from.ry }];
  seen.add(regionKey(from.rx, from.ry));
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (
      isPassable(cur.rx, cur.ry, MAP_W, MAP_H) &&
      biomeAt(cur.rx, cur.ry) !== "water" &&
      !isHostileRegion(world, cur.rx, cur.ry, rep)
    ) {
      return cur;
    }
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = cur.rx + dx;
      const ny = cur.ry + dy;
      if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
      const k = regionKey(nx, ny);
      if (seen.has(k)) continue;
      seen.add(k);
      queue.push({ rx: nx, ry: ny });
    }
  }
  return null;
}

function pickAnyPassableRegion(world: World): { rx: number; ry: number } {
  for (let ry = 0; ry < MAP_H; ry++) {
    for (let rx = 0; rx < MAP_W; rx++) {
      if (isPassable(rx, ry, MAP_W, MAP_H) && biomeAt(rx, ry) !== "water") {
        return { rx, ry };
      }
    }
  }
  return { rx: 0, ry: 0 };
}

export function tickWorld(world: World): {
  world: World;
  event: WorldEvent | null;
  workbenchOpened: boolean;
} {
  if (world.life?.gameOver) return { world, event: null, workbenchOpened: false };

  const rng = createRng(world.rngState);
  const life = world.life;
  const playerRegion = life ? globalToLocal(life.player.gx, life.player.gy) : null;
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

  let player: Player | null = life?.player ?? null;
  let inventory: Inventory = life?.inventory ?? {};
  let interiors = world.biomeInteriors;
  let factions = world.factions;
  let factionRelations = world.factionRelations;
  let playerReputation = world.playerReputation;
  let recentPickups = prunePickups(life?.recentPickups ?? [], ticks);
  let recentProjectiles = pruneProjectiles(life?.recentProjectiles ?? [], ticks);
  let recentFactionAttacks = world.recentFactionAttacks;
  const combatDeathEvents: WorldEvent[] = [];
  let gameOver = false;
  let gameOverReason: GameOverReason | null = null;
  let discoveredTiles = world.discoveredTiles;
  let discoveredThisLife = life?.discoveredThisLife ?? {};
  let kills = life?.kills ?? 0;
  let workbenchOpened = false;

  if (player && life) {
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
    if (stepped.workbenchOpened) workbenchOpened = true;
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
        tools: [],
        route: null,
        pendingAction: null,
        actionProgress: null,
        stepCooldown: 0,
      };
    }

    const cur = globalToLocal(player.gx, player.gy);
    const perception = effectivePerception(player);
    discoveredTiles = markPerceptionDiscovered(
      discoveredTiles,
      player.gx,
      player.gy,
      perception,
      MAP_W,
      MAP_H,
    );
    discoveredThisLife = markPerceptionDiscovered(
      discoveredThisLife,
      player.gx,
      player.gy,
      perception,
      MAP_W,
      MAP_H,
    );
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
        tools: [],
        route: null,
        pendingAction: null,
        actionProgress: null,
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
      if (d.killerKind === "player") kills += 1;
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

  let nextLife: LifeState | null = null;
  let nextLegacies = world.legacies;
  if (life) {
    if (gameOver && player) {
      const cause = gameOverReason!;
      nextLife = {
        ...life,
        player,
        inventory,
        recentPickups,
        recentProjectiles,
        kills,
        discoveredThisLife,
        gameOver: true,
        gameOverReason: cause,
      };
      nextLegacies = [
        ...world.legacies,
        {
          id: `life-${ticks}-${life.player.name}`,
          name: life.player.name,
          factionOfOriginId: life.player.factionOfOriginId,
          bornAtTick: life.bornAtTick,
          endedAtTick: ticks,
          ticksAlive: Math.max(0, ticks - life.bornAtTick),
          regionsDiscovered: countDiscoveredRegions(discoveredThisLife),
          kills,
          cause,
        },
      ];
    } else if (player) {
      nextLife = {
        ...life,
        player,
        inventory,
        recentPickups,
        recentProjectiles,
        kills,
        discoveredThisLife,
        gameOver: false,
        gameOverReason: null,
      };
    }
  }

  const next: World = {
    ...world,
    ticks,
    npcs,
    rngState: rng.state(),
    biomeInteriors: interiors,
    regionPresence,
    regionControl,
    discoveredTiles,
    factions,
    factionRelations,
    playerReputation,
    recentFactionAttacks,
    recentEvents: startingEvents,
    legacies: nextLegacies,
    life: nextLife,
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
  return { world: next, event, workbenchOpened };
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
  rng: Rng,
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
  const tools = player.tools.length > 0 ? [...player.tools] : undefined;
  if (Object.keys(items).length === 0 && !weapons && !tools) return { interiors };
  const pile = {
    id: `grave-${ticks}-${rx}-${ry}-${lx}-${ly}`,
    lx,
    ly,
    items,
    weapons,
    tools,
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
