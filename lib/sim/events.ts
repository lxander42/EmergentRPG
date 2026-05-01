import type { Rng } from "@/lib/sim/rng";
import type { World } from "@/lib/sim/world";

export type WorldEvent = {
  id: string;
  tick: number;
  topic: string;
  context: string;
};

const TOPICS = [
  "border skirmish",
  "harvest festival",
  "missing caravan",
  "rumor of a beast",
  "political quarrel",
  "strange weather",
];

export function maybeEmitEvent(world: World, rng: Rng): WorldEvent | null {
  // Roughly one event every ~120 ticks.
  if (!rng.chance(1 / 120)) return null;
  const topic = rng.pick(TOPICS);
  const factionA = rng.pick(world.factions);
  const factionB = rng.pick(world.factions.filter((f) => f.id !== factionA.id));
  const context = `Tick ${world.ticks}. ${factionA.name} (rep ${factionA.reputation}, power ${factionA.power}) and ${factionB.name} (rep ${factionB.reputation}, power ${factionB.power}). Topic: ${topic}.`;
  return {
    id: `evt-${world.ticks}-${rng.int(0, 10000)}`,
    tick: world.ticks,
    topic,
    context,
  };
}
