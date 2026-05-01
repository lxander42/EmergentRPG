import type { Rng } from "@/lib/sim/rng";
import { isPassable } from "@/lib/sim/biome";
import { FACTIONS } from "@/content/factions";
import { NAMES, TRAITS } from "@/content/traits";

export type Npc = {
  id: string;
  name: string;
  factionId: string;
  factionColor: number;
  traits: string[];
  values: string[];
  rx: number;
  ry: number;
  moveCooldown: number; // ticks remaining before next movement attempt
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

const MIN_COOLDOWN = 12; // 250ms ticks * 12 = 3s minimum between moves
const MAX_COOLDOWN = 30; // up to 7.5s
const MOVE_CHANCE = 0.4; // chance to actually move once cooldown expires

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
    moveCooldown: rng.int(MIN_COOLDOWN, MAX_COOLDOWN),
    goal: rng.pick(GOALS),
  };
}

export function tickNpc(npc: Npc, rng: Rng, mapW: number, mapH: number): Npc {
  // Defensive default for saves that predate the moveCooldown field.
  const cooldown = npc.moveCooldown ?? 0;
  if (cooldown > 0) {
    return { ...npc, moveCooldown: cooldown - 1 };
  }

  // Cooldown expired -- decide whether to move at all this window.
  if (!rng.chance(MOVE_CHANCE)) {
    return { ...npc, moveCooldown: rng.int(MIN_COOLDOWN, MAX_COOLDOWN) };
  }

  // Pick an adjacent passable region.
  const candidates: Array<[number, number]> = [];
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    const nx = npc.rx + dx;
    const ny = npc.ry + dy;
    if (nx < 0 || ny < 0 || nx >= mapW || ny >= mapH) continue;
    if (!isPassable(nx, ny, mapW, mapH)) continue;
    candidates.push([nx, ny]);
  }

  if (candidates.length === 0) {
    return { ...npc, moveCooldown: rng.int(MIN_COOLDOWN, MAX_COOLDOWN) };
  }

  const [nx, ny] = rng.pick(candidates);
  return {
    ...npc,
    rx: nx,
    ry: ny,
    moveCooldown: rng.int(MIN_COOLDOWN, MAX_COOLDOWN),
  };
}
