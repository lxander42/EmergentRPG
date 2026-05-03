import type { ResourceKind } from "@/content/resources";

export type WeaponKind = "stick" | "club" | "sling";

export type WeaponMeta = {
  label: string;
  attack: number;
  reach: number;
  durability: number;
  ranged: boolean;
  recipe: Partial<Record<ResourceKind, number>>;
  swatch: string;
};

export const WEAPONS: Record<WeaponKind, WeaponMeta> = {
  stick: {
    label: "Stick",
    attack: 1,
    reach: 1,
    durability: 8,
    ranged: false,
    recipe: { wood: 1 },
    swatch: "#8a6a4a",
  },
  club: {
    label: "Club",
    attack: 2,
    reach: 1,
    durability: 12,
    ranged: false,
    recipe: { wood: 2, stone: 1 },
    swatch: "#7a5a3a",
  },
  sling: {
    label: "Sling",
    attack: 2,
    reach: 4,
    durability: 6,
    ranged: true,
    recipe: { reed: 2, stone: 1 },
    swatch: "#a8b878",
  },
};

export const WEAPON_KINDS: WeaponKind[] = ["stick", "club", "sling"];
