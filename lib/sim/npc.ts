import type { Rng } from "@/lib/sim/rng";
import { FACTIONS } from "@/content/factions";
import { NAMES, TRAITS } from "@/content/traits";

export type Npc = {
  id: string;
  name: string;
  factionId: string;
  factionColor: number;
  traits: string[];
  values: string[];
  x: number;
  y: number;
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

export function spawnNpc(rng: Rng, id: number, mapW: number, mapH: number): Npc {
  const faction = rng.pick(FACTIONS);
  const traitCount = rng.int(2, 4);
  const traits: string[] = [];
  while (traits.length < traitCount) {
    const t = rng.pick(TRAITS);
    if (!traits.includes(t)) traits.push(t);
  }
  return {
    id: `npc-${id}`,
    name: rng.pick(NAMES),
    factionId: faction.id,
    factionColor: faction.color,
    traits,
    values: [...faction.values],
    x: rng.int(2, mapW - 2),
    y: rng.int(2, mapH - 2),
    goal: rng.pick(GOALS),
  };
}

export function tickNpc(npc: Npc, rng: Rng, mapW: number, mapH: number): Npc {
  // Random walk for now. Real AI goes here later (utility scoring on goals/traits).
  const dx = rng.int(-1, 2);
  const dy = rng.int(-1, 2);
  const nx = Math.min(Math.max(1, npc.x + dx), mapW - 2);
  const ny = Math.min(Math.max(1, npc.y + dy), mapH - 2);
  if (nx === npc.x && ny === npc.y) return npc;
  return { ...npc, x: nx, y: ny };
}
