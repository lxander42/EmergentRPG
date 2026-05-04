export type WeaponKind = "stick" | "club" | "sling" | "sword" | "bow";

export type WeaponMeta = {
  label: string;
  attack: number;
  reach: number;
  durability: number;
  ranged: boolean;
  swatch: string;
};

export const WEAPONS: Record<WeaponKind, WeaponMeta> = {
  stick: {
    label: "Stick",
    attack: 1,
    reach: 1,
    durability: 8,
    ranged: false,
    swatch: "#8a6a4a",
  },
  club: {
    label: "Club",
    attack: 2,
    reach: 1,
    durability: 12,
    ranged: false,
    swatch: "#7a5a3a",
  },
  sling: {
    label: "Sling",
    attack: 2,
    reach: 4,
    durability: 6,
    ranged: true,
    swatch: "#a8b878",
  },
  sword: {
    label: "Sword",
    attack: 3,
    reach: 1,
    durability: 30,
    ranged: false,
    swatch: "#9aa4b6",
  },
  bow: {
    label: "Bow",
    attack: 2,
    reach: 5,
    durability: 25,
    ranged: true,
    swatch: "#b48c5e",
  },
};

export const WEAPON_KINDS: WeaponKind[] = ["stick", "club", "sling", "sword", "bow"];
