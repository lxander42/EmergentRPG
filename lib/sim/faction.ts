import { FACTIONS, type FactionDef } from "@/content/factions";

export type FactionState = {
  id: string;
  name: string;
  reputation: number;
  power: number;
};

export function initialFactions(): FactionState[] {
  return FACTIONS.map((f: FactionDef) => ({
    id: f.id,
    name: f.name,
    reputation: 0,
    power: 50,
  }));
}
