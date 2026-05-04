import type { Rng } from "@/lib/sim/rng";
import type { GameOverReason } from "@/lib/sim/world";
import { NAMES } from "@/content/traits";
import { FACTIONS } from "@/content/factions";

export type Legacy = {
  id: string;
  name: string;
  factionOfOriginId: string;
  bornAtTick: number;
  endedAtTick: number;
  ticksAlive: number;
  regionsDiscovered: number;
  kills: number;
  cause: GameOverReason;
};

export function pickLifeName(rng: Rng, takenNames: readonly string[]): string {
  const taken = new Set(takenNames);
  const free = NAMES.filter((n) => !taken.has(n));
  const pool = free.length > 0 ? free : NAMES;
  return rng.pick(pool);
}

export function pickFactionOfOrigin(rng: Rng): string {
  return rng.pick(FACTIONS).id;
}

export function decayReputation(
  rep: Record<string, number>,
  factor: number,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(rep)) {
    const next = Math.trunc(v * factor);
    if (next !== 0) out[k] = next;
  }
  return out;
}
