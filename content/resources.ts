import type { Biome } from "@/lib/sim/biome";

export type ResourceKind =
  | "berry"
  | "herb"
  | "grain"
  | "shellfish"
  | "tubers"
  | "wood"
  | "reed"
  | "stone"
  | "ore";

export type ResourceMeta = {
  label: string;
  swatch: string;
  food: boolean;
  energy: number;
};

export const RESOURCES: Record<ResourceKind, ResourceMeta> = {
  berry: { label: "Berry", swatch: "#b85b6e", food: true, energy: 3 },
  herb: { label: "Herb", swatch: "#7aa05c", food: true, energy: 2 },
  grain: { label: "Grain", swatch: "#d8b66a", food: true, energy: 3 },
  shellfish: { label: "Shellfish", swatch: "#e8c8b0", food: true, energy: 4 },
  tubers: { label: "Tubers", swatch: "#a88660", food: true, energy: 3 },
  wood: { label: "Wood", swatch: "#8a6a4a", food: false, energy: 0 },
  reed: { label: "Reed", swatch: "#a8b878", food: false, energy: 0 },
  stone: { label: "Stone", swatch: "#9c9588", food: false, energy: 0 },
  ore: { label: "Ore", swatch: "#6f7a8e", food: false, energy: 0 },
};

export type BiomeResourceLists = { food: ResourceKind[]; materials: ResourceKind[] };

// Every passable biome has at least one food source. Density varies.
// Repeated entries weight the random pick — forests are mostly wood with a
// minority of stone (sparser than mountain regions, but enough to craft an
// initial workbench at home).
export const BIOME_RESOURCES: Record<Biome, BiomeResourceLists> = {
  grass: { food: ["berry", "grain"], materials: ["reed"] },
  forest: { food: ["berry", "herb"], materials: ["wood", "wood", "wood", "stone"] },
  sand: { food: ["shellfish"], materials: ["reed"] },
  stone: { food: ["tubers"], materials: ["stone", "stone", "ore"] },
  water: { food: [], materials: [] },
};

export const RESOURCE_DENSITY: Record<Biome, number> = {
  forest: 0.06,
  grass: 0.04,
  sand: 0.025,
  stone: 0.035,
  water: 0,
};
