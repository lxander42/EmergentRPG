// Frame manifest for the sprite atlas at public/tiles/atlas.png.
//
// Coordinates are (x, y) in source pixels. All frames are 16x16. The atlas is
// 256x48 (16 cols x 3 rows of 16-px tiles). See public/tiles/README.md for
// how to replace the placeholder atlas with Kenney Tiny Town / Tiny Dungeon.

export const ATLAS_KEY = "atlas" as const;
export const ATLAS_PATH = "/tiles/atlas.png" as const;
export const ATLAS_W = 256 as const;
export const ATLAS_H = 48 as const;
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
  // ground bases
  grass_a: F(0, 0),
  grass_b: F(1, 0),
  forest_a: F(2, 0),
  forest_b: F(3, 0),
  sand_a: F(4, 0),
  sand_b: F(5, 0),
  stone_a: F(6, 0),
  stone_b: F(7, 0),
  water_a: F(8, 0),
  water_b: F(9, 0),
  // obstacles
  tree_oak: F(10, 0),
  tree_pine: F(11, 0),
  rock_a: F(12, 0),
  rock_b: F(13, 0),
  cactus: F(14, 0),
  bush: F(15, 0),
  workbench: F(0, 1),
  // resources
  res_berry: F(1, 1),
  res_herb: F(2, 1),
  res_grain: F(3, 1),
  res_shellfish: F(4, 1),
  res_tubers: F(5, 1),
  res_wood: F(6, 1),
  res_reed: F(7, 1),
  res_stone: F(8, 1),
  res_ore: F(9, 1),
  // misc
  loot_pile: F(10, 1),
  char: F(11, 1),
} as const;

export type TileName = keyof typeof TILE_FRAMES;
