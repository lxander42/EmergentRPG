import type { ResourceKind } from "@/content/resources";
import type { WeaponKind } from "@/content/weapons";
import type { ToolKind } from "@/lib/sim/tools";

export type RecipeStation = "hand" | "workbench";

export type StructureKind = "workbench";

export type RecipeResult =
  | { kind: "weapon"; id: WeaponKind }
  | { kind: "tool"; id: ToolKind }
  | { kind: "structure"; id: StructureKind };

export type Recipe = {
  id: string;
  name: string;
  result: RecipeResult;
  inputs: Partial<Record<ResourceKind, number>>;
  time: number;
  station: RecipeStation;
};

export const RECIPES: Recipe[] = [
  {
    id: "stick",
    name: "Stick",
    result: { kind: "weapon", id: "stick" },
    inputs: { wood: 1 },
    time: 0,
    station: "hand",
  },
  {
    id: "club",
    name: "Club",
    result: { kind: "weapon", id: "club" },
    inputs: { wood: 2, stone: 1 },
    time: 0,
    station: "hand",
  },
  {
    id: "sling",
    name: "Sling",
    result: { kind: "weapon", id: "sling" },
    inputs: { reed: 2, stone: 1 },
    time: 0,
    station: "hand",
  },
  {
    id: "workbench",
    name: "Workbench",
    result: { kind: "structure", id: "workbench" },
    inputs: { wood: 4, stone: 2 },
    time: 5,
    station: "hand",
  },
  {
    id: "axe",
    name: "Axe",
    result: { kind: "tool", id: "axe" },
    inputs: { wood: 2, stone: 1 },
    time: 4,
    station: "workbench",
  },
  {
    id: "pickaxe",
    name: "Pickaxe",
    result: { kind: "tool", id: "pickaxe" },
    inputs: { wood: 1, stone: 2 },
    time: 4,
    station: "workbench",
  },
  {
    id: "basket",
    name: "Basket",
    result: { kind: "tool", id: "basket" },
    inputs: { reed: 3 },
    time: 3,
    station: "workbench",
  },
  {
    id: "torch",
    name: "Torch",
    result: { kind: "tool", id: "torch" },
    inputs: { wood: 1, herb: 1 },
    time: 2,
    station: "workbench",
  },
  {
    id: "sword",
    name: "Sword",
    result: { kind: "weapon", id: "sword" },
    inputs: { wood: 2, ore: 3 },
    time: 6,
    station: "workbench",
  },
  {
    id: "bow",
    name: "Bow",
    result: { kind: "weapon", id: "bow" },
    inputs: { wood: 3, reed: 2 },
    time: 5,
    station: "workbench",
  },
];

export const RECIPES_BY_ID: Record<string, Recipe> = {};
for (const r of RECIPES) RECIPES_BY_ID[r.id] = r;

export function recipeForStructure(kind: StructureKind): Recipe | null {
  for (const r of RECIPES) {
    if (r.result.kind === "structure" && r.result.id === kind) return r;
  }
  return null;
}
