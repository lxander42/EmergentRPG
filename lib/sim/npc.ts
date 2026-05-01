import type { Rng } from "@/lib/sim/rng";
import { isPassable } from "@/lib/sim/biome";
import { FACTIONS } from "@/content/factions";
import { NAMES, TRAITS } from "@/content/traits";

export type Intent = { rx: number; ry: number };

export type Npc = {
  id: string;
  name: string;
  factionId: string;
  factionColor: number;
  traits: string[];
  values: string[];
  rx: number;
  ry: number;
  // When set, the NPC has committed to moving to this region. While
  // intent is non-null, moveCooldown counts down a short telegraph
  // window before the move executes -- giving the player a chance to
  // see where they're headed.
  intent: Intent | null;
  // Ticks remaining in the current cycle. While intent is null, this is
  // an idle window between movement decisions. While intent is set,
  // it's the telegraph window.
  moveCooldown: number;
  goal: string;
};

const GOALS = [
  "seeking work",
  "looking for a friend",
  "scouting the woods",
  "trading goods",
  "spreading rumor",
  "praying",
];

const IDLE_MIN = 12; // 250ms ticks * 12 = 3s minimum idle between cycles
const IDLE_MAX = 30; // up to 7.5s
const TELEGRAPH_TICKS = 8; // ~2s of "I'm about to go there" before the move fires
const MOVE_CHANCE = 0.5; // chance to actually pick a target when idle expires

export function spawnNpc(rng: Rng, id: number, mapW: number, mapH: number): Npc {
  const faction = rng.pick(FACTIONS);
  const traitCount = rng.int(2, 4);
  const traits: string[] = [];
  while (traits.length < traitCount) {
    const t = rng.pick(TRAITS);
    if (!traits.includes(t)) traits.push(t);
  }

  // Place on a passable (non-water) region. Bounded retries; fall back to centre.
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

  return {
    id: `npc-${id}`,
    name: rng.pick(NAMES),
    factionId: faction.id,
    factionColor: faction.color,
    traits,
    values: [...faction.values],
    rx,
    ry,
    intent: null,
    moveCooldown: rng.int(IDLE_MIN, IDLE_MAX),
    goal: rng.pick(GOALS),
  };
}

export function tickNpc(npc: Npc, rng: Rng, mapW: number, mapH: number): Npc {
  const cooldown = npc.moveCooldown ?? 0;

  if (cooldown > 0) {
    return { ...npc, moveCooldown: cooldown - 1 };
  }

  // Cooldown is up. Either execute the telegraphed move, or roll a new cycle.
  if (npc.intent) {
    return {
      ...npc,
      rx: npc.intent.rx,
      ry: npc.intent.ry,
      intent: null,
      moveCooldown: rng.int(IDLE_MIN, IDLE_MAX),
    };
  }

  if (!rng.chance(MOVE_CHANCE)) {
    return { ...npc, moveCooldown: rng.int(IDLE_MIN, IDLE_MAX) };
  }

  const candidates: Array<[number, number]> = [];
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    const nx = npc.rx + dx;
    const ny = npc.ry + dy;
    if (!isPassable(nx, ny, mapW, mapH)) continue;
    candidates.push([nx, ny]);
  }

  if (candidates.length === 0) {
    return { ...npc, moveCooldown: rng.int(IDLE_MIN, IDLE_MAX) };
  }

  const [nx, ny] = rng.pick(candidates);
  return {
    ...npc,
    intent: { rx: nx, ry: ny },
    moveCooldown: TELEGRAPH_TICKS,
  };
}
