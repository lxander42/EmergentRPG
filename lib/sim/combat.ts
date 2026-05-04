import type { Rng } from "@/lib/sim/rng";
import type { Npc, NpcInterior } from "@/lib/sim/npc";
import type { Player } from "@/lib/sim/player";
import type { FactionState } from "@/lib/sim/faction";
import {
  isFactionHostile,
  losePlayerRep,
  nudgePower,
  nudgeRelation,
} from "@/lib/sim/faction";
import {
  addLoot,
  globalToLocal,
  regionKey,
  findPassableTile,
  INTERIOR_W,
  INTERIOR_H,
  type BiomeInterior,
  type LootPile,
} from "@/lib/sim/biome-interior";
import { isPassable } from "@/lib/sim/biome";
import {
  consumeUse,
  pickWeaponForRange,
  weaponAttackBonus,
  weaponReach,
  type WeaponInstance,
} from "@/lib/sim/weapons";
import { WEAPONS } from "@/content/weapons";
import { bfs } from "@/lib/sim/path";
import { goalTarget } from "@/lib/sim/goal";
import type { ResourceKind } from "@/content/resources";

export const COMBAT_COOLDOWN_TICKS = 4;
export const TILE_STEP_COOLDOWN_MIN = 1;
export const TILE_STEP_COOLDOWN_MAX = 4;
export const REGION_PAIRS_PER_TICK = 4;
export const MAX_REGION_HITS_PER_TICK = 6;
// How long a hit lingers as "engaged" on an NPC's mind. After this many
// ticks of no follow-up, they drop pursuit.
export const ENGAGED_TTL_TICKS = 200;

export type CombatHit = {
  defenderKind: "player" | "npc";
  defenderId?: string;
  attackerName: string;
  damage: number;
  lx?: number;
  ly?: number;
};

export type CombatDeath = {
  npcId: string;
  factionId: string;
  name: string;
  killerKind: "player" | "npc";
  killerId?: string;
  killerName?: string;
};

export type CombatResult = {
  npcs: Npc[];
  player: Player | null;
  interiors: Record<string, BiomeInterior>;
  factions: FactionState[];
  factionRelations: Record<string, number>;
  playerReputation: Record<string, number>;
  hits: CombatHit[];
  deaths: CombatDeath[];
  playerKilledBy?: { npcId: string; name: string; factionId: string };
};

export type CombatInput = {
  npcs: Npc[];
  player: Player | null;
  interiors: Record<string, BiomeInterior>;
  factions: FactionState[];
  factionRelations: Record<string, number>;
  playerReputation: Record<string, number>;
  mapW: number;
  mapH: number;
  ticks: number;
};

export function tickCombat(input: CombatInput, rng: Rng): CombatResult {
  const result: CombatResult = {
    npcs: input.npcs,
    player: input.player,
    interiors: input.interiors,
    factions: input.factions,
    factionRelations: input.factionRelations,
    playerReputation: input.playerReputation,
    hits: [],
    deaths: [],
  };

  // Always run interior combat first (when player exists), then region-level
  // abstract combat. This keeps the player's neighbourhood crisp and lets
  // off-screen kills affect faction power before encounter detection.
  if (result.player) {
    runInteriorCombat(result, rng, input.mapW, input.mapH, input.ticks);
  }
  runRegionCombat(result, rng, input.mapW, input.mapH, input.ticks);
  return result;
}

function runInteriorCombat(
  res: CombatResult,
  rng: Rng,
  mapW: number,
  mapH: number,
  ticks: number,
): void {
  const player = res.player;
  if (!player) return;
  const here = globalToLocal(player.gx, player.gy);
  const interior = res.interiors[regionKey(here.rx, here.ry)];
  if (!interior) return;

  const npcs = res.npcs.slice();

  // Clear stale interior state on any NPC outside the player's region. They
  // keep their region-level rx/ry but the tile slot belongs to a region we
  // are no longer rendering, so it's nonsense state.
  for (let i = 0; i < npcs.length; i++) {
    const n = npcs[i]!;
    if (n.interior && (n.rx !== here.rx || n.ry !== here.ry)) {
      npcs[i] = { ...n, interior: null, combatIntent: null };
    }
  }

  // Index NPCs in player's region for occupancy + collision.
  const inHere: number[] = [];
  for (let i = 0; i < npcs.length; i++) {
    const n = npcs[i]!;
    if (n.rx === here.rx && n.ry === here.ry) inHere.push(i);
  }

  // Materialize interior slots for fresh entrants.
  for (const idx of inHere) {
    const n = npcs[idx]!;
    if (n.interior) continue;
    const occupied = (lx: number, ly: number) => {
      if (lx === here.lx && ly === here.ly) return true;
      for (const j of inHere) {
        const m = npcs[j]!;
        if (m.id === n.id) continue;
        if (m.interior && m.interior.lx === lx && m.interior.ly === ly) return true;
      }
      return false;
    };
    const seed = rng.int(0, INTERIOR_W * INTERIOR_H);
    const cx = seed % INTERIOR_W;
    const cy = (seed - cx) / INTERIOR_W;
    const slot = findPassableTile(interior, cx, cy, occupied);
    if (!slot) continue;
    npcs[idx] = {
      ...n,
      interior: {
        lx: slot.lx,
        ly: slot.ly,
        tileIntent: null,
        stepCooldown: rng.int(TILE_STEP_COOLDOWN_MIN, TILE_STEP_COOLDOWN_MAX + 1),
        lastHitTick: -999,
        wanderUntil: ticks + rng.int(40, 100),
      },
    };
  }

  // Process attacks before movement so cooldowns gate movement coherently.
  // Player attack pending action: handled in player-tick. Here we resolve
  // NPC-vs-player and NPC-vs-NPC.
  for (const idx of inHere) {
    const n = npcs[idx]!;
    const interior = n.interior;
    if (!interior) continue;
    if (n.combatCooldown > 0) {
      npcs[idx] = { ...n, combatCooldown: n.combatCooldown - 1 };
      continue;
    }

    // Look for hostile target: player (if hostile to player) or another NPC.
    const playerHostile = (res.playerReputation[n.factionId] ?? 0) < 0;
    const playerDist = chebyshev(interior.lx, interior.ly, here.lx, here.ly);
    if (playerHostile && playerDist <= n.combatReach && res.player) {
      const hit = attackPlayer(res, n, rng);
      npcs[idx] = hit.npc;
      continue;
    }

    // Hostile NPC pair?
    let bestEnemy: { idx: number; dist: number } | null = null;
    for (const j of inHere) {
      if (j === idx) continue;
      const m = npcs[j]!;
      if (!m.interior) continue;
      if (m.combatHealth <= 0) continue;
      if (
        !isFactionHostile(
          res.factionRelations,
          n.values,
          m.values,
          n.factionId,
          m.factionId,
        )
      ) {
        continue;
      }
      const d = chebyshev(interior.lx, interior.ly, m.interior.lx, m.interior.ly);
      if (d > n.combatReach) continue;
      if (!bestEnemy || d < bestEnemy.dist) bestEnemy = { idx: j, dist: d };
    }
    if (bestEnemy) {
      const target = npcs[bestEnemy.idx]!;
      const r = attackNpcByNpc(res, n, target, rng);
      npcs[idx] = r.attacker;
      npcs[bestEnemy.idx] = r.defender;
      continue;
    }
  }

  // Movement: each NPC steps toward a tile-level target. The target depends
  // on goal kind and proximity to the player or hostiles.
  for (const idx of inHere) {
    const n = npcs[idx]!;
    if (!n.interior) continue;
    if (n.combatHealth <= 0) continue;
    if (n.interior.stepCooldown > 0) {
      npcs[idx] = {
        ...n,
        interior: { ...n.interior, stepCooldown: n.interior.stepCooldown - 1 },
      };
      continue;
    }
    const stepped = stepTowardTarget(n, npcs, inHere, idx, here, interior, mapW, mapH, res, rng, ticks);
    if (stepped.transitioned) {
      // NPC left the player's region; clear interior, advance rx/ry.
      npcs[idx] = {
        ...n,
        rx: stepped.transitioned.rx,
        ry: stepped.transitioned.ry,
        intent: null,
        interior: null,
        moveCooldown: rng.int(8, 16),
      };
    } else if (stepped.next) {
      npcs[idx] = {
        ...n,
        interior: {
          ...n.interior,
          lx: stepped.next.lx,
          ly: stepped.next.ly,
          tileIntent: stepped.tileIntent,
          stepCooldown: rng.int(TILE_STEP_COOLDOWN_MIN, TILE_STEP_COOLDOWN_MAX + 1),
        },
      };
    } else {
      npcs[idx] = {
        ...n,
        interior: {
          ...n.interior,
          tileIntent: stepped.tileIntent,
          stepCooldown: rng.int(TILE_STEP_COOLDOWN_MIN, TILE_STEP_COOLDOWN_MAX + 1),
        },
      };
    }
  }

  res.npcs = npcs;
}

type StepResult = {
  next: { lx: number; ly: number } | null;
  tileIntent: { lx: number; ly: number } | null;
  transitioned: { rx: number; ry: number } | null;
};

function stepTowardTarget(
  npc: Npc,
  npcs: Npc[],
  inHere: number[],
  selfIdx: number,
  here: { rx: number; ry: number; lx: number; ly: number },
  interior: BiomeInterior,
  mapW: number,
  mapH: number,
  res: CombatResult,
  rng: Rng,
  ticks: number,
): StepResult {
  const interiorPos = npc.interior!;

  // Build occupancy grid for BFS + random-walk obstacle checks.
  const occupied: boolean[] = interior.obstacles.slice();
  occupied[here.ly * INTERIOR_W + here.lx] = true;
  for (const j of inHere) {
    if (j === selfIdx) continue;
    const m = npcs[j]!;
    if (!m.interior) continue;
    occupied[m.interior.ly * INTERIOR_W + m.interior.lx] = true;
  }

  const dynamicTarget = pickDynamicTileTarget(npc, npcs, inHere, selfIdx, here, res, ticks, rng);

  // Decide effective target: dynamic (player/enemy/edge) overrides any cached
  // wander; otherwise reuse cached tileIntent until we arrive, then reroll.
  let target: { lx: number; ly: number } | null = dynamicTarget;
  if (!target) {
    const cached = interiorPos.tileIntent;
    if (
      cached &&
      !(cached.lx === interiorPos.lx && cached.ly === interiorPos.ly) &&
      !occupied[cached.ly * INTERIOR_W + cached.lx]
    ) {
      target = cached;
    } else {
      target = pickWanderTarget(interiorPos.lx, interiorPos.ly, occupied, rng);
    }
  }

  if (!target) {
    return { next: null, tileIntent: null, transitioned: null };
  }

  // Edge-tile arrival: transition out of the region.
  if (
    target.lx === interiorPos.lx &&
    target.ly === interiorPos.ly &&
    isEdgeTile(target.lx, target.ly) &&
    wantsToLeaveRegion(npc, here, npcs, ticks)
  ) {
    const transit = neighborRegionForEdge(here.rx, here.ry, target.lx, target.ly, mapW, mapH);
    if (transit) return { next: null, tileIntent: null, transitioned: transit };
  }

  if (target.lx === interiorPos.lx && target.ly === interiorPos.ly) {
    // Already there but didn't transition — clear cache so next tick rerolls.
    return { next: null, tileIntent: null, transitioned: null };
  }

  const path = bfs(occupied, INTERIOR_W, INTERIOR_H, interiorPos.lx, interiorPos.ly, target.lx, target.ly);
  if (!path || path.length === 0) {
    // Direct path blocked: take any free neighbour to keep moving and drop
    // the cached intent so next tick rerolls.
    const free = freeNeighbor(interiorPos.lx, interiorPos.ly, occupied, rng);
    if (free) return { next: free, tileIntent: null, transitioned: null };
    return { next: null, tileIntent: null, transitioned: null };
  }
  const step = path[0]!;
  // If the chosen step is the goal tile and it's an edge tile we wanted to
  // leave through, transit immediately.
  if (
    step.px === target.lx &&
    step.py === target.ly &&
    isEdgeTile(step.px, step.py) &&
    wantsToLeaveRegion(npc, here, npcs, ticks)
  ) {
    const transit = neighborRegionForEdge(here.rx, here.ry, step.px, step.py, mapW, mapH);
    if (transit) return { next: null, tileIntent: null, transitioned: transit };
  }
  return {
    next: { lx: step.px, ly: step.py },
    tileIntent: { lx: target.lx, ly: target.ly },
    transitioned: null,
  };
}

function freeNeighbor(
  lx: number,
  ly: number,
  occupied: boolean[],
  rng: Rng,
): { lx: number; ly: number } | null {
  const choices: Array<[number, number]> = [];
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    const nx = lx + dx;
    const ny = ly + dy;
    if (nx < 0 || ny < 0 || nx >= INTERIOR_W || ny >= INTERIOR_H) continue;
    if (occupied[ny * INTERIOR_W + nx]) continue;
    choices.push([nx, ny]);
  }
  if (choices.length === 0) return null;
  const pick = choices[rng.int(0, choices.length)]!;
  return { lx: pick[0], ly: pick[1] };
}

function pickWanderTarget(
  lx: number,
  ly: number,
  occupied: boolean[],
  rng: Rng,
): { lx: number; ly: number } | null {
  for (let attempt = 0; attempt < 12; attempt++) {
    const dx = rng.int(-6, 7);
    const dy = rng.int(-6, 7);
    const nx = lx + dx;
    const ny = ly + dy;
    if (nx < 0 || ny < 0 || nx >= INTERIOR_W || ny >= INTERIOR_H) continue;
    if (occupied[ny * INTERIOR_W + nx]) continue;
    if (nx === lx && ny === ly) continue;
    return { lx: nx, ly: ny };
  }
  return freeNeighbor(lx, ly, occupied, rng);
}

// Returns a target the NPC *must* reach this tick (player tile when hostile,
// nearest enemy NPC tile, region-edge when leaving). Otherwise returns null
// and we fall through to a cached wander tile.
function pickDynamicTileTarget(
  npc: Npc,
  npcs: Npc[],
  inHere: number[],
  selfIdx: number,
  here: { rx: number; ry: number; lx: number; ly: number },
  res: CombatResult,
  ticks: number,
  rng: Rng,
): { lx: number; ly: number } | null {
  const repHostile = (res.playerReputation[npc.factionId] ?? 0) < 0;
  const engaged = npc.engagedTick !== null && ticks - npc.engagedTick < ENGAGED_TTL_TICKS;
  if ((repHostile || engaged) && res.player) {
    return { lx: here.lx, ly: here.ly };
  }

  for (const j of inHere) {
    if (j === selfIdx) continue;
    const m = npcs[j]!;
    if (!m.interior || m.combatHealth <= 0) continue;
    if (
      isFactionHostile(
        res.factionRelations,
        npc.values,
        m.values,
        npc.factionId,
        m.factionId,
      )
    ) {
      return { lx: m.interior.lx, ly: m.interior.ly };
    }
  }

  // Trade peer in this interior: walk to them so the goal can register as
  // done at tile level. Without this they'd both wander past each other.
  if (npc.goal.kind === "trade") {
    const peerId = npc.goal.peerNpcId;
    for (const j of inHere) {
      if (j === selfIdx) continue;
      const m = npcs[j]!;
      if (m.id !== peerId) continue;
      if (!m.interior) continue;
      return { lx: m.interior.lx, ly: m.interior.ly };
    }
  }

  const regionTarget = goalTarget(npc.goal, npc, npcs);
  if (regionTarget && (regionTarget.rx !== here.rx || regionTarget.ry !== here.ry)) {
    const dx = regionTarget.rx - here.rx;
    const dy = regionTarget.ry - here.ry;
    if (Math.abs(dx) >= Math.abs(dy) && dx !== 0) {
      return { lx: dx > 0 ? INTERIOR_W - 1 : 0, ly: clamp(npc.interior!.ly, 0, INTERIOR_H - 1) };
    }
    if (dy !== 0) {
      return { lx: clamp(npc.interior!.lx, 0, INTERIOR_W - 1), ly: dy > 0 ? INTERIOR_H - 1 : 0 };
    }
  }

  // Wandering NPCs that have been milling around long enough should head to
  // an edge tile so they migrate out of the player's region naturally instead
  // of looping inside forever.
  if (npc.interior && ticks >= npc.interior.wanderUntil) {
    return pickRandomEdgeTile(npc.interior.lx, npc.interior.ly, rng);
  }
  return null;
}

function pickRandomEdgeTile(
  lx: number,
  ly: number,
  rng: Rng,
): { lx: number; ly: number } {
  const side = rng.int(0, 4);
  switch (side) {
    case 0:
      return { lx: clamp(lx + rng.int(-3, 4), 0, INTERIOR_W - 1), ly: 0 };
    case 1:
      return { lx: INTERIOR_W - 1, ly: clamp(ly + rng.int(-3, 4), 0, INTERIOR_H - 1) };
    case 2:
      return { lx: clamp(lx + rng.int(-3, 4), 0, INTERIOR_W - 1), ly: INTERIOR_H - 1 };
    default:
      return { lx: 0, ly: clamp(ly + rng.int(-3, 4), 0, INTERIOR_H - 1) };
  }
}

function wantsToLeaveRegion(
  npc: Npc,
  here: { rx: number; ry: number },
  npcs: Npc[],
  ticks: number,
): boolean {
  // Wandering NPCs whose dwell timer has lapsed should drift out so they
  // don't loop inside the player's interior forever.
  if (npc.interior && ticks >= npc.interior.wanderUntil) return true;
  const t = goalTarget(npc.goal, npc, npcs);
  if (!t) return false;
  return t.rx !== here.rx || t.ry !== here.ry;
}

function isEdgeTile(lx: number, ly: number): boolean {
  return lx === 0 || ly === 0 || lx === INTERIOR_W - 1 || ly === INTERIOR_H - 1;
}

function neighborRegionForEdge(
  rx: number,
  ry: number,
  lx: number,
  ly: number,
  mapW: number,
  mapH: number,
): { rx: number; ry: number } | null {
  let nrx = rx;
  let nry = ry;
  if (lx === 0) nrx -= 1;
  else if (lx === INTERIOR_W - 1) nrx += 1;
  else if (ly === 0) nry -= 1;
  else if (ly === INTERIOR_H - 1) nry += 1;
  else return null;
  if (!isPassable(nrx, nry, mapW, mapH)) return null;
  return { rx: nrx, ry: nry };
}

function clamp(v: number, lo: number, hi: number): number {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

function attackPlayer(
  res: CombatResult,
  attacker: Npc,
  rng: Rng,
): { npc: Npc } {
  if (!res.player) return { npc: attacker };
  const bonus = weaponAttackBonus(attacker.weapon);
  const damage = Math.max(1, attacker.combatAttack + bonus - res.player.stats.defense);
  const newHealth = Math.max(0, res.player.health - damage);
  const newPlayer: Player = { ...res.player, health: newHealth };
  res.player = newPlayer;
  res.hits.push({
    defenderKind: "player",
    attackerName: attacker.name,
    damage,
  });
  if (newHealth === 0) {
    res.playerKilledBy = {
      npcId: attacker.id,
      name: attacker.name,
      factionId: attacker.factionId,
    };
  }
  let nextWeapon: WeaponInstance | null = attacker.weapon;
  if (attacker.weapon) {
    const remaining = attacker.weapon.usesLeft - 1;
    nextWeapon = remaining > 0 ? { kind: attacker.weapon.kind, usesLeft: remaining } : null;
  }
  return {
    npc: {
      ...attacker,
      weapon: nextWeapon,
      combatCooldown: COMBAT_COOLDOWN_TICKS,
      combatIntent: "attack",
    },
  };
}

function attackNpcByNpc(
  res: CombatResult,
  attacker: Npc,
  defender: Npc,
  rng: Rng,
): { attacker: Npc; defender: Npc } {
  const bonus = weaponAttackBonus(attacker.weapon);
  const damage = Math.max(1, attacker.combatAttack + bonus - defender.combatDefense);
  const newHealth = Math.max(0, defender.combatHealth - damage);
  res.hits.push({
    defenderKind: "npc",
    defenderId: defender.id,
    attackerName: attacker.name,
    damage,
    lx: defender.interior?.lx,
    ly: defender.interior?.ly,
  });
  let nextWeapon: WeaponInstance | null = attacker.weapon;
  if (attacker.weapon) {
    const remaining = attacker.weapon.usesLeft - 1;
    nextWeapon = remaining > 0 ? { kind: attacker.weapon.kind, usesLeft: remaining } : null;
  }
  const updatedAttacker: Npc = {
    ...attacker,
    weapon: nextWeapon,
    combatCooldown: COMBAT_COOLDOWN_TICKS,
    combatIntent: "attack",
  };
  const updatedDefender: Npc = {
    ...defender,
    combatHealth: newHealth,
    interior: defender.interior
      ? { ...defender.interior, lastHitTick: defender.interior.lastHitTick }
      : defender.interior,
  };
  if (newHealth === 0) {
    res.deaths.push({
      npcId: defender.id,
      factionId: defender.factionId,
      name: defender.name,
      killerKind: "npc",
      killerId: attacker.id,
      killerName: attacker.name,
    });
    if (defender.interior) {
      const interior = res.interiors[regionKey(defender.rx, defender.ry)];
      if (interior) {
        const pile = lootPileFor(defender, defender.interior, res, rng);
        res.interiors = {
          ...res.interiors,
          [regionKey(defender.rx, defender.ry)]: addLoot(interior, pile),
        };
      }
    }
    res.factions = nudgePower(res.factions, attacker.factionId, 1);
    res.factions = nudgePower(res.factions, defender.factionId, -1);
    res.factionRelations = nudgeRelation(
      res.factionRelations,
      attacker.factionId,
      defender.factionId,
      -2,
    );
  }
  return { attacker: updatedAttacker, defender: updatedDefender };
}

function lootPileFor(
  npc: Npc,
  interior: NpcInterior,
  res: CombatResult,
  rng: Rng,
): LootPile {
  const items: Partial<Record<ResourceKind, number>> = {};
  // Faction-flavoured single-resource drop (deterministic rng draw).
  const choices: ResourceKind[] = ["wood", "stone", "reed"];
  const pick = choices[rng.int(0, choices.length)]!;
  items[pick] = 1;
  return {
    id: `loot-${npc.id}-${res.npcs.length}`,
    lx: interior.lx,
    ly: interior.ly,
    items,
  };
}

function runRegionCombat(
  res: CombatResult,
  rng: Rng,
  _mapW: number,
  _mapH: number,
  _ticks: number,
): void {
  // Group NPCs by region (excluding the player's region — handled by interior
  // combat). For each region with multiple NPCs, sample a few hostile pairs
  // and exchange damage.
  const player = res.player;
  const playerRegion = player ? globalToLocal(player.gx, player.gy) : null;
  const groups = new Map<string, number[]>();
  for (let i = 0; i < res.npcs.length; i++) {
    const n = res.npcs[i]!;
    if (n.combatHealth <= 0) continue;
    if (
      playerRegion &&
      n.rx === playerRegion.rx &&
      n.ry === playerRegion.ry
    ) {
      continue;
    }
    const key = regionKey(n.rx, n.ry);
    const arr = groups.get(key) ?? [];
    arr.push(i);
    groups.set(key, arr);
  }

  let hits = 0;
  const npcs = res.npcs.slice();
  for (const [, idxs] of groups) {
    if (idxs.length < 2) continue;
    let pairsTried = 0;
    for (let a = 0; a < idxs.length && pairsTried < REGION_PAIRS_PER_TICK; a++) {
      for (let b = a + 1; b < idxs.length && pairsTried < REGION_PAIRS_PER_TICK; b++) {
        const ai = idxs[a]!;
        const bi = idxs[b]!;
        const A = npcs[ai]!;
        const B = npcs[bi]!;
        if (A.combatHealth <= 0 || B.combatHealth <= 0) continue;
        if (
          !isFactionHostile(
            res.factionRelations,
            A.values,
            B.values,
            A.factionId,
            B.factionId,
          )
        ) {
          continue;
        }
        pairsTried++;
        if (hits >= MAX_REGION_HITS_PER_TICK) break;

        const aCool = Math.max(0, A.combatCooldown - 1);
        const bCool = Math.max(0, B.combatCooldown - 1);

        let updatedA: Npc = { ...A, combatCooldown: aCool };
        let updatedB: Npc = { ...B, combatCooldown: bCool };

        if (aCool === 0) {
          const dmg = Math.max(1, A.combatAttack + weaponAttackBonus(A.weapon) - B.combatDefense);
          updatedB = { ...updatedB, combatHealth: Math.max(0, updatedB.combatHealth - dmg) };
          updatedA = { ...updatedA, combatCooldown: COMBAT_COOLDOWN_TICKS };
          hits++;
          if (updatedB.combatHealth === 0) {
            res.deaths.push({
              npcId: updatedB.id,
              factionId: updatedB.factionId,
              name: updatedB.name,
              killerKind: "npc",
              killerId: updatedA.id,
              killerName: updatedA.name,
            });
            res.factions = nudgePower(res.factions, updatedA.factionId, 1);
            res.factions = nudgePower(res.factions, updatedB.factionId, -1);
            res.factionRelations = nudgeRelation(
              res.factionRelations,
              updatedA.factionId,
              updatedB.factionId,
              -2,
            );
          }
        }
        if (bCool === 0 && updatedB.combatHealth > 0) {
          const dmg = Math.max(1, updatedB.combatAttack + weaponAttackBonus(updatedB.weapon) - updatedA.combatDefense);
          updatedA = { ...updatedA, combatHealth: Math.max(0, updatedA.combatHealth - dmg) };
          updatedB = { ...updatedB, combatCooldown: COMBAT_COOLDOWN_TICKS };
          hits++;
          if (updatedA.combatHealth === 0) {
            res.deaths.push({
              npcId: updatedA.id,
              factionId: updatedA.factionId,
              name: updatedA.name,
              killerKind: "npc",
              killerId: updatedB.id,
              killerName: updatedB.name,
            });
            res.factions = nudgePower(res.factions, updatedB.factionId, 1);
            res.factions = nudgePower(res.factions, updatedA.factionId, -1);
            res.factionRelations = nudgeRelation(
              res.factionRelations,
              updatedB.factionId,
              updatedA.factionId,
              -2,
            );
          }
        }

        npcs[ai] = updatedA;
        npcs[bi] = updatedB;
      }
    }
  }
  res.npcs = npcs;
}

export function pruneDeadNpcs(npcs: Npc[]): Npc[] {
  return npcs.filter((n) => n.combatHealth > 0);
}

// Player-initiated attack: called from player-tick when pendingAction kicks in.
export type PlayerAttackResult = {
  player: Player;
  npc: Npc;
  hits: CombatHit[];
  deaths: CombatDeath[];
  loot: LootPile | null;
  repPenaltyFactionId: string;
  repPenaltyAmount: number;
  attacked: boolean;
  projectile: {
    fromGx: number;
    fromGy: number;
    toGx: number;
    toGy: number;
  } | null;
};

export function resolvePlayerAttack(
  player: Player,
  npc: Npc,
  rng: Rng,
  ticks: number,
): PlayerAttackResult {
  if (!npc.interior || player.combatCooldown > 0) {
    return {
      player,
      npc,
      hits: [],
      deaths: [],
      loot: null,
      repPenaltyFactionId: npc.factionId,
      repPenaltyAmount: 0,
      attacked: false,
      projectile: null,
    };
  }
  const here = globalToLocal(player.gx, player.gy);
  const dist = chebyshev(here.lx, here.ly, npc.interior.lx, npc.interior.ly);
  const weapon = pickWeaponForRange(player.weapons, dist);
  const reach = weapon ? weaponReach(weapon) : player.stats.reach;
  if (dist > reach) {
    return {
      player,
      npc,
      hits: [],
      deaths: [],
      loot: null,
      repPenaltyFactionId: npc.factionId,
      repPenaltyAmount: 0,
      attacked: false,
      projectile: null,
    };
  }
  const damage = Math.max(
    1,
    player.stats.attack + weaponAttackBonus(weapon) - npc.combatDefense,
  );
  const nextNpcHealth = Math.max(0, npc.combatHealth - damage);
  const nextWeapons = weapon ? consumeUse(player.weapons, weapon.kind) : player.weapons;
  const nextPlayer: Player = {
    ...player,
    weapons: nextWeapons,
    combatCooldown: COMBAT_COOLDOWN_TICKS,
    pendingAction: null,
  };
  const updatedNpc: Npc = {
    ...npc,
    combatHealth: nextNpcHealth,
    engagedTick: ticks,
  };
  const hits: CombatHit[] = [
    {
      defenderKind: "npc",
      defenderId: npc.id,
      attackerName: "You",
      damage,
      lx: npc.interior.lx,
      ly: npc.interior.ly,
    },
  ];
  const deaths: CombatDeath[] = [];
  let loot: LootPile | null = null;
  let repPenaltyAmount = 5;
  if (nextNpcHealth === 0) {
    deaths.push({
      npcId: npc.id,
      factionId: npc.factionId,
      name: npc.name,
      killerKind: "player",
    });
    repPenaltyAmount = 15;
    const items: Partial<Record<ResourceKind, number>> = {};
    const choices: ResourceKind[] = ["wood", "stone", "reed"];
    const pick = choices[rng.int(0, choices.length)]!;
    items[pick] = 1;
    loot = {
      id: `loot-${npc.id}-p`,
      lx: npc.interior.lx,
      ly: npc.interior.ly,
      items,
    };
  }
  const ranged = weapon ? WEAPONS[weapon.kind].ranged : false;
  const projectile = ranged
    ? {
        fromGx: player.gx,
        fromGy: player.gy,
        toGx: npc.rx * INTERIOR_W + npc.interior.lx,
        toGy: npc.ry * INTERIOR_H + npc.interior.ly,
      }
    : null;
  return {
    player: nextPlayer,
    npc: updatedNpc,
    hits,
    deaths,
    loot,
    repPenaltyFactionId: npc.factionId,
    repPenaltyAmount,
    attacked: true,
    projectile,
  };
}

export function applyRepPenalty(
  playerReputation: Record<string, number>,
  factionId: string,
  amount: number,
): Record<string, number> {
  if (amount <= 0) return playerReputation;
  return losePlayerRep(playerReputation, factionId, amount);
}

export function chebyshev(ax: number, ay: number, bx: number, by: number): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}
