import type { Rng } from "@/lib/sim/rng";
import { isPassable } from "@/lib/sim/biome";
import { FACTIONS } from "@/content/factions";
import { NAMES, TRAITS } from "@/content/traits";
import {
  advanceGoalState,
  goalTarget,
  isGoalDone,
  pickGoal,
  GOAL_TTL_TICKS,
  type Goal,
} from "@/lib/sim/goal";
import type { WeaponInstance } from "@/lib/sim/weapons";
import { ENGAGED_TTL_TICKS } from "@/lib/sim/combat";

export type Intent = { rx: number; ry: number };

export type NpcInterior = {
  lx: number;
  ly: number;
  tileIntent: { lx: number; ly: number } | null;
  stepCooldown: number;
  lastHitTick: number;
  wanderUntil: number;
};

export type CombatIntent = "approach" | "attack" | "flee" | null;

export type Npc = {
  id: string;
  name: string;
  factionId: string;
  factionColor: number;
  traits: string[];
  values: string[];
  rx: number;
  ry: number;
  homeRegion: { rx: number; ry: number };
  intent: Intent | null;
  moveCooldown: number;
  goal: Goal;
  goalTtl: number;
  stuckCounter: number;
  lastDistance: number;
  combatHealth: number;
  combatHealthMax: number;
  combatAttack: number;
  combatDefense: number;
  combatReach: number;
  combatCooldown: number;
  combatIntent: CombatIntent;
  weapon: WeaponInstance | null;
  interior: NpcInterior | null;
  // Tick at which the player last attacked this NPC. While set and recent,
  // the NPC pursues the player as if hostile regardless of faction rep.
  engagedTick: number | null;
};

const IDLE_MIN = 12;
const IDLE_MAX = 30;
const TELEGRAPH_TICKS = 8;
const MOVE_CHANCE = 0.5;
const STUCK_THRESHOLD = 4;

export function spawnNpc(rng: Rng, id: number, mapW: number, mapH: number): Npc {
  const faction = rng.pick(FACTIONS);
  const traitCount = rng.int(2, 4);
  const traits: string[] = [];
  while (traits.length < traitCount) {
    const t = rng.pick(TRAITS);
    if (!traits.includes(t)) traits.push(t);
  }

  let rx = Math.floor(mapW / 2);
  let ry = Math.floor(mapH / 2);
  for (let attempt = 0; attempt < 32; attempt++) {
    const candX = rng.int(0, mapW);
    const candY = rng.int(0, mapH);
    if (isPassable(candX, candY, mapW, mapH)) {
      rx = candX;
      ry = candY;
      break;
    }
  }

  const values = [...faction.values];
  let combatAttack = 1;
  if (values.includes("violence")) combatAttack += 1;
  if (traits.includes("brutish")) combatAttack += 1;
  let combatDefense = 0;
  if (traits.includes("cowardly")) combatDefense += 1;
  if (traits.includes("patient")) combatDefense += 1;
  const combatHealthMax = clampInt(4 + Math.round(50 / 25) + (traits.includes("brave") ? 1 : 0), 4, 8);

  return {
    id: `npc-${id}`,
    name: rng.pick(NAMES),
    factionId: faction.id,
    factionColor: faction.color,
    traits,
    values,
    rx,
    ry,
    homeRegion: { rx, ry },
    intent: null,
    moveCooldown: rng.int(IDLE_MIN, IDLE_MAX),
    goal: { kind: "wander" },
    goalTtl: rng.int(1, 60),
    stuckCounter: 0,
    lastDistance: -1,
    combatHealth: combatHealthMax,
    combatHealthMax,
    combatAttack,
    combatDefense,
    combatReach: 1,
    combatCooldown: 0,
    combatIntent: null,
    weapon: null,
    interior: null,
    engagedTick: null,
  };
}

function clampInt(v: number, lo: number, hi: number): number {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

export type TickNpcCtx = {
  rng: Rng;
  mapW: number;
  mapH: number;
  regionControl: Record<string, string>;
  npcs: Npc[];
  playerRegion: { rx: number; ry: number } | null;
  playerReputation: Record<string, number>;
  recentFactionAttacks: Record<string, number>;
  ticks: number;
};

export const NPC_PERCEPTION_REGIONS = 3;
export const FLEE_TTL_TICKS = 480;

export function tickNpc(npc: Npc, ctx: TickNpcCtx): Npc {
  const { rng, mapW, mapH } = ctx;

  // Combat tick owns movement for NPCs in the player's region.
  if (
    ctx.playerRegion &&
    npc.rx === ctx.playerRegion.rx &&
    npc.ry === ctx.playerRegion.ry
  ) {
    const cooldown = Math.max(0, (npc.moveCooldown ?? 0) - 1);
    const combatCooldown = Math.max(0, (npc.combatCooldown ?? 0) - 1);
    return { ...npc, moveCooldown: cooldown, combatCooldown };
  }

  let goal = npc.goal;
  // Decrement once at the top so the TTL counts wall-clock ticks rather
  // than decision cycles. With cooldowns of 12-30 ticks per cycle, the
  // old per-branch decrement made a 600-tick TTL last 15+ minutes.
  let goalTtl = Math.max(0, npc.goalTtl - 1);
  let homeRegion = npc.homeRegion;
  let stuckCounter = npc.stuckCounter;
  let lastDistance = npc.lastDistance;

  if (goalTtl <= 0 || isGoalDone(npc, goal, ctx.npcs)) {
    goal = pickGoal({ npc, rng, regionControl: ctx.regionControl, npcs: ctx.npcs, mapW, mapH });
    goalTtl = GOAL_TTL_TICKS;
    stuckCounter = 0;
    lastDistance = -1;
    if (goal.kind === "gather") {
      homeRegion = npc.homeRegion;
    }
  }

  const cooldown = npc.moveCooldown ?? 0;
  if (cooldown > 0) {
    return { ...npc, goal, goalTtl, homeRegion, stuckCounter, lastDistance, moveCooldown: cooldown - 1 };
  }

  if (npc.intent) {
    const moved: Npc = {
      ...npc,
      goal,
      goalTtl,
      homeRegion,
      stuckCounter,
      lastDistance,
      rx: npc.intent.rx,
      ry: npc.intent.ry,
      intent: null,
      moveCooldown: rng.int(IDLE_MIN, IDLE_MAX),
    };
    return { ...moved, goal: advanceGoalState(moved, moved.goal) };
  }

  // Region-level chase / flee override: when faction is hostile to the player
  // and the player's region is within perception, head toward them. When
  // friendly but the faction was attacked recently, drift away.
  let target = goalTarget(goal, npc, ctx.npcs);
  if (ctx.playerRegion) {
    const dRegion = chebyshevR(npc.rx, npc.ry, ctx.playerRegion.rx, ctx.playerRegion.ry);
    const repHostile = (ctx.playerReputation[npc.factionId] ?? 0) < 0;
    const engaged =
      npc.engagedTick !== null && ctx.ticks - npc.engagedTick < ENGAGED_TTL_TICKS;
    if ((repHostile || engaged) && dRegion <= NPC_PERCEPTION_REGIONS) {
      target = { rx: ctx.playerRegion.rx, ry: ctx.playerRegion.ry };
    } else {
      const lastAttacked = ctx.recentFactionAttacks[npc.factionId];
      if (
        !repHostile &&
        lastAttacked !== undefined &&
        ctx.ticks - lastAttacked < FLEE_TTL_TICKS &&
        dRegion <= NPC_PERCEPTION_REGIONS
      ) {
        target = fleeTargetFromPlayer(npc, ctx.playerRegion, mapW, mapH);
      }
    }
  }
  const candidates = passableNeighbors(npc.rx, npc.ry, mapW, mapH);

  if (candidates.length === 0) {
    return {
      ...npc,
      goal,
      goalTtl,
      homeRegion,
      stuckCounter,
      lastDistance,
      moveCooldown: rng.int(IDLE_MIN, IDLE_MAX),
    };
  }

  if (!target || stuckCounter >= STUCK_THRESHOLD) {
    if (!rng.chance(MOVE_CHANCE)) {
      return {
        ...npc,
        goal,
        goalTtl,
        homeRegion,
        stuckCounter: 0,
        lastDistance: -1,
        moveCooldown: rng.int(IDLE_MIN, IDLE_MAX),
      };
    }
    const random = candidates[rng.int(0, candidates.length)]!;
    return {
      ...npc,
      goal,
      goalTtl,
      homeRegion,
      stuckCounter: 0,
      lastDistance: -1,
      intent: { rx: random[0], ry: random[1] },
      moveCooldown: TELEGRAPH_TICKS,
    };
  }

  const currentDistance = manhattan(npc.rx, npc.ry, target.rx, target.ry);
  const scored = candidates
    .map(([nx, ny]) => ({ nx, ny, d: manhattan(nx, ny, target.rx, target.ry) }))
    .sort((a, b) => a.d - b.d);
  const best = scored[0]!;
  const tied = scored.filter((s) => s.d === best.d);
  const choice = tied[rng.int(0, tied.length)]!;

  let nextStuck = stuckCounter;
  if (lastDistance >= 0 && best.d >= lastDistance) {
    nextStuck = stuckCounter + 1;
  } else {
    nextStuck = 0;
  }

  if (best.d >= currentDistance) {
    nextStuck = stuckCounter + 1;
  }

  return {
    ...npc,
    goal,
    goalTtl,
    homeRegion,
    stuckCounter: nextStuck,
    lastDistance: best.d,
    intent: { rx: choice.nx, ry: choice.ny },
    moveCooldown: TELEGRAPH_TICKS,
  };
}

function passableNeighbors(
  rx: number,
  ry: number,
  mapW: number,
  mapH: number,
): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    const nx = rx + dx;
    const ny = ry + dy;
    if (!isPassable(nx, ny, mapW, mapH)) continue;
    out.push([nx, ny]);
  }
  return out;
}

function manhattan(ax: number, ay: number, bx: number, by: number): number {
  return Math.abs(ax - bx) + Math.abs(ay - by);
}

function chebyshevR(ax: number, ay: number, bx: number, by: number): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

function fleeTargetFromPlayer(
  npc: Npc,
  playerRegion: { rx: number; ry: number },
  mapW: number,
  mapH: number,
): { rx: number; ry: number } {
  // Step away from the player on the dominant axis, clamped to map bounds.
  const dx = npc.rx - playerRegion.rx;
  const dy = npc.ry - playerRegion.ry;
  const sx = dx === 0 ? 1 : Math.sign(dx);
  const sy = dy === 0 ? 1 : Math.sign(dy);
  const tx = Math.max(0, Math.min(mapW - 1, npc.rx + sx * 3));
  const ty = Math.max(0, Math.min(mapH - 1, npc.ry + sy * 3));
  return { rx: tx, ry: ty };
}
