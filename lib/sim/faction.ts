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

export function nudgePower(
  factions: FactionState[],
  factionId: string,
  delta: number,
): FactionState[] {
  return factions.map((f) =>
    f.id === factionId ? { ...f, power: clampPower(f.power + delta) } : f,
  );
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

function clampPower(value: number): number {
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
}

export function playerRepOf(
  playerReputation: Record<string, number>,
  factionId: string,
): number {
  return playerReputation[factionId] ?? 0;
}

export function gainPlayerRep(
  playerReputation: Record<string, number>,
  factionId: string,
  delta: number,
): Record<string, number> {
  const cur = playerReputation[factionId] ?? 0;
  return { ...playerReputation, [factionId]: clampRep(cur + delta) };
}

export function losePlayerRep(
  playerReputation: Record<string, number>,
  factionId: string,
  delta: number,
): Record<string, number> {
  return gainPlayerRep(playerReputation, factionId, -Math.abs(delta));
}

export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function getRelation(
  factionRelations: Record<string, number>,
  a: string,
  b: string,
): number {
  if (a === b) return 0;
  return factionRelations[pairKey(a, b)] ?? 0;
}

export function nudgeRelation(
  factionRelations: Record<string, number>,
  a: string,
  b: string,
  delta: number,
): Record<string, number> {
  if (a === b) return factionRelations;
  const key = pairKey(a, b);
  const cur = factionRelations[key] ?? 0;
  return { ...factionRelations, [key]: clampRep(cur + delta) };
}

// Hostility between two NPCs of (potentially) different factions. Same faction
// is never hostile. Otherwise hostile when relations have soured below zero
// or either faction's values include `violence` (raiders pick fights).
export function isFactionHostile(
  factionRelations: Record<string, number>,
  factionAValues: readonly string[],
  factionBValues: readonly string[],
  factionAId: string,
  factionBId: string,
): boolean {
  if (factionAId === factionBId) return false;
  if (getRelation(factionRelations, factionAId, factionBId) < 0) return true;
  if (factionAValues.includes("violence") || factionBValues.includes("violence")) return true;
  return false;
}
