import type { Inventory } from "@/lib/sim/inventory";
import { WEAPONS, type WeaponKind } from "@/content/weapons";
import type { Recipe } from "@/content/recipes";
import type { ResourceKind } from "@/content/resources";

export type WeaponInstance = {
  kind: WeaponKind;
  usesLeft: number;
};

export function affordable(inventory: Inventory, recipe: Recipe): boolean {
  for (const k of Object.keys(recipe.inputs) as ResourceKind[]) {
    const need = recipe.inputs[k] ?? 0;
    const have = inventory[k] ?? 0;
    if (have < need) return false;
  }
  return true;
}

export function spendRecipe(inventory: Inventory, recipe: Recipe): Inventory | null {
  if (!affordable(inventory, recipe)) return null;
  const next: Inventory = { ...inventory };
  for (const k of Object.keys(recipe.inputs) as ResourceKind[]) {
    const need = recipe.inputs[k] ?? 0;
    const have = next[k] ?? 0;
    next[k] = have - need;
  }
  return next;
}

export function makeWeapon(kind: WeaponKind): WeaponInstance {
  return { kind, usesLeft: WEAPONS[kind].durability };
}

// Pick the highest-attack weapon whose reach covers `distance`. Returns null
// if no weapon (caller should fall back to bare hands).
export function pickWeaponForRange(
  weapons: WeaponInstance[],
  distance: number,
): WeaponInstance | null {
  let best: WeaponInstance | null = null;
  let bestAttack = -1;
  for (const w of weapons) {
    if (w.usesLeft <= 0) continue;
    const meta = WEAPONS[w.kind];
    if (meta.reach < distance) continue;
    if (meta.attack > bestAttack) {
      best = w;
      bestAttack = meta.attack;
    }
  }
  return best;
}

export function consumeUse(
  weapons: WeaponInstance[],
  kind: WeaponKind,
): WeaponInstance[] {
  let consumed = false;
  const out: WeaponInstance[] = [];
  for (const w of weapons) {
    if (!consumed && w.kind === kind && w.usesLeft > 0) {
      consumed = true;
      const next = w.usesLeft - 1;
      if (next > 0) out.push({ kind: w.kind, usesLeft: next });
      continue;
    }
    out.push(w);
  }
  return out;
}

export function weaponAttackBonus(weapon: WeaponInstance | null): number {
  return weapon ? WEAPONS[weapon.kind].attack : 0;
}

export function weaponReach(weapon: WeaponInstance | null): number {
  return weapon ? WEAPONS[weapon.kind].reach : 1;
}
