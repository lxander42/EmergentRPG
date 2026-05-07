import { RECIPES_BY_ID } from "@/content/recipes";
import type { ResourceKind } from "@/content/resources";
import type { BiomeInterior, PlacedStructure } from "@/lib/sim/biome-interior";

// Advance every in-progress smelt across every interior by one tick. When a
// smelt's elapsed catches up to its required, the ingot count is folded into
// the furnace's contents and the smelt is flagged ready for the player to
// collect. Pure — returns a new map only when something changed.
export function tickFurnaces(
  interiors: Record<string, BiomeInterior>,
): Record<string, BiomeInterior> {
  let changed = false;
  let next: Record<string, BiomeInterior> = interiors;
  for (const key of Object.keys(interiors)) {
    const interior = interiors[key];
    if (!interior) continue;
    const updatedStructures = advanceFurnaces(interior.placedStructures);
    if (updatedStructures === interior.placedStructures) continue;
    if (!changed) {
      next = { ...interiors };
      changed = true;
    }
    next[key] = { ...interior, placedStructures: updatedStructures };
  }
  return changed ? next : interiors;
}

function advanceFurnaces(structures: PlacedStructure[]): PlacedStructure[] {
  let mutated = false;
  let out: PlacedStructure[] = structures;
  for (let i = 0; i < structures.length; i++) {
    const s = structures[i];
    if (!s || s.kind !== "furnace" || !s.smelt || s.smelt.ready) continue;
    const updated = advanceFurnace(s);
    if (updated === s) continue;
    if (!mutated) {
      out = structures.slice();
      mutated = true;
    }
    out[i] = updated;
  }
  return out;
}

function advanceFurnace(s: PlacedStructure): PlacedStructure {
  const smelt = s.smelt;
  if (!smelt || smelt.ready) return s;
  const elapsed = smelt.elapsed + 1;
  if (elapsed < smelt.required) {
    return { ...s, smelt: { ...smelt, elapsed } };
  }
  const recipe = RECIPES_BY_ID[smelt.recipeId];
  if (!recipe || recipe.result.kind !== "resource") {
    return { ...s, smelt: { ...smelt, elapsed: smelt.required, ready: true } };
  }
  const outputKind = recipe.result.id as ResourceKind;
  const count = recipe.result.count;
  const items = { ...(s.contents?.items ?? {}) };
  items[outputKind] = (items[outputKind] ?? 0) + count;
  return {
    ...s,
    contents: { ...(s.contents ?? {}), items },
    smelt: { ...smelt, elapsed: smelt.required, ready: true },
  };
}
