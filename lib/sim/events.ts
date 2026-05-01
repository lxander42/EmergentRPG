import type { Rng } from "@/lib/sim/rng";
import type { World } from "@/lib/sim/world";
import type { Npc } from "@/lib/sim/npc";
import type { FactionState } from "@/lib/sim/faction";
import { biomeAt } from "@/lib/sim/biome";
import { BIOME_RESOURCES, type ResourceKind } from "@/content/resources";

export type EncounterSentiment = "friendly" | "hostile";

export type EncounterPayload = {
  npcId: string;
  npcName: string;
  factionId: string;
  factionColor: number;
  sentiment: EncounterSentiment;
  offer?: { kind: ResourceKind; amount: number };
};

export type WorldEvent = {
  id: string;
  tick: number;
  topic: string;
  context: string;
  encounter?: EncounterPayload;
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

export function buildEncounterEvent(
  world: World,
  npc: Npc,
  faction: FactionState,
  rng: Rng,
): WorldEvent {
  const sentiment: EncounterSentiment = faction.reputation >= 0 ? "friendly" : "hostile";
  const factionName = faction.name;
  if (sentiment === "friendly") {
    const offer = pickOffer(npc, rng);
    const offerLine = offer
      ? `offers a basket of ${offer.kind}.`
      : `nods in greeting.`;
    return {
      id: `enc-${world.ticks}-${npc.id}`,
      tick: world.ticks,
      topic: "encounter:gift",
      context: `${npc.name} of ${factionName} ${offerLine}`,
      encounter: {
        npcId: npc.id,
        npcName: npc.name,
        factionId: npc.factionId,
        factionColor: npc.factionColor,
        sentiment,
        ...(offer ? { offer } : {}),
      },
    };
  }
  return {
    id: `enc-${world.ticks}-${npc.id}`,
    tick: world.ticks,
    topic: "encounter:challenge",
    context: `${npc.name} of ${factionName} blocks the path.`,
    encounter: {
      npcId: npc.id,
      npcName: npc.name,
      factionId: npc.factionId,
      factionColor: npc.factionColor,
      sentiment,
    },
  };
}

function pickOffer(npc: Npc, rng: Rng): { kind: ResourceKind; amount: number } | undefined {
  const biome = biomeAt(npc.rx, npc.ry);
  const food = BIOME_RESOURCES[biome].food;
  if (food.length === 0) return undefined;
  const kind = rng.pick(food);
  return { kind, amount: 1 };
}
