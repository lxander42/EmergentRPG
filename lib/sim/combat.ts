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
import { bfs } from "@/lib/sim/path";
import { goalTarget } from "@/lib/sim/goal";
import type { ResourceKind } from "@/content/resources";

export const COMBAT_COOLDOWN_TICKS = 4;
export const TILE_STEP_COOLDOWN_MIN = 1;
export const TILE_STEP_COOLDOWN_MAX = 4;
export const REGION_PAIRS_PER_TICK = 4;
export const MAX_REGION_HITS_PER_TICK = 6;

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
    runInteriorCombat(result, rng, input.mapW, input.mapH);
  }
  runRegionCombat(result, rng, input.mapW, input.mapH);
  return result;
}

function runInteriorCombat(
  res: CombatResult,
  rng: Rng,
  mapW: number,
  mapH: number,
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
    const stepped = stepTowardTarget(n, npcs, inHere, idx, here, interior, mapW, mapH, res, rng);
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
          tileIntent: null,
          stepCooldown: rng.int(TILE_STEP_COOLDOWN_MIN, TILE_STEP_COOLDOWN_MAX + 1),
        },
      };
    } else {
      npcs[idx] = {
        ...n,
        interior: {
          ...n.interior,
          stepCooldown: rng.int(TILE_STEP_COOLDOWN_MIN, TILE_STEP_COOLDOWN_MAX + 1),
        },
      };
    }
  }

  res.npcs = npcs;
}

type StepResult = {
  next: { lx: number; ly: number } | null;
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
): StepResult {
  const interiorPos = npc.interior!;
  // Pick the tile-level target based on goal + hostility.
  let target = pickTileTarget(npc, npcs, inHere, selfIdx, here, mapW, mapH, res);
  if (!target) {
    // Random wander to avoid frozen NPCs.
    target = randomNearby(interiorPos.lx, interiorPos.ly, rng);
  }

  // If we're already at the target tile and the goal wants this region, idle.
  if (target.lx === interiorPos.lx && target.ly === interiorPos.ly) {
    return { next: null, transitioned: null };
  }

  // BFS over interior obstacles, treating other NPCs as blocked.
  const occupied: boolean[] = interior.obstacles.slice();
  // Mark player tile as blocked so NPCs don't try to occupy it.
  occupied[here.ly * INTERIOR_W + here.lx] = true;
  for (const j of inHere) {
    if (j === selfIdx) continue;
    const m = npcs[j]!;
    if (!m.interior) continue;
    occupied[m.interior.ly * INTERIOR_W + m.interior.lx] = true;
  }

  // Edge transition: if target is at an interior edge and the NPC stands on
  // the same edge tile, advance to the neighbouring region.
  if (
    target.lx === interiorPos.lx &&
    target.ly === interiorPos.ly &&
    isEdgeTile(target.lx, target.ly)
  ) {
    const transit = neighborRegionForEdge(here.rx, here.ry, target.lx, target.ly, mapW, mapH);
    if (transit) return { next: null, transitioned: transit };
  }

  const path = bfs(occupied, INTERIOR_W, INTERIOR_H, interiorPos.lx, interiorPos.ly, target.lx, target.ly);
  if (!path || path.length === 0) {
    // Try a random nearby walk if direct path is blocked.
    const wander = randomNearby(interiorPos.lx, interiorPos.ly, rng);
    if (wander.lx === interiorPos.lx && wander.ly === interiorPos.ly) {
      return { next: null, transitioned: null };
    }
    if (
      wander.lx >= 0 &&
      wander.lx < INTERIOR_W &&
      wander.ly >= 0 &&
      wander.ly < INTERIOR_H &&
      !occupied[wander.ly * INTERIOR_W + wander.lx]
    ) {
      return { next: { lx: wander.lx, ly: wander.ly }, transitioned: null };
    }
    return { next: null, transitioned: null };
  }
  const step = path[0]!;
  // If we arrived at an edge tile and the goal wants to leave, transition.
  if (
    step.px === target.lx &&
    step.py === target.ly &&
    isEdgeTile(step.px, step.py) &&
    wantsToLeaveRegion(npc, here)
  ) {
    const transit = neighborRegionForEdge(here.rx, here.ry, step.px, step.py, mapW, mapH);
    if (transit) return { next: null, transitioned: transit };
  }
  return { next: { lx: step.px, ly: step.py }, transitioned: null };
}

function pickTileTarget(
  npc: Npc,
  npcs: Npc[],
  inHere: number[],
  selfIdx: number,
  here: { rx: number; ry: number; lx: number; ly: number },
  mapW: number,
  mapH: number,
  res: CombatResult,
): { lx: number; ly: number } | null {
  const playerHostile = (res.playerReputation[npc.factionId] ?? 0) < 0;
  if (playerHostile && res.player) {
    return { lx: here.lx, ly: here.ly };
  }

  // Hostile NPC of another faction in this interior?
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

  // Goal-directed: if region-level goal points elsewhere, head to the matching
  // edge tile so the NPC can transition out next tick.
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

  // Default wander: pick the interior centre as a soft anchor to avoid
  // clustering at the spawn edge.
  const cx = Math.floor(INTERIOR_W / 2);
  const cy = Math.floor(INTERIOR_H / 2);
  return { lx: cx, ly: cy };
}

function wantsToLeaveRegion(
  npc: Npc,
  here: { rx: number; ry: number },
): boolean {
  const t = goalTarget(npc.goal, npc, []);
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

function randomNearby(lx: number, ly: number, rng: Rng): { lx: number; ly: number } {
  const choices: Array<[number, number]> = [
    [lx + 1, ly],
    [lx - 1, ly],
    [lx, ly + 1],
    [lx, ly - 1],
  ];
  const pick = choices[rng.int(0, choices.length)]!;
  return { lx: pick[0], ly: pick[1] };
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
  mapW: number,
  mapH: number,
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
export function resolvePlayerAttack(
  player: Player,
  npc: Npc,
  rng: Rng,
): {
  player: Player;
  npc: Npc;
  hits: CombatHit[];
  deaths: CombatDeath[];
  loot: LootPile | null;
  repPenaltyFactionId: string;
  repPenaltyAmount: number;
  attacked: boolean;
} {
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
  const updatedNpc: Npc = { ...npc, combatHealth: nextNpcHealth };
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
  return {
    player: nextPlayer,
    npc: updatedNpc,
    hits,
    deaths,
    loot,
    repPenaltyFactionId: npc.factionId,
    repPenaltyAmount,
    attacked: true,
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
