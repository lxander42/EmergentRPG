// Procedural pixel-art atlas generator for EmergentRPG.
//
// Phase 7 plan was to commit Kenney's CC0 Tiny Town + Tiny Dungeon sheets, but
// the asset CDNs are unreachable from the build sandbox. This script bakes a
// stand-in atlas at the same logical layout (16-px tiles, named frames) using
// the existing biome/resource swatch palette so the sprite pipeline lands now
// and the visuals stay in family. Drop the real Kenney PNGs into
// public/tiles/atlas.png to upgrade — the manifest is the only contract.
//
// Run with: node scripts/generate-tiles.mjs

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, "..", "public", "tiles", "atlas.png");

const TILE = 16;
const COLS = 16;
const ROWS = 3;
const W = COLS * TILE;
const H = ROWS * TILE;

const buf = Buffer.alloc(W * H * 4);

function px(x, y, r, g, b, a = 255) {
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  const i = (y * W + x) * 4;
  buf[i] = r;
  buf[i + 1] = g;
  buf[i + 2] = b;
  buf[i + 3] = a;
}

function hex(s) {
  const v = parseInt(s.replace("#", ""), 16);
  return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
}

function shade([r, g, b], t) {
  const target = t < 0 ? [0, 0, 0] : [255, 255, 255];
  const k = Math.abs(t);
  return [
    Math.round(r + (target[0] - r) * k),
    Math.round(g + (target[1] - g) * k),
    Math.round(b + (target[2] - b) * k),
  ];
}

function tile(col, row, draw) {
  const ox = col * TILE;
  const oy = row * TILE;
  draw((x, y, c, a = 255) => {
    if (x < 0 || x >= TILE || y < 0 || y >= TILE) return;
    px(ox + x, oy + y, c[0], c[1], c[2], a);
  });
}

function fill(set, c) {
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) set(x, y, c);
  }
}

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function speckle(set, base, dark, light, density, seed) {
  const r = rng(seed);
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const v = r();
      if (v < density * 0.5) set(x, y, dark);
      else if (v < density) set(x, y, light);
      else set(x, y, base);
    }
  }
}

const PAL = {
  grass: hex("#cfd9aa"),
  forest: hex("#8fa873"),
  water: hex("#a8c8d8"),
  sand: hex("#e8d8b0"),
  stone: hex("#b8b0a0"),
  trunk: hex("#6e5238"),
  leaves: hex("#4f6a3e"),
  rock: hex("#8a8378"),
  rockShade: hex("#67625a"),
  cactus: hex("#7e9b6a"),
  bush: hex("#86a06d"),
  workbench: hex("#d96846"),
  workbenchLeg: hex("#7a3d28"),
  loot: hex("#c0a878"),
  fg: hex("#2c2820"),
  body: hex("#ffffff"),
  outline: hex("#2c2820"),
  // resources
  berry: hex("#b85b6e"),
  herb: hex("#7aa05c"),
  grain: hex("#d8b66a"),
  shellfish: hex("#e8c8b0"),
  tubers: hex("#a88660"),
  wood: hex("#8a6a4a"),
  reed: hex("#a8b878"),
  stoneRes: hex("#9c9588"),
  ore: hex("#6f7a8e"),
};

// ---- ground tiles ----------------------------------------------------------

function grassA(set) {
  speckle(set, PAL.grass, shade(PAL.grass, -0.18), shade(PAL.grass, 0.12), 0.18, 11);
}
function grassB(set) {
  speckle(set, PAL.grass, shade(PAL.grass, -0.22), shade(PAL.grass, 0.08), 0.16, 23);
  // a tiny tuft
  set(4, 9, shade(PAL.grass, -0.3));
  set(5, 8, shade(PAL.grass, -0.3));
  set(11, 11, shade(PAL.grass, -0.3));
}
function forestA(set) {
  speckle(set, PAL.forest, shade(PAL.forest, -0.22), shade(PAL.forest, 0.08), 0.22, 31);
}
function forestB(set) {
  speckle(set, PAL.forest, shade(PAL.forest, -0.18), shade(PAL.forest, 0.1), 0.18, 47);
}
function sandA(set) {
  speckle(set, PAL.sand, shade(PAL.sand, -0.12), shade(PAL.sand, 0.1), 0.12, 53);
}
function sandB(set) {
  speckle(set, PAL.sand, shade(PAL.sand, -0.16), shade(PAL.sand, 0.08), 0.14, 67);
  set(3, 4, shade(PAL.sand, -0.25));
  set(11, 12, shade(PAL.sand, -0.25));
}
function stoneA(set) {
  speckle(set, PAL.stone, shade(PAL.stone, -0.18), shade(PAL.stone, 0.1), 0.2, 73);
}
function stoneB(set) {
  speckle(set, PAL.stone, shade(PAL.stone, -0.22), shade(PAL.stone, 0.06), 0.18, 89);
  // pebble
  for (let y = 6; y <= 8; y++) for (let x = 5; x <= 8; x++) set(x, y, shade(PAL.stone, -0.18));
  set(5, 6, shade(PAL.stone, -0.3));
  set(8, 8, shade(PAL.stone, -0.3));
}
function waterA(set) {
  fill(set, PAL.water);
  // gentle wave dashes
  const r = rng(101);
  for (let y = 0; y < TILE; y += 4) {
    let x = Math.floor(r() * 8);
    while (x < TILE) {
      set(x, y, shade(PAL.water, 0.18));
      set(x + 1, y, shade(PAL.water, 0.18));
      x += 5 + Math.floor(r() * 3);
    }
  }
}
function waterB(set) {
  fill(set, PAL.water);
  const r = rng(103);
  for (let y = 2; y < TILE; y += 4) {
    let x = Math.floor(r() * 8);
    while (x < TILE) {
      set(x, y, shade(PAL.water, -0.12));
      x += 4 + Math.floor(r() * 3);
    }
  }
}

// ---- obstacles -------------------------------------------------------------
//
// Obstacles draw onto a transparent tile, then the renderer composes them
// over the ground sprite. Anchor point is centre-bottom (origin 0.5, 0.85).

function tree(set) {
  // trunk
  for (let y = 11; y <= 14; y++) for (let x = 7; x <= 8; x++) set(x, y, PAL.trunk);
  // canopy: rough triangle of foliage
  const canopy = [
    [7, 1], [8, 1],
    [6, 2], [7, 2], [8, 2], [9, 2],
    [5, 3], [6, 3], [7, 3], [8, 3], [9, 3], [10, 3],
    [4, 4], [5, 4], [6, 4], [7, 4], [8, 4], [9, 4], [10, 4], [11, 4],
    [4, 5], [5, 5], [6, 5], [7, 5], [8, 5], [9, 5], [10, 5], [11, 5],
    [3, 6], [4, 6], [5, 6], [6, 6], [7, 6], [8, 6], [9, 6], [10, 6], [11, 6], [12, 6],
    [3, 7], [4, 7], [5, 7], [6, 7], [7, 7], [8, 7], [9, 7], [10, 7], [11, 7], [12, 7],
    [4, 8], [5, 8], [6, 8], [7, 8], [8, 8], [9, 8], [10, 8], [11, 8],
    [5, 9], [6, 9], [7, 9], [8, 9], [9, 9], [10, 9],
    [6, 10], [7, 10], [8, 10], [9, 10],
  ];
  for (const [x, y] of canopy) set(x, y, PAL.leaves);
  // highlight
  set(6, 4, shade(PAL.leaves, 0.18));
  set(7, 3, shade(PAL.leaves, 0.18));
  set(8, 4, shade(PAL.leaves, 0.18));
  set(5, 6, shade(PAL.leaves, 0.18));
  // shadow under trunk
  set(7, 15, [0, 0, 0, 70]);
}

function pine(set) {
  // narrow pine: trunk + stacked triangles
  for (let y = 12; y <= 14; y++) for (let x = 7; x <= 8; x++) set(x, y, PAL.trunk);
  const tri = [
    [7, 1], [8, 1],
    [6, 2], [7, 2], [8, 2], [9, 2],
    [5, 3], [6, 3], [7, 3], [8, 3], [9, 3], [10, 3],
    [6, 5], [7, 5], [8, 5], [9, 5],
    [5, 6], [6, 6], [7, 6], [8, 6], [9, 6], [10, 6],
    [4, 7], [5, 7], [6, 7], [7, 7], [8, 7], [9, 7], [10, 7], [11, 7],
    [6, 9], [7, 9], [8, 9], [9, 9],
    [5, 10], [6, 10], [7, 10], [8, 10], [9, 10], [10, 10],
    [4, 11], [5, 11], [6, 11], [7, 11], [8, 11], [9, 11], [10, 11], [11, 11],
  ];
  for (const [x, y] of tri) set(x, y, shade(PAL.leaves, -0.08));
  set(7, 1, shade(PAL.leaves, 0.2));
}

function rock(set) {
  const body = [
    [4, 9], [5, 9], [6, 9], [7, 9], [8, 9], [9, 9], [10, 9], [11, 9],
    [3, 10], [4, 10], [5, 10], [6, 10], [7, 10], [8, 10], [9, 10], [10, 10], [11, 10], [12, 10],
    [3, 11], [4, 11], [5, 11], [6, 11], [7, 11], [8, 11], [9, 11], [10, 11], [11, 11], [12, 11],
    [4, 12], [5, 12], [6, 12], [7, 12], [8, 12], [9, 12], [10, 12], [11, 12],
    [5, 8], [6, 8], [7, 8], [8, 8], [9, 8], [10, 8],
    [6, 7], [7, 7], [8, 7], [9, 7],
    [7, 6], [8, 6],
  ];
  for (const [x, y] of body) set(x, y, PAL.rock);
  // shade slice
  for (const [x, y] of [
    [3, 11], [4, 11], [4, 12], [5, 12], [3, 10], [4, 10], [5, 10], [6, 11],
  ]) set(x, y, PAL.rockShade);
  // shadow under
  set(5, 13, [0, 0, 0, 70]);
  set(6, 13, [0, 0, 0, 70]);
  set(9, 13, [0, 0, 0, 70]);
  set(10, 13, [0, 0, 0, 70]);
}

function rock2(set) {
  // smaller cluster
  const body = [
    [5, 10], [6, 10], [7, 10], [8, 10], [9, 10], [10, 10],
    [4, 11], [5, 11], [6, 11], [7, 11], [8, 11], [9, 11], [10, 11], [11, 11],
    [5, 12], [6, 12], [7, 12], [8, 12], [9, 12], [10, 12],
    [6, 9], [7, 9], [8, 9], [9, 9],
    [7, 8], [8, 8],
  ];
  for (const [x, y] of body) set(x, y, PAL.rock);
  for (const [x, y] of [[4, 11], [5, 11], [5, 12], [6, 12]])
    set(x, y, PAL.rockShade);
}

function cactus(set) {
  // central column
  for (let y = 3; y <= 13; y++) {
    set(7, y, PAL.cactus);
    set(8, y, PAL.cactus);
  }
  // arms
  for (let y = 6; y <= 9; y++) {
    set(5, y, PAL.cactus);
    set(10, y, PAL.cactus);
  }
  set(5, 5, PAL.cactus);
  set(10, 5, PAL.cactus);
  // top rounded
  set(7, 2, PAL.cactus);
  set(8, 2, PAL.cactus);
  // highlight ribs
  for (let y = 4; y <= 12; y += 2) set(7, y, shade(PAL.cactus, 0.18));
  set(5, 8, shade(PAL.cactus, 0.18));
  set(10, 8, shade(PAL.cactus, 0.18));
}

function bush(set) {
  const body = [
    [5, 6], [6, 6], [7, 6], [8, 6], [9, 6], [10, 6],
    [4, 7], [5, 7], [6, 7], [7, 7], [8, 7], [9, 7], [10, 7], [11, 7],
    [4, 8], [5, 8], [6, 8], [7, 8], [8, 8], [9, 8], [10, 8], [11, 8],
    [4, 9], [5, 9], [6, 9], [7, 9], [8, 9], [9, 9], [10, 9], [11, 9],
    [5, 10], [6, 10], [7, 10], [8, 10], [9, 10], [10, 10],
    [6, 11], [7, 11], [8, 11], [9, 11],
  ];
  for (const [x, y] of body) set(x, y, PAL.bush);
  for (const [x, y] of [[5, 7], [7, 6], [9, 7], [6, 9]])
    set(x, y, shade(PAL.bush, 0.18));
  // shadow
  for (const x of [6, 7, 8, 9]) set(x, 12, [0, 0, 0, 60]);
}

function workbench(set) {
  // legs
  for (let y = 9; y <= 12; y++) {
    set(4, y, PAL.workbenchLeg);
    set(11, y, PAL.workbenchLeg);
  }
  // top
  for (let y = 6; y <= 8; y++) {
    for (let x = 3; x <= 12; x++) set(x, y, PAL.workbench);
  }
  // top edge highlight
  for (let x = 3; x <= 12; x++) set(x, 6, shade(PAL.workbench, 0.18));
  // accent strip
  for (let x = 4; x <= 11; x++) set(x, 9, shade(PAL.workbench, -0.25));
  // shadow
  for (let x = 4; x <= 11; x++) set(x, 13, [0, 0, 0, 60]);
}

// ---- resources -------------------------------------------------------------

function berry(set) {
  // three berries on a branch
  for (const [cx, cy] of [[6, 8], [10, 8], [8, 6]]) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (Math.abs(dx) + Math.abs(dy) > 1) continue;
        set(cx + dx, cy + dy, PAL.berry);
      }
    }
    set(cx - 1, cy - 1, shade(PAL.berry, 0.3));
  }
  // tiny stem
  set(8, 5, PAL.trunk);
}

function herb(set) {
  // leaf shape
  for (const [x, y] of [
    [7, 4], [8, 4],
    [6, 5], [7, 5], [8, 5], [9, 5],
    [5, 6], [6, 6], [7, 6], [8, 6], [9, 6], [10, 6],
    [5, 7], [6, 7], [7, 7], [8, 7], [9, 7], [10, 7],
    [6, 8], [7, 8], [8, 8], [9, 8],
    [7, 9], [8, 9],
    [7, 10], [8, 10],
    [7, 11], [8, 11],
  ]) set(x, y, PAL.herb);
  for (const [x, y] of [[7, 4], [6, 6]]) set(x, y, shade(PAL.herb, 0.25));
  // stem
  set(7, 12, PAL.trunk);
  set(8, 12, PAL.trunk);
}

function grain(set) {
  // three stalks with kernels
  for (const cx of [5, 8, 11]) {
    for (let y = 5; y <= 11; y++) set(cx, y, shade(PAL.grain, -0.35));
    for (const dy of [3, 5, 7]) {
      set(cx - 1, dy, PAL.grain);
      set(cx, dy, PAL.grain);
      set(cx + 1, dy, PAL.grain);
    }
    set(cx, 2, shade(PAL.grain, 0.2));
  }
}

function shellfish(set) {
  // dome with ridges
  const dome = [
    [6, 9], [7, 9], [8, 9], [9, 9],
    [5, 8], [6, 8], [7, 8], [8, 8], [9, 8], [10, 8],
    [4, 7], [5, 7], [6, 7], [7, 7], [8, 7], [9, 7], [10, 7], [11, 7],
    [5, 6], [6, 6], [7, 6], [8, 6], [9, 6], [10, 6],
    [6, 5], [7, 5], [8, 5], [9, 5],
  ];
  for (const [x, y] of dome) set(x, y, PAL.shellfish);
  // ridges
  for (const y of [6, 7, 8]) {
    set(7, y, shade(PAL.shellfish, -0.2));
    set(9, y, shade(PAL.shellfish, -0.2));
  }
  // base line
  for (let x = 4; x <= 11; x++) set(x, 10, shade(PAL.shellfish, -0.3));
}

function tubers(set) {
  // two roots
  for (const [cx, cy, w, h] of [[6, 8, 3, 4], [10, 9, 2, 3]]) {
    for (let dy = -h; dy <= h; dy++) {
      for (let dx = -w; dx <= w; dx++) {
        if (dx * dx * h * h + dy * dy * w * w > w * w * h * h) continue;
        set(cx + dx, cy + dy, PAL.tubers);
      }
    }
  }
  // stems / leaves
  set(6, 3, PAL.herb);
  set(6, 4, PAL.herb);
  set(10, 5, PAL.herb);
  set(10, 6, PAL.herb);
  // dimples
  set(5, 8, shade(PAL.tubers, -0.3));
  set(11, 9, shade(PAL.tubers, -0.3));
}

function wood(set) {
  // two log ends stacked
  const log = (cy) => {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        if (dx * dx * 4 + dy * dy * 9 > 36) continue;
        set(8 + dx, cy + dy, PAL.wood);
      }
    }
    // ring
    for (let r = 0; r < 6; r++) {
      const a = (r / 6) * Math.PI * 2;
      set(8 + Math.round(Math.cos(a) * 1.5), cy + Math.round(Math.sin(a) * 0.8),
        shade(PAL.wood, -0.3));
    }
    set(8, cy, shade(PAL.wood, -0.3));
  };
  log(7);
  log(11);
}

function reed(set) {
  for (const cx of [5, 8, 11]) {
    for (let y = 4; y <= 12; y++) set(cx, y, PAL.reed);
    set(cx, 3, shade(PAL.reed, 0.2));
    set(cx + 1, 6, PAL.reed);
    set(cx - 1, 8, PAL.reed);
  }
}

function stoneRes(set) {
  // pile of pebbles
  const pebbles = [
    [4, 8], [5, 8], [6, 8],
    [7, 9], [8, 9], [9, 9],
    [10, 8], [11, 8],
    [5, 10], [6, 10], [7, 10], [8, 10], [9, 10], [10, 10],
    [3, 11], [4, 11], [5, 11], [6, 11], [7, 11], [8, 11], [9, 11], [10, 11], [11, 11], [12, 11],
  ];
  for (const [x, y] of pebbles) set(x, y, PAL.stoneRes);
  for (const [x, y] of [[4, 8], [7, 9], [10, 8], [5, 10]])
    set(x, y, shade(PAL.stoneRes, 0.2));
  for (const [x, y] of [[5, 11], [9, 11]]) set(x, y, shade(PAL.stoneRes, -0.3));
}

function ore(set) {
  // diamond crystal
  const body = [
    [8, 3],
    [7, 4], [8, 4], [9, 4],
    [6, 5], [7, 5], [8, 5], [9, 5], [10, 5],
    [5, 6], [6, 6], [7, 6], [8, 6], [9, 6], [10, 6], [11, 6],
    [5, 7], [6, 7], [7, 7], [8, 7], [9, 7], [10, 7], [11, 7],
    [6, 8], [7, 8], [8, 8], [9, 8], [10, 8],
    [6, 9], [7, 9], [8, 9], [9, 9], [10, 9],
    [7, 10], [8, 10], [9, 10],
    [8, 11],
  ];
  for (const [x, y] of body) set(x, y, PAL.ore);
  // facet highlight
  for (const [x, y] of [[7, 5], [8, 4], [6, 7], [7, 8]])
    set(x, y, shade(PAL.ore, 0.35));
  // facet shade
  for (const [x, y] of [[10, 7], [10, 8], [9, 9], [9, 10]])
    set(x, y, shade(PAL.ore, -0.3));
}

function lootPile(set) {
  // loose bundle on ground
  for (const [x, y, c] of [
    [5, 11, PAL.loot],
    [6, 11, PAL.loot],
    [7, 11, PAL.loot],
    [8, 11, PAL.loot],
    [9, 11, PAL.loot],
    [10, 11, PAL.loot],
    [4, 12, PAL.loot],
    [5, 12, shade(PAL.loot, -0.2)],
    [6, 12, PAL.loot],
    [7, 12, PAL.loot],
    [8, 12, PAL.loot],
    [9, 12, PAL.loot],
    [10, 12, shade(PAL.loot, -0.2)],
    [11, 12, PAL.loot],
    [5, 13, shade(PAL.loot, -0.3)],
    [6, 13, shade(PAL.loot, -0.3)],
    [9, 13, shade(PAL.loot, -0.3)],
    [10, 13, shade(PAL.loot, -0.3)],
    [6, 10, shade(PAL.loot, 0.2)],
    [9, 10, shade(PAL.loot, 0.2)],
  ]) set(x, y, c);
}

function character(set) {
  // 16x16 humanoid silhouette in solid white. Renderer applies setTint() to
  // colour by faction or accent. Outline kept dark so the tinted body still
  // reads against any biome ground.
  const O = PAL.outline;
  const B = PAL.body;
  // head
  for (const [x, y] of [
    [6, 2], [7, 2], [8, 2], [9, 2],
    [5, 3], [6, 3], [7, 3], [8, 3], [9, 3], [10, 3],
    [5, 4], [6, 4], [7, 4], [8, 4], [9, 4], [10, 4],
    [5, 5], [6, 5], [7, 5], [8, 5], [9, 5], [10, 5],
    [6, 6], [7, 6], [8, 6], [9, 6],
  ]) set(x, y, B);
  // outline around head
  for (const [x, y] of [
    [6, 1], [7, 1], [8, 1], [9, 1],
    [5, 2], [10, 2],
    [4, 3], [11, 3],
    [4, 4], [11, 4],
    [4, 5], [11, 5],
    [5, 6], [10, 6],
    [6, 7], [9, 7],
  ]) set(x, y, O);
  // body
  for (const [x, y] of [
    [5, 7], [6, 7], [7, 7], [8, 7], [9, 7], [10, 7],
    [4, 8], [5, 8], [6, 8], [7, 8], [8, 8], [9, 8], [10, 8], [11, 8],
    [4, 9], [5, 9], [6, 9], [7, 9], [8, 9], [9, 9], [10, 9], [11, 9],
    [4, 10], [5, 10], [6, 10], [7, 10], [8, 10], [9, 10], [10, 10], [11, 10],
    [5, 11], [6, 11], [7, 11], [8, 11], [9, 11], [10, 11],
    [5, 12], [6, 12], [7, 12], [8, 12], [9, 12], [10, 12],
  ]) set(x, y, B);
  // body outline
  for (const [x, y] of [
    [4, 7], [11, 7],
    [3, 8], [12, 8],
    [3, 9], [12, 9],
    [3, 10], [12, 10],
    [4, 11], [11, 11],
    [4, 12], [11, 12],
    [5, 13], [6, 13], [7, 13], [8, 13], [9, 13], [10, 13],
  ]) set(x, y, O);
  // feet
  for (const [x, y] of [
    [5, 14], [6, 14], [9, 14], [10, 14],
  ]) set(x, y, B);
  for (const [x, y] of [
    [4, 14], [7, 14], [8, 14], [11, 14],
    [5, 15], [6, 15], [9, 15], [10, 15],
  ]) set(x, y, O);
  // shadow under feet
  for (const x of [4, 5, 6, 7, 8, 9, 10, 11]) set(x, 15, [0, 0, 0, 90]);
}

// ---- atlas layout ----------------------------------------------------------
//
// Frame index = row * COLS + col. Keep this in sync with content/tiles.ts.

const FRAMES = [
  // Row 0: ground bases (10) + obstacles (6)
  ["grass_a", grassA],
  ["grass_b", grassB],
  ["forest_a", forestA],
  ["forest_b", forestB],
  ["sand_a", sandA],
  ["sand_b", sandB],
  ["stone_a", stoneA],
  ["stone_b", stoneB],
  ["water_a", waterA],
  ["water_b", waterB],
  ["tree_oak", tree],
  ["tree_pine", pine],
  ["rock_a", rock],
  ["rock_b", rock2],
  ["cactus", cactus],
  ["bush", bush],
  // Row 1: workbench, resources (9), loot, character, padding
  ["workbench", workbench],
  ["res_berry", berry],
  ["res_herb", herb],
  ["res_grain", grain],
  ["res_shellfish", shellfish],
  ["res_tubers", tubers],
  ["res_wood", wood],
  ["res_reed", reed],
  ["res_stone", stoneRes],
  ["res_ore", ore],
  ["loot_pile", lootPile],
  ["char", character],
];

for (let i = 0; i < FRAMES.length; i++) {
  const [, draw] = FRAMES[i];
  const col = i % COLS;
  const row = Math.floor(i / COLS);
  tile(col, row, draw);
}

await sharp(buf, { raw: { width: W, height: H, channels: 4 } })
  .png({ compressionLevel: 9 })
  .toFile(OUT);

console.log(`wrote ${OUT} (${W}x${H}, ${FRAMES.length} frames)`);
console.log("frames:");
for (let i = 0; i < FRAMES.length; i++) {
  const [name] = FRAMES[i];
  const col = i % COLS;
  const row = Math.floor(i / COLS);
  console.log(`  ${name.padEnd(14)} col=${col} row=${row} px=(${col * TILE}, ${row * TILE})`);
}
