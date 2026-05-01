export type FactionDef = {
  id: string;
  name: string;
  color: number;
  values: string[];
};

// Mini Motorways-style pastel triad: warm mustard, sage, dusty coral.
// Distinct hue + similar saturation so all three read clearly on cream.
export const FACTIONS: readonly FactionDef[] = [
  {
    id: "ironvale",
    name: "Ironvale Council",
    color: 0xe3b96e,
    values: ["order", "tradition", "trade"],
  },
  {
    id: "greenmantle",
    name: "Greenmantle Druids",
    color: 0x7fa67a,
    values: ["nature", "knowledge", "balance"],
  },
  {
    id: "ashen",
    name: "Ashen Reach",
    color: 0xd77575,
    values: ["freedom", "ambition", "violence"],
  },
];
