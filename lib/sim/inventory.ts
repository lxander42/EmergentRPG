import type { ResourceKind } from "@/content/resources";

export type Inventory = Partial<Record<ResourceKind, number>>;

export const BASE_INVENTORY_CAP = 20;
export const PER_BASKET_BONUS = 20;
export const MAX_INVENTORY_CAP = 80;

export function inventoryTotal(inv: Inventory): number {
  let total = 0;
  for (const k of Object.keys(inv) as ResourceKind[]) {
    total += inv[k] ?? 0;
  }
  return total;
}

export function inventoryCapFromBaskets(baskets: number): number {
  return Math.min(MAX_INVENTORY_CAP, BASE_INVENTORY_CAP + PER_BASKET_BONUS * baskets);
}

export function addToInventory(
  inv: Inventory,
  kind: ResourceKind,
  amount: number,
  cap: number,
): { inv: Inventory; added: number } {
  if (amount <= 0) return { inv, added: 0 };
  const total = inventoryTotal(inv);
  const remaining = Math.max(0, cap - total);
  const added = Math.min(amount, remaining);
  if (added <= 0) return { inv, added: 0 };
  return { inv: { ...inv, [kind]: (inv[kind] ?? 0) + added }, added };
}
