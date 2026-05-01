import type { Rng } from "@/lib/sim/rng";
import { biomeAt, isPassable } from "@/lib/sim/biome";
import { regionKey } from "@/lib/sim/biome-interior";
import { BIOME_RESOURCES, type ResourceKind } from "@/content/resources";
import type { Npc } from "@/lib/sim/npc";

export type Goal =
  | { kind: "wander" }
  | {
      kind: "gather";
      resourceKind: ResourceKind;
      targetRegion: { rx: number; ry: number };
      phase: "outbound" | "inbound";
    }
  | {
      kind: "patrol";
      regions: Array<{ rx: number; ry: number }>;
      index: number;
      lapsRemaining: number;
    }
  | {
      kind: "raid";
      targetFactionId: string;
      targetRegion: { rx: number; ry: number };
    }
  | { kind: "trade"; peerNpcId: string };

export type GoalCtx = {
  npc: Npc;
  rng: Rng;
  regionControl: Record<string, string>;
  npcs: Npc[];
  mapW: number;
  mapH: number;
};

export const GOAL_TTL_TICKS = 600;

type GoalKind = Goal["kind"];

const VALUE_WEIGHTS: Record<string, Partial<Record<GoalKind, number>>> = {
  violence: { raid: 3 },
  ambition: { raid: 2 },
  freedom: { wander: 2, raid: 1 },
  nature: { gather: 3 },
  balance: { patrol: 2, gather: 1 },
  knowledge: { wander: 1, patrol: 1 },
  order: { patrol: 2 },
  tradition: { patrol: 1, trade: 1 },
  trade: { trade: 3 },
};

const TRAIT_WEIGHTS: Record<string, Partial<Record<GoalKind, number>>> = {
  brave: { raid: 2 },
  brutish: { raid: 2 },
  treacherous: { raid: 1 },
  impulsive: { raid: 1, wander: 1 },
  cowardly: { patrol: 2, raid: -2 },
  greedy: { gather: 2 },
  patient: { gather: 1, patrol: 1 },
  pious: { patrol: 1 },
  loyal: { patrol: 2, trade: 1 },
  generous: { trade: 2 },
  scholarly: { wander: 2 },
  skeptical: { wander: 1 },
};

export function pickGoal(ctx: GoalCtx): Goal {
  const { npc, rng } = ctx;
  const weights: Record<GoalKind, number> = {
    wander: 1,
    gather: 0,
    patrol: 0,
    raid: 0,
    trade: 0,
  };
  for (const value of npc.values) {
    const w = VALUE_WEIGHTS[value];
    if (!w) continue;
    for (const k of Object.keys(w) as GoalKind[]) weights[k] += w[k] ?? 0;
  }
  for (const trait of npc.traits) {
    const w = TRAIT_WEIGHTS[trait];
    if (!w) continue;
    for (const k of Object.keys(w) as GoalKind[]) weights[k] += w[k] ?? 0;
  }

  const order: GoalKind[] = ["raid", "gather", "trade", "patrol", "wander"];
  for (const kind of pickOrderByWeight(order, weights, rng)) {
    const built = buildGoal(kind, ctx);
    if (built) return built;
  }
  return { kind: "wander" };
}

function pickOrderByWeight(
  kinds: GoalKind[],
  weights: Record<GoalKind, number>,
  rng: Rng,
): GoalKind[] {
  const pool = kinds.map((k) => ({ k, w: Math.max(0, weights[k]) + 0.0001 }));
  const out: GoalKind[] = [];
  while (pool.length > 0) {
    const total = pool.reduce((a, b) => a + b.w, 0);
    let r = rng.next() * total;
    let idx = 0;
    for (let i = 0; i < pool.length; i++) {
      r -= pool[i]!.w;
      if (r <= 0) {
        idx = i;
        break;
      }
    }
    out.push(pool[idx]!.k);
    pool.splice(idx, 1);
  }
  return out;
}

function buildGoal(kind: GoalKind, ctx: GoalCtx): Goal | null {
  switch (kind) {
    case "wander":
      return { kind: "wander" };
    case "gather":
      return buildGather(ctx);
    case "patrol":
      return buildPatrol(ctx);
    case "raid":
      return buildRaid(ctx);
    case "trade":
      return buildTrade(ctx);
  }
}

function buildGather(ctx: GoalCtx): Goal | null {
  const { npc, rng, regionControl, mapW, mapH } = ctx;
  const candidates: Array<{ rx: number; ry: number; food: ResourceKind[]; bonus: number }> = [];
  const maxR = 8;
  for (let dy = -maxR; dy <= maxR; dy++) {
    for (let dx = -maxR; dx <= maxR; dx++) {
      const rx = npc.rx + dx;
      const ry = npc.ry + dy;
      if (!isPassable(rx, ry, mapW, mapH)) continue;
      const biome = biomeAt(rx, ry);
      const food = BIOME_RESOURCES[biome].food;
      if (food.length === 0) continue;
      const owner = regionControl[regionKey(rx, ry)];
      const bonus = owner === npc.factionId ? 4 : !owner ? 2 : 0;
      candidates.push({ rx, ry, food, bonus });
    }
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    const da = manhattan(npc.rx, npc.ry, a.rx, a.ry) - a.bonus;
    const db = manhattan(npc.rx, npc.ry, b.rx, b.ry) - b.bonus;
    return da - db;
  });
  const top = candidates.slice(0, Math.min(4, candidates.length));
  const pick = top[rng.int(0, top.length)]!;
  const resourceKind = rng.pick(pick.food);
  return {
    kind: "gather",
    resourceKind,
    targetRegion: { rx: pick.rx, ry: pick.ry },
    phase: "outbound",
  };
}

function buildPatrol(ctx: GoalCtx): Goal | null {
  const { npc, rng, regionControl, mapW, mapH } = ctx;
  const owned: Array<{ rx: number; ry: number }> = [];
  for (const key of Object.keys(regionControl)) {
    if (regionControl[key] !== npc.factionId) continue;
    const [sx, sy] = key.split(",");
    const rx = Number(sx);
    const ry = Number(sy);
    if (!Number.isFinite(rx) || !Number.isFinite(ry)) continue;
    if (manhattan(npc.rx, npc.ry, rx, ry) > 10) continue;
    owned.push({ rx, ry });
  }
  let regions: Array<{ rx: number; ry: number }>;
  if (owned.length >= 3) {
    owned.sort(
      (a, b) =>
        manhattan(npc.rx, npc.ry, a.rx, a.ry) - manhattan(npc.rx, npc.ry, b.rx, b.ry),
    );
    regions = owned.slice(0, 3);
  } else {
    regions = nearbyPassableRing(npc.rx, npc.ry, mapW, mapH, 3, rng);
  }
  if (regions.length === 0) return null;
  return { kind: "patrol", regions, index: 0, lapsRemaining: 1 };
}

function buildRaid(ctx: GoalCtx): Goal | null {
  const { npc, rng, regionControl, mapW, mapH } = ctx;
  const candidates: Array<{ rx: number; ry: number; factionId: string }> = [];
  for (const key of Object.keys(regionControl)) {
    const owner = regionControl[key]!;
    if (owner === npc.factionId) continue;
    const [sx, sy] = key.split(",");
    const rx = Number(sx);
    const ry = Number(sy);
    if (!Number.isFinite(rx) || !Number.isFinite(ry)) continue;
    if (!isPassable(rx, ry, mapW, mapH)) continue;
    candidates.push({ rx, ry, factionId: owner });
  }
  if (candidates.length === 0) return null;
  candidates.sort(
    (a, b) =>
      manhattan(npc.rx, npc.ry, a.rx, a.ry) - manhattan(npc.rx, npc.ry, b.rx, b.ry),
  );
  const top = candidates.slice(0, Math.min(4, candidates.length));
  const pick = top[rng.int(0, top.length)]!;
  return {
    kind: "raid",
    targetFactionId: pick.factionId,
    targetRegion: { rx: pick.rx, ry: pick.ry },
  };
}

function buildTrade(ctx: GoalCtx): Goal | null {
  const { npc, rng, npcs } = ctx;
  const peers = npcs.filter(
    (n) => n.id !== npc.id && n.factionId !== npc.factionId,
  );
  if (peers.length === 0) return null;
  peers.sort(
    (a, b) =>
      manhattan(npc.rx, npc.ry, a.rx, a.ry) - manhattan(npc.rx, npc.ry, b.rx, b.ry),
  );
  const top = peers.slice(0, Math.min(6, peers.length));
  const peer = top[rng.int(0, top.length)]!;
  return { kind: "trade", peerNpcId: peer.id };
}

export function goalTarget(
  goal: Goal,
  npc: Npc,
  npcs: Npc[],
): { rx: number; ry: number } | null {
  switch (goal.kind) {
    case "wander":
      return null;
    case "gather":
      if (goal.phase === "outbound") return goal.targetRegion;
      return npc.homeRegion;
    case "patrol":
      return goal.regions[goal.index] ?? null;
    case "raid":
      return goal.targetRegion;
    case "trade": {
      const peer = npcs.find((n) => n.id === goal.peerNpcId);
      if (!peer) return null;
      return { rx: peer.rx, ry: peer.ry };
    }
  }
}

export function isGoalDone(npc: Npc, goal: Goal, npcs: Npc[]): boolean {
  switch (goal.kind) {
    case "wander":
      return false;
    case "gather":
      return (
        goal.phase === "inbound" &&
        npc.rx === npc.homeRegion.rx &&
        npc.ry === npc.homeRegion.ry
      );
    case "patrol":
      return goal.lapsRemaining <= 0;
    case "raid":
      return npc.rx === goal.targetRegion.rx && npc.ry === goal.targetRegion.ry;
    case "trade": {
      const peer = npcs.find((n) => n.id === goal.peerNpcId);
      if (!peer) return true;
      return Math.abs(npc.rx - peer.rx) + Math.abs(npc.ry - peer.ry) <= 1;
    }
  }
}

export function advanceGoalState(npc: Npc, goal: Goal): Goal {
  switch (goal.kind) {
    case "wander":
    case "raid":
    case "trade":
      return goal;
    case "gather":
      if (
        goal.phase === "outbound" &&
        npc.rx === goal.targetRegion.rx &&
        npc.ry === goal.targetRegion.ry
      ) {
        return { ...goal, phase: "inbound" };
      }
      return goal;
    case "patrol": {
      const cur = goal.regions[goal.index];
      if (!cur) return goal;
      if (npc.rx === cur.rx && npc.ry === cur.ry) {
        const nextIndex = (goal.index + 1) % goal.regions.length;
        const lapsRemaining =
          nextIndex === 0 ? goal.lapsRemaining - 1 : goal.lapsRemaining;
        return { ...goal, index: nextIndex, lapsRemaining };
      }
      return goal;
    }
  }
}

function manhattan(ax: number, ay: number, bx: number, by: number): number {
  return Math.abs(ax - bx) + Math.abs(ay - by);
}

function nearbyPassableRing(
  rx: number,
  ry: number,
  mapW: number,
  mapH: number,
  count: number,
  rng: Rng,
): Array<{ rx: number; ry: number }> {
  const out: Array<{ rx: number; ry: number }> = [];
  const seen = new Set<string>();
  for (let radius = 2; radius <= 6 && out.length < count; radius++) {
    const ring: Array<{ rx: number; ry: number }> = [];
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
        const x = rx + dx;
        const y = ry + dy;
        if (!isPassable(x, y, mapW, mapH)) continue;
        const k = `${x},${y}`;
        if (seen.has(k)) continue;
        ring.push({ rx: x, ry: y });
      }
    }
    while (ring.length > 0 && out.length < count) {
      const idx = rng.int(0, ring.length);
      const r = ring.splice(idx, 1)[0]!;
      seen.add(`${r.rx},${r.ry}`);
      out.push(r);
    }
  }
  return out;
}
