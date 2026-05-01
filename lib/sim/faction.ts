import { FACTIONS, type FactionDef } from "@/content/factions";

export type FactionState = {
  id: string;
  name: string;
  reputation: number;
  power: number;
};

export const REPUTATION_MIN = -100;
export const REPUTATION_MAX = 100;

export function initialFactions(): FactionState[] {
  return FACTIONS.map((f: FactionDef) => ({
    id: f.id,
    name: f.name,
    reputation: 0,
    power: 50,
  }));
}

export function gainRep(
  factions: FactionState[],
  factionId: string,
  delta: number,
): FactionState[] {
  return factions.map((f) =>
    f.id === factionId
      ? { ...f, reputation: clampRep(f.reputation + delta) }
      : f,
  );
}

export function loseRep(
  factions: FactionState[],
  factionId: string,
  delta: number,
): FactionState[] {
  return gainRep(factions, factionId, -Math.abs(delta));
}

export function findFaction(
  factions: FactionState[],
  factionId: string,
): FactionState | undefined {
  return factions.find((f) => f.id === factionId);
}

function clampRep(value: number): number {
  if (value < REPUTATION_MIN) return REPUTATION_MIN;
  if (value > REPUTATION_MAX) return REPUTATION_MAX;
  return value;
}
