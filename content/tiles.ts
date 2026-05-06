// Frame manifest for the sprite atlas at public/tiles/atlas.png.
//
// Coordinates are (x, y) in source pixels. All frames are 16x16. The atlas
// is 256x64 (16 cols x 4 rows of 16-px tiles). See public/tiles/README.md
// for how to replace the placeholder atlas with Kenney Tiny Town /
// Tiny Dungeon.

export const ATLAS_KEY = "atlas" as const;
export const ATLAS_PATH = "/tiles/atlas.png" as const;
export const ATLAS_W = 256 as const;
export const ATLAS_H = 64 as const;
export const TILE_PX = 16 as const;

export type FrameDef = {
  sheet: typeof ATLAS_KEY;
  x: number;
  y: number;
};

const F = (col: number, row: number): FrameDef => ({
  sheet: ATLAS_KEY,
  x: col * TILE_PX,
  y: row * TILE_PX,
});

// Keep this in lockstep with scripts/generate-tiles.mjs FRAMES order.
export const TILE_FRAMES = {
  // Row 0: ground variants — 4 per biome
  grass_a: F(0, 0),
  grass_b: F(1, 0),
  grass_c: F(2, 0),
  grass_d: F(3, 0),
  forest_a: F(4, 0),
  forest_b: F(5, 0),
  forest_c: F(6, 0),
  forest_d: F(7, 0),
  sand_a: F(8, 0),
  sand_b: F(9, 0),
  sand_c: F(10, 0),
  sand_d: F(11, 0),
  stone_a: F(12, 0),
  stone_b: F(13, 0),
  stone_c: F(14, 0),
  stone_d: F(15, 0),
  // Row 1: water variants + obstacles + first chunk of resources
  water_a: F(0, 1),
  water_b: F(1, 1),
  water_c: F(2, 1),
  water_d: F(3, 1),
  tree_oak: F(4, 1),
  tree_pine: F(5, 1),
  rock_a: F(6, 1),
  rock_b: F(7, 1),
  cactus: F(8, 1),
  bush: F(9, 1),
  workbench: F(10, 1),
  res_berry: F(11, 1),
  res_herb: F(12, 1),
  res_grain: F(13, 1),
  res_shellfish: F(14, 1),
  res_tubers: F(15, 1),
  // Row 2: remaining resources + misc
  res_wood: F(0, 2),
  res_reed: F(1, 2),
  res_stone: F(2, 2),
  res_ore: F(3, 2),
  loot_pile: F(4, 2),
  char: F(5, 2),
  ore_deposit_outer: F(6, 2),
  ore_interior_copper: F(7, 2),
  ore_interior_tin: F(8, 2),
  ore_interior_iron: F(9, 2),
  ore_interior_coal: F(10, 2),
  res_copper_ore: F(11, 2),
  res_tin_ore: F(12, 2),
  res_iron_ore: F(13, 2),
  res_coal: F(14, 2),
} as const;

export type TileName = keyof typeof TILE_FRAMES;
