import type { Biome } from "@/lib/sim/biome";
import type { TileName } from "@/content/tiles";

export type ResourceKind =
  | "berry"
  | "herb"
  | "grain"
  | "shellfish"
  | "tubers"
  | "wood"
  | "reed"
  | "stone"
  | "ore"
  | "copper_ore"
  | "tin_ore"
  | "iron_ore"
  | "coal"
  | "copper_ingot"
  | "bronze_ingot"
  | "iron_ingot"
  | "steel_ingot";

export type ResourceMeta = {
  label: string;
  swatch: string;
  food: boolean;
  energy: number;
  frame: TileName;
};

export const RESOURCES: Record<ResourceKind, ResourceMeta> = {
  berry: { label: "Berry", swatch: "#b85b6e", food: true, energy: 3, frame: "res_berry" },
  herb: { label: "Herb", swatch: "#7aa05c", food: true, energy: 2, frame: "res_herb" },
  grain: { label: "Grain", swatch: "#d8b66a", food: true, energy: 3, frame: "res_grain" },
  shellfish: { label: "Shellfish", swatch: "#e8c8b0", food: true, energy: 4, frame: "res_shellfish" },
  tubers: { label: "Tubers", swatch: "#a88660", food: true, energy: 3, frame: "res_tubers" },
  wood: { label: "Wood", swatch: "#8a6a4a", food: false, energy: 0, frame: "res_wood" },
  reed: { label: "Reed", swatch: "#a8b878", food: false, energy: 0, frame: "res_reed" },
  stone: { label: "Stone", swatch: "#9c9588", food: false, energy: 0, frame: "res_stone" },
  ore: { label: "Ore", swatch: "#6f7a8e", food: false, energy: 0, frame: "res_ore" },
  copper_ore: { label: "Copper Ore", swatch: "#b66a3a", food: false, energy: 0, frame: "res_copper_ore" },
  tin_ore: { label: "Tin Ore", swatch: "#c8c4bc", food: false, energy: 0, frame: "res_tin_ore" },
  iron_ore: { label: "Iron Ore", swatch: "#6e6a64", food: false, energy: 0, frame: "res_iron_ore" },
  coal: { label: "Coal", swatch: "#2a2622", food: false, energy: 0, frame: "res_coal" },
  copper_ingot: { label: "Copper Ingot", swatch: "#d18852", food: false, energy: 0, frame: "res_copper_ingot" },
  bronze_ingot: { label: "Bronze Ingot", swatch: "#a47545", food: false, energy: 0, frame: "res_bronze_ingot" },
  iron_ingot: { label: "Iron Ingot", swatch: "#8a8c92", food: false, energy: 0, frame: "res_iron_ingot" },
  steel_ingot: { label: "Steel Ingot", swatch: "#9aa3ae", food: false, energy: 0, frame: "res_steel_ingot" },
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
  stone: { food: ["tubers"], materials: ["stone"] },
  water: { food: [], materials: [] },
};

export const RESOURCE_DENSITY: Record<Biome, number> = {
  forest: 0.06,
  grass: 0.04,
  sand: 0.025,
  stone: 0.035,
  water: 0,
};
