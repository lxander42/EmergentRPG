import type { Biome } from "@/lib/sim/biome";

export type ResourceKind =
  | "wood"
  | "berry"
  | "herb"
  | "grain"
  | "stone"
  | "ore"
  | "shell"
  | "reed";

export type ResourceMeta = {
  label: string;
  swatch: string;
};

export const RESOURCES: Record<ResourceKind, ResourceMeta> = {
  wood: { label: "Wood", swatch: "#8a6a4a" },
  berry: { label: "Berry", swatch: "#b85b6e" },
  herb: { label: "Herb", swatch: "#7aa05c" },
  grain: { label: "Grain", swatch: "#d8b66a" },
  stone: { label: "Stone", swatch: "#9c9588" },
  ore: { label: "Ore", swatch: "#6f7a8e" },
  shell: { label: "Shell", swatch: "#e8c8b0" },
  reed: { label: "Reed", swatch: "#a8b878" },
};

// Water is intentionally excluded -- it's not claimable as a home base.
export const BIOME_RESOURCES: Record<Biome, ResourceKind[]> = {
  grass: ["grain", "herb"],
  forest: ["wood", "berry"],
  sand: ["shell", "reed"],
  stone: ["stone", "ore"],
  water: [],
};
