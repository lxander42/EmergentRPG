import { createRng } from "@/lib/sim/rng";
import { initialFactions, type FactionState } from "@/lib/sim/faction";
import { spawnNpc, tickNpc, type Npc } from "@/lib/sim/npc";
import { maybeEmitEvent, type WorldEvent } from "@/lib/sim/events";

export { biomeAt, isPassable, type Biome } from "@/lib/sim/biome";

export const WORLD_VERSION = 2;
export const MAP_W = 12;
export const MAP_H = 12;
export const NPC_COUNT = 14;

export type World = {
  version: number;
  seed: number;
  rngState: number;
  ticks: number;
  npcs: Npc[];
  factions: FactionState[];
  recentEvents: WorldEvent[];
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
  };
}

export function tickWorld(world: World): { world: World; event: WorldEvent | null } {
  const rng = createRng(world.rngState);
  const npcs = world.npcs.map((n) => tickNpc(n, rng, MAP_W, MAP_H));
  const next: World = {
    ...world,
    ticks: world.ticks + 1,
    npcs,
    rngState: rng.state(),
  };
  const event = maybeEmitEvent(next, rng);
  if (event) {
    next.recentEvents = [event, ...next.recentEvents].slice(0, 8);
    next.rngState = rng.state();
  }
  return { world: next, event };
}

export function summarizeWorld(world: World): string {
  return [
    `Tick ${world.ticks}.`,
    `Factions: ${world.factions.map((f) => `${f.name} (power ${f.power})`).join(", ")}.`,
    `${world.npcs.length} named NPCs are in play.`,
  ].join(" ");
}

export function findNpc(world: World, id: string): Npc | undefined {
  return world.npcs.find((n) => n.id === id);
}
