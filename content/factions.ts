export type FactionShape = "triangle" | "hex" | "diamond" | "square";

export type FactionDef = {
  id: string;
  name: string;
  color: number;
  shape: FactionShape;
  values: string[];
};

// Mini Motorways-style pastel triad: warm mustard, sage, dusty coral.
// Distinct hue + similar saturation so all three read clearly on cream.
// Each faction has a distinct silhouette so factions are still
// distinguishable in monochrome / for colour-blind players.
// Square is reserved for the player.
export const FACTIONS: readonly FactionDef[] = [
  {
    id: "ironvale",
    name: "Ironvale Council",
    color: 0xe3b96e,
    shape: "triangle",
    values: ["order", "tradition", "trade"],
  },
  {
    id: "greenmantle",
    name: "Greenmantle Druids",
    color: 0x7fa67a,
    shape: "hex",
    values: ["nature", "knowledge", "balance"],
  },
  {
    id: "ashen",
    name: "Ashen Reach",
    color: 0xd77575,
    shape: "diamond",
    values: ["freedom", "ambition", "violence"],
  },
];
