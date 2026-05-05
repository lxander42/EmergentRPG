import type { Biome } from "@/lib/sim/biome";
import type { TileName } from "@/content/tiles";

export type BiomeMeta = {
  title: string;
  blurb: string;
  passable: boolean;
  // Hex string for the swatch in the panel; mirrors the WorldScene palette.
  swatch: string;
  // Ground-tile variants used by BiomeScene's chunked renderer. Pick is
  // deterministic per (gx, gy) so adjacent tiles don't repeat in stripes.
  variants: readonly TileName[];
};

export const BIOMES: Record<Biome, BiomeMeta> = {
  grass: {
    title: "Grassland",
    blurb: "Open country. Easy footing, sparse cover, the wind always finds you.",
    passable: true,
    swatch: "#cfd9aa",
    variants: ["grass_a", "grass_b"],
  },
  forest: {
    title: "Forest",
    blurb: "Dense woodland. Slow to cross, full of sound, easy to lose someone in.",
    passable: true,
    swatch: "#8fa873",
    variants: ["forest_a", "forest_b"],
  },
  water: {
    title: "Open Water",
    blurb: "Lake or sea. No road across without a boat -- people go around.",
    passable: false,
    swatch: "#a8c8d8",
    variants: ["water_a", "water_b"],
  },
  sand: {
    title: "Sands",
    blurb: "Soft, pale grit. Footprints linger here longer than anywhere else.",
    passable: true,
    swatch: "#e8d8b0",
    variants: ["sand_a", "sand_b"],
  },
  stone: {
    title: "Highlands",
    blurb: "Rocky upland. Cold wind, thin soil, and a longer view than most.",
    passable: true,
    swatch: "#b8b0a0",
    variants: ["stone_a", "stone_b"],
  },
};
