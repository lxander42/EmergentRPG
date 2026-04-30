export type FactionDef = {
  id: string;
  name: string;
  color: number;
  values: string[];
};

export const FACTIONS: readonly FactionDef[] = [
  {
    id: "ironvale",
    name: "Ironvale Council",
    color: 0xc9a96e,
    values: ["order", "tradition", "trade"],
  },
  {
    id: "greenmantle",
    name: "Greenmantle Druids",
    color: 0x6fa86b,
    values: ["nature", "knowledge", "balance"],
  },
  {
    id: "ashen",
    name: "Ashen Reach",
    color: 0xb46060,
    values: ["freedom", "ambition", "violence"],
  },
];
