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
const ROWS = 4;
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

// Same as speckle but mirrored across both axes so the variant looks like a
// distinct hand-drawn tile rather than a re-seed of the base. Useful when we
// want 4 variants per biome without doubling sprite work.
function speckleMirror(set, base, dark, light, density, seed) {
  const r = rng(seed);
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const v = r();
      const tx = TILE - 1 - x;
      const ty = TILE - 1 - y;
      if (v < density * 0.5) set(tx, ty, dark);
      else if (v < density) set(tx, ty, light);
      else set(tx, ty, base);
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
  haloLight: hex("#fbf6ed"),
  haloDark: hex("#2c2820"),
  // resources tuned so each pops on grass / forest / sand / stone:
  // - herb shifted toward sage so it stops blending into forest green.
  // - grain warmer.
  // - stone resource cooler than the highlands ground.
  berry: hex("#c4516a"),
  herb: hex("#5fbf73"),
  herbDark: hex("#2f5e3a"),
  grain: hex("#e0b95a"),
  shellfish: hex("#f0c9a8"),
  tubers: hex("#a37150"),
  wood: hex("#8c6a44"),
  reed: hex("#9bbe6c"),
  stoneRes: hex("#7e7c78"),
  ore: hex("#5e6e88"),
  // ore deposit tiers — exterior is the same neutral rock palette as the
  // single-cell rock; tier tints only show on interior (fully-enclosed) cells.
  depositOuter: hex("#7a7368"),
  depositOuterShade: hex("#564f48"),
  depositOuterHi: hex("#9a9388"),
  copperTier: hex("#b66a3a"),
  tinTier: hex("#c8c4bc"),
  ironTier: hex("#6e6a64"),
  coalTier: hex("#2a2622"),
};

// ---- ground tiles ----------------------------------------------------------
//
// Four variants per biome (a/b/c/d). a/b stay near the original baked
// look; c/d add slightly different speckle density + a small glyph so the
// 4-way deterministic variant pick visibly breaks the old checkerboard.

function grassA(set) {
  speckle(set, PAL.grass, shade(PAL.grass, -0.18), shade(PAL.grass, 0.12), 0.18, 11);
}
function grassB(set) {
  speckle(set, PAL.grass, shade(PAL.grass, -0.22), shade(PAL.grass, 0.08), 0.16, 23);
  set(4, 9, shade(PAL.grass, -0.3));
  set(5, 8, shade(PAL.grass, -0.3));
  set(11, 11, shade(PAL.grass, -0.3));
}
function grassC(set) {
  speckleMirror(set, PAL.grass, shade(PAL.grass, -0.2), shade(PAL.grass, 0.1), 0.14, 47);
  // small flower
  set(8, 6, shade(PAL.berry, 0.2));
  set(8, 7, PAL.grain);
}
function grassD(set) {
  speckle(set, PAL.grass, shade(PAL.grass, -0.16), shade(PAL.grass, 0.12), 0.2, 89);
  // sparse tuft
  set(3, 4, shade(PAL.forest, -0.15));
  set(4, 3, shade(PAL.forest, -0.15));
  set(12, 13, shade(PAL.forest, -0.15));
}

function forestA(set) {
  speckle(set, PAL.forest, shade(PAL.forest, -0.22), shade(PAL.forest, 0.08), 0.22, 31);
}
function forestB(set) {
  speckle(set, PAL.forest, shade(PAL.forest, -0.18), shade(PAL.forest, 0.1), 0.18, 47);
}
function forestC(set) {
  speckleMirror(set, PAL.forest, shade(PAL.forest, -0.25), shade(PAL.forest, 0.06), 0.2, 59);
  // tiny twig
  set(5, 11, PAL.trunk);
  set(6, 11, PAL.trunk);
  set(7, 10, PAL.trunk);
}
function forestD(set) {
  speckle(set, PAL.forest, shade(PAL.forest, -0.2), shade(PAL.forest, 0.14), 0.16, 71);
  // moss patch
  set(11, 4, shade(PAL.forest, 0.22));
  set(12, 4, shade(PAL.forest, 0.22));
  set(11, 5, shade(PAL.forest, 0.18));
}

function sandA(set) {
  speckle(set, PAL.sand, shade(PAL.sand, -0.12), shade(PAL.sand, 0.1), 0.12, 53);
}
function sandB(set) {
  speckle(set, PAL.sand, shade(PAL.sand, -0.16), shade(PAL.sand, 0.08), 0.14, 67);
  set(3, 4, shade(PAL.sand, -0.25));
  set(11, 12, shade(PAL.sand, -0.25));
}
function sandC(set) {
  speckleMirror(set, PAL.sand, shade(PAL.sand, -0.14), shade(PAL.sand, 0.1), 0.1, 79);
  // ripple
  for (const x of [4, 5, 6, 7]) set(x, 8, shade(PAL.sand, -0.18));
  for (const x of [9, 10, 11, 12]) set(x, 11, shade(PAL.sand, -0.18));
}
function sandD(set) {
  speckle(set, PAL.sand, shade(PAL.sand, -0.18), shade(PAL.sand, 0.06), 0.16, 91);
  // tiny pebble
  set(7, 7, shade(PAL.sand, -0.32));
  set(8, 7, shade(PAL.sand, -0.32));
  set(7, 8, shade(PAL.sand, -0.28));
}

function stoneA(set) {
  speckle(set, PAL.stone, shade(PAL.stone, -0.18), shade(PAL.stone, 0.1), 0.2, 73);
}
function stoneB(set) {
  speckle(set, PAL.stone, shade(PAL.stone, -0.22), shade(PAL.stone, 0.06), 0.18, 89);
  for (let y = 6; y <= 8; y++) for (let x = 5; x <= 8; x++) set(x, y, shade(PAL.stone, -0.18));
  set(5, 6, shade(PAL.stone, -0.3));
  set(8, 8, shade(PAL.stone, -0.3));
}
function stoneC(set) {
  speckleMirror(set, PAL.stone, shade(PAL.stone, -0.2), shade(PAL.stone, 0.12), 0.18, 101);
  // crack
  for (const [x, y] of [[3, 11], [4, 12], [5, 12], [6, 13], [7, 13]])
    set(x, y, shade(PAL.stone, -0.32));
}
function stoneD(set) {
  speckle(set, PAL.stone, shade(PAL.stone, -0.22), shade(PAL.stone, 0.08), 0.16, 113);
  // mossy patch
  set(11, 3, shade(PAL.forest, -0.05));
  set(12, 3, shade(PAL.forest, -0.05));
  set(11, 4, shade(PAL.forest, -0.05));
}

function waterA(set) {
  fill(set, PAL.water);
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
function waterC(set) {
  fill(set, shade(PAL.water, -0.05));
  const r = rng(127);
  for (let i = 0; i < 8; i++) {
    const x = 1 + Math.floor(r() * (TILE - 2));
    const y = 1 + Math.floor(r() * (TILE - 2));
    set(x, y, shade(PAL.water, 0.22));
    set(x + 1, y, shade(PAL.water, 0.18));
  }
}
function waterD(set) {
  fill(set, PAL.water);
  for (let y = 1; y < TILE; y += 5) {
    for (let x = 0; x < TILE; x++) {
      if ((x + y) % 3 === 0) set(x, y, shade(PAL.water, 0.12));
    }
  }
  // deep patch
  for (let y = 9; y <= 11; y++) for (let x = 8; x <= 11; x++) set(x, y, shade(PAL.water, -0.18));
}

// ---- obstacles -------------------------------------------------------------

function tree(set) {
  for (let y = 11; y <= 14; y++) for (let x = 7; x <= 8; x++) set(x, y, PAL.trunk);
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
  set(6, 4, shade(PAL.leaves, 0.18));
  set(7, 3, shade(PAL.leaves, 0.18));
  set(8, 4, shade(PAL.leaves, 0.18));
  set(5, 6, shade(PAL.leaves, 0.18));
  set(7, 15, [0, 0, 0, 70]);
}

function pine(set) {
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
  for (const [x, y] of [
    [3, 11], [4, 11], [4, 12], [5, 12], [3, 10], [4, 10], [5, 10], [6, 11],
  ]) set(x, y, PAL.rockShade);
  set(5, 13, [0, 0, 0, 70]);
  set(6, 13, [0, 0, 0, 70]);
  set(9, 13, [0, 0, 0, 70]);
  set(10, 13, [0, 0, 0, 70]);
}

function rock2(set) {
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
  for (let y = 3; y <= 13; y++) {
    set(7, y, PAL.cactus);
    set(8, y, PAL.cactus);
  }
  for (let y = 6; y <= 9; y++) {
    set(5, y, PAL.cactus);
    set(10, y, PAL.cactus);
  }
  set(5, 5, PAL.cactus);
  set(10, 5, PAL.cactus);
  set(7, 2, PAL.cactus);
  set(8, 2, PAL.cactus);
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
  for (const x of [6, 7, 8, 9]) set(x, 12, [0, 0, 0, 60]);
}

function workbench(set) {
  // South-edge / rotation 0: horizontal tabletop flush with the tile's south
  // edge. Legs descend to the very bottom row so the workbench hugs the
  // floor instead of floating at tile center.
  for (let y = 8; y <= 10; y++) {
    for (let x = 3; x <= 12; x++) set(x, y, PAL.workbench);
  }
  for (let x = 3; x <= 12; x++) set(x, 8, shade(PAL.workbench, 0.18));
  for (let x = 4; x <= 11; x++) set(x, 11, shade(PAL.workbench, -0.25));
  for (let y = 11; y <= 14; y++) {
    set(4, y, PAL.workbenchLeg);
    set(11, y, PAL.workbenchLeg);
  }
  for (let x = 4; x <= 11; x++) set(x, 15, [0, 0, 0, 60]);
}

function workbenchN(set) {
  // North-edge / rotation 2: horizontal tabletop flush with the tile's north
  // edge. Legs still face the camera (descend southward), but the whole
  // sprite sits in the top half of the tile.
  for (let y = 0; y <= 2; y++) {
    for (let x = 3; x <= 12; x++) set(x, y, PAL.workbench);
  }
  for (let x = 3; x <= 12; x++) set(x, 0, shade(PAL.workbench, 0.18));
  for (let x = 4; x <= 11; x++) set(x, 3, shade(PAL.workbench, -0.25));
  for (let y = 3; y <= 6; y++) {
    set(4, y, PAL.workbenchLeg);
    set(11, y, PAL.workbenchLeg);
  }
  for (let x = 4; x <= 11; x++) set(x, 7, [0, 0, 0, 60]);
}

function workbenchW(set) {
  // West-edge / rotation 3: vertical tabletop flush with the tile's west
  // edge. Tabletop runs north-south on the left; legs face camera (south).
  for (let y = 2; y <= 10; y++) {
    for (let x = 0; x <= 3; x++) set(x, y, PAL.workbench);
  }
  for (let x = 0; x <= 3; x++) set(x, 2, shade(PAL.workbench, 0.18));
  for (let x = 0; x <= 3; x++) set(x, 10, shade(PAL.workbench, -0.25));
  for (let y = 11; y <= 13; y++) {
    set(0, y, PAL.workbenchLeg);
    set(3, y, PAL.workbenchLeg);
  }
  for (let x = 0; x <= 3; x++) set(x, 14, [0, 0, 0, 60]);
}

function workbenchE(set) {
  // East-edge / rotation 1: vertical tabletop flush with the tile's east
  // edge. Tabletop runs north-south on the right; legs face camera (south).
  for (let y = 2; y <= 10; y++) {
    for (let x = 12; x <= 15; x++) set(x, y, PAL.workbench);
  }
  for (let x = 12; x <= 15; x++) set(x, 2, shade(PAL.workbench, 0.18));
  for (let x = 12; x <= 15; x++) set(x, 10, shade(PAL.workbench, -0.25));
  for (let y = 11; y <= 13; y++) {
    set(12, y, PAL.workbenchLeg);
    set(15, y, PAL.workbenchLeg);
  }
  for (let x = 12; x <= 15; x++) set(x, 14, [0, 0, 0, 60]);
}

// ---- resources -------------------------------------------------------------
//
// Each resource is drawn over a soft cream halo + dark base shadow so the
// sprite reads on grass, forest, sand, and stone alike. The halo pixels go
// down first (alpha < 1) and the body pixels layer on top.

function halo(set, points) {
  for (const [x, y] of points) {
    set(x, y, PAL.haloLight, 130);
  }
}

function shadowDot(set, points) {
  for (const [x, y] of points) {
    set(x, y, PAL.haloDark, 60);
  }
}

function berry(set) {
  halo(set, [
    [5, 6], [6, 6], [7, 6], [8, 6], [9, 6], [10, 6], [11, 6],
    [4, 7], [12, 7],
    [4, 8], [12, 8],
    [4, 9], [12, 9],
    [5, 10], [11, 10],
    [6, 11], [10, 11],
  ]);
  shadowDot(set, [[7, 12], [8, 12], [9, 12]]);
  for (const [cx, cy] of [[6, 8], [10, 8], [8, 6]]) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (Math.abs(dx) + Math.abs(dy) > 1) continue;
        set(cx + dx, cy + dy, PAL.berry);
      }
    }
    set(cx - 1, cy - 1, shade(PAL.berry, 0.3));
  }
  set(8, 5, PAL.trunk);
}

function herb(set) {
  halo(set, [
    [4, 4], [5, 4], [6, 4], [7, 4], [8, 4], [9, 4], [10, 4], [11, 4],
    [3, 5], [12, 5],
    [3, 6], [12, 6],
    [3, 7], [12, 7],
    [4, 8], [11, 8],
    [5, 9], [10, 9],
    [6, 10], [9, 10],
  ]);
  shadowDot(set, [[6, 12], [7, 12], [8, 12], [9, 12]]);
  for (const [x, y] of [
    [7, 5], [8, 5],
    [6, 6], [7, 6], [8, 6], [9, 6],
    [5, 7], [6, 7], [7, 7], [8, 7], [9, 7], [10, 7],
    [6, 8], [7, 8], [8, 8], [9, 8],
  ]) set(x, y, PAL.herb);
  for (const [x, y] of [[7, 5], [9, 7], [6, 7]]) set(x, y, shade(PAL.herb, 0.3));
  // dark stem and veins make the leaf legible on green ground
  for (let y = 5; y <= 11; y++) set(7, y, PAL.herbDark);
  set(8, 11, PAL.herbDark);
  set(6, 9, PAL.herbDark);
  set(9, 9, PAL.herbDark);
}

function grain(set) {
  halo(set, [
    [3, 1], [4, 1], [5, 1], [6, 1], [7, 1], [8, 1], [9, 1], [10, 1], [11, 1], [12, 1],
    [3, 12], [4, 12], [11, 12], [12, 12],
  ]);
  shadowDot(set, [[5, 12], [6, 12], [9, 12], [10, 12]]);
  for (const cx of [5, 8, 11]) {
    for (let y = 5; y <= 11; y++) set(cx, y, shade(PAL.grain, -0.35));
    for (const dy of [3, 5, 7]) {
      set(cx - 1, dy, PAL.grain);
      set(cx, dy, PAL.grain);
      set(cx + 1, dy, PAL.grain);
    }
    set(cx, 2, shade(PAL.grain, 0.25));
  }
}

function shellfish(set) {
  halo(set, [
    [4, 4], [5, 4], [6, 4], [7, 4], [8, 4], [9, 4], [10, 4], [11, 4],
    [3, 5], [12, 5],
    [3, 6], [12, 6],
    [3, 7], [12, 7],
    [3, 8], [12, 8],
    [3, 9], [12, 9],
    [4, 10], [11, 10],
  ]);
  shadowDot(set, [[5, 11], [6, 11], [9, 11], [10, 11]]);
  const dome = [
    [6, 9], [7, 9], [8, 9], [9, 9],
    [5, 8], [6, 8], [7, 8], [8, 8], [9, 8], [10, 8],
    [4, 7], [5, 7], [6, 7], [7, 7], [8, 7], [9, 7], [10, 7], [11, 7],
    [5, 6], [6, 6], [7, 6], [8, 6], [9, 6], [10, 6],
    [6, 5], [7, 5], [8, 5], [9, 5],
  ];
  for (const [x, y] of dome) set(x, y, PAL.shellfish);
  for (const y of [6, 7, 8]) {
    set(7, y, shade(PAL.shellfish, -0.25));
    set(9, y, shade(PAL.shellfish, -0.25));
  }
  for (let x = 4; x <= 11; x++) set(x, 10, shade(PAL.shellfish, -0.35));
}

function tubers(set) {
  halo(set, [
    [3, 6], [4, 6], [5, 6], [6, 6], [7, 6], [8, 6], [9, 6], [10, 6], [11, 6], [12, 6],
    [2, 7], [13, 7],
    [2, 8], [13, 8],
    [2, 9], [13, 9],
    [3, 10], [12, 10],
    [4, 11], [11, 11],
  ]);
  shadowDot(set, [[5, 12], [6, 12], [9, 12], [10, 12]]);
  for (const [cx, cy, w, h] of [[6, 8, 3, 4], [10, 9, 2, 3]]) {
    for (let dy = -h; dy <= h; dy++) {
      for (let dx = -w; dx <= w; dx++) {
        if (dx * dx * h * h + dy * dy * w * w > w * w * h * h) continue;
        set(cx + dx, cy + dy, PAL.tubers);
      }
    }
  }
  set(6, 3, PAL.herb);
  set(6, 4, PAL.herb);
  set(10, 5, PAL.herb);
  set(10, 6, PAL.herb);
  set(5, 8, shade(PAL.tubers, -0.35));
  set(11, 9, shade(PAL.tubers, -0.35));
}

function wood(set) {
  halo(set, [
    [1, 4], [2, 4], [13, 4], [14, 4],
    [1, 8], [14, 8],
    [1, 12], [2, 12], [13, 12], [14, 12],
  ]);
  shadowDot(set, [[3, 13], [4, 13], [12, 13], [13, 13]]);
  const log = (cy) => {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        if (dx * dx * 4 + dy * dy * 9 > 36) continue;
        set(8 + dx, cy + dy, PAL.wood);
      }
    }
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
  halo(set, [
    [3, 2], [5, 2], [7, 2], [9, 2], [11, 2],
    [4, 12], [12, 12],
  ]);
  shadowDot(set, [[5, 13], [11, 13]]);
  for (const cx of [5, 8, 11]) {
    for (let y = 4; y <= 12; y++) set(cx, y, PAL.reed);
    set(cx, 3, shade(PAL.reed, 0.22));
    set(cx + 1, 6, PAL.reed);
    set(cx - 1, 8, PAL.reed);
  }
  // dark spine
  for (const cx of [5, 8, 11]) {
    for (let y = 4; y <= 12; y += 3) set(cx, y, shade(PAL.reed, -0.35));
  }
}

function stoneRes(set) {
  halo(set, [
    [3, 7], [4, 7], [5, 7], [6, 7], [7, 7], [8, 7], [9, 7], [10, 7], [11, 7], [12, 7],
    [2, 8], [13, 8],
    [2, 9], [13, 9],
    [3, 10], [12, 10],
    [4, 11], [11, 11],
  ]);
  shadowDot(set, [[3, 12], [4, 12], [11, 12], [12, 12]]);
  const pebbles = [
    [4, 8], [5, 8], [6, 8],
    [7, 9], [8, 9], [9, 9],
    [10, 8], [11, 8],
    [5, 10], [6, 10], [7, 10], [8, 10], [9, 10], [10, 10],
    [3, 11], [4, 11], [5, 11], [6, 11], [7, 11], [8, 11], [9, 11], [10, 11], [11, 11], [12, 11],
  ];
  for (const [x, y] of pebbles) set(x, y, PAL.stoneRes);
  for (const [x, y] of [[4, 8], [7, 9], [10, 8], [5, 10]])
    set(x, y, shade(PAL.stoneRes, 0.25));
  for (const [x, y] of [[5, 11], [9, 11]]) set(x, y, shade(PAL.stoneRes, -0.35));
}

function ore(set) {
  halo(set, [
    [7, 1], [8, 1], [9, 1],
    [6, 2], [10, 2],
    [4, 4], [12, 4],
    [3, 5], [13, 5],
    [3, 6], [13, 6],
    [4, 8], [12, 8],
    [5, 10], [11, 10],
    [6, 11], [10, 11],
    [7, 12], [9, 12],
  ]);
  shadowDot(set, [[7, 12], [8, 12], [9, 12]]);
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
  for (const [x, y] of [[7, 5], [8, 4], [6, 7], [7, 8]])
    set(x, y, shade(PAL.ore, 0.4));
  for (const [x, y] of [[10, 7], [10, 8], [9, 9], [9, 10]])
    set(x, y, shade(PAL.ore, -0.35));
}

function lootPile(set) {
  halo(set, [
    [3, 10], [12, 10],
    [3, 13], [12, 13],
  ]);
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
  const O = PAL.outline;
  const B = PAL.body;
  for (const [x, y] of [
    [6, 2], [7, 2], [8, 2], [9, 2],
    [5, 3], [6, 3], [7, 3], [8, 3], [9, 3], [10, 3],
    [5, 4], [6, 4], [7, 4], [8, 4], [9, 4], [10, 4],
    [5, 5], [6, 5], [7, 5], [8, 5], [9, 5], [10, 5],
    [6, 6], [7, 6], [8, 6], [9, 6],
  ]) set(x, y, B);
  for (const [x, y] of [
    [6, 1], [7, 1], [8, 1], [9, 1],
    [5, 2], [10, 2],
    [4, 3], [11, 3],
    [4, 4], [11, 4],
    [4, 5], [11, 5],
    [5, 6], [10, 6],
    [6, 7], [9, 7],
  ]) set(x, y, O);
  for (const [x, y] of [
    [5, 7], [6, 7], [7, 7], [8, 7], [9, 7], [10, 7],
    [4, 8], [5, 8], [6, 8], [7, 8], [8, 8], [9, 8], [10, 8], [11, 8],
    [4, 9], [5, 9], [6, 9], [7, 9], [8, 9], [9, 9], [10, 9], [11, 9],
    [4, 10], [5, 10], [6, 10], [7, 10], [8, 10], [9, 10], [10, 10], [11, 10],
    [5, 11], [6, 11], [7, 11], [8, 11], [9, 11], [10, 11],
    [5, 12], [6, 12], [7, 12], [8, 12], [9, 12], [10, 12],
  ]) set(x, y, B);
  for (const [x, y] of [
    [4, 7], [11, 7],
    [3, 8], [12, 8],
    [3, 9], [12, 9],
    [3, 10], [12, 10],
    [4, 11], [11, 11],
    [4, 12], [11, 12],
    [5, 13], [6, 13], [7, 13], [8, 13], [9, 13], [10, 13],
  ]) set(x, y, O);
  for (const [x, y] of [
    [5, 14], [6, 14], [9, 14], [10, 14],
  ]) set(x, y, B);
  for (const [x, y] of [
    [4, 14], [7, 14], [8, 14], [11, 14],
    [5, 15], [6, 15], [9, 15], [10, 15],
  ]) set(x, y, O);
  for (const x of [4, 5, 6, 7, 8, 9, 10, 11]) set(x, 15, [0, 0, 0, 90]);
}

// ---- ore deposit cells -----------------------------------------------------
//
// Cells are tiled flush so adjacent deposit cells form one boulder. Outer
// frame is neutral grey rock; interior frames keep the same shape but speckle
// tier color across the body so the tier is legible only after the player
// chips through the surrounding shell.

function depositCellBase(set) {
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      set(x, y, PAL.depositOuter);
    }
  }
  // dark fissure lines and shade so the surface reads as cracked stone
  for (const [x, y] of [
    [2, 3], [3, 3], [4, 3],
    [10, 5], [11, 5], [12, 5],
    [3, 9], [4, 9],
    [9, 11], [10, 11], [11, 11],
    [6, 13], [7, 13],
    [1, 7], [14, 7],
  ]) set(x, y, PAL.depositOuterShade);
  for (const [x, y] of [
    [5, 5], [6, 5],
    [11, 8], [12, 8],
    [3, 12], [4, 12],
    [13, 13],
  ]) set(x, y, PAL.depositOuterHi);
}

function depositOuter(set) {
  depositCellBase(set);
}

function depositInterior(set, tier) {
  depositCellBase(set);
  // tier flecks scattered through the body so tinted cells feel like exposed
  // ore matrix. Deterministic per tier for stable visuals across regions.
  const seedByTier = { copper: 211, tin: 233, iron: 257, coal: 281 };
  const r = rng(seedByTier[tier] ?? 211);
  const tint = PAL[`${tier}Tier`];
  if (!tint) return;
  for (let i = 0; i < 26; i++) {
    const x = Math.floor(r() * TILE);
    const y = Math.floor(r() * TILE);
    set(x, y, tint);
  }
  // a few brighter highlights so the tier color is legible at a glance
  const hi = shade(tint, 0.35);
  for (let i = 0; i < 8; i++) {
    const x = Math.floor(r() * TILE);
    const y = Math.floor(r() * TILE);
    set(x, y, hi);
  }
}

function depositInteriorCopper(set) { depositInterior(set, "copper"); }
function depositInteriorTin(set) { depositInterior(set, "tin"); }
function depositInteriorIron(set) { depositInterior(set, "iron"); }
function depositInteriorCoal(set) { depositInterior(set, "coal"); }

// Inventory icons — one tinted nugget per tier, drawn over the same halo +
// shadow scaffolding as the other resource sprites so they pop on any biome.
function tierNugget(set, tier) {
  halo(set, [
    [4, 6], [5, 6], [6, 6], [7, 6], [8, 6], [9, 6], [10, 6], [11, 6],
    [3, 7], [12, 7],
    [3, 8], [12, 8],
    [3, 9], [12, 9],
    [4, 10], [11, 10],
    [5, 11], [10, 11],
  ]);
  shadowDot(set, [[6, 12], [7, 12], [8, 12], [9, 12]]);
  const body = [
    [7, 5], [8, 5],
    [6, 6], [7, 6], [8, 6], [9, 6],
    [5, 7], [6, 7], [7, 7], [8, 7], [9, 7], [10, 7],
    [4, 8], [5, 8], [6, 8], [7, 8], [8, 8], [9, 8], [10, 8], [11, 8],
    [5, 9], [6, 9], [7, 9], [8, 9], [9, 9], [10, 9],
    [6, 10], [7, 10], [8, 10], [9, 10],
    [7, 11], [8, 11],
  ];
  const base = PAL[`${tier}Tier`];
  if (!base) return;
  for (const [x, y] of body) set(x, y, base);
  for (const [x, y] of [[6, 7], [8, 6], [7, 8], [9, 9]])
    set(x, y, shade(base, 0.35));
  for (const [x, y] of [[10, 8], [9, 10], [8, 11], [5, 9]])
    set(x, y, shade(base, -0.35));
}

function copperOre(set) { tierNugget(set, "copper"); }
function tinOre(set) { tierNugget(set, "tin"); }
function ironOre(set) { tierNugget(set, "iron"); }
function coalOre(set) { tierNugget(set, "coal"); }

// ---- atlas layout ----------------------------------------------------------
//
// Frame index = row * COLS + col. Keep this in sync with content/tiles.ts.

const FRAMES = [
  // Row 0: ground variants — 4 per biome (grass, forest, sand, stone)
  ["grass_a", grassA],
  ["grass_b", grassB],
  ["grass_c", grassC],
  ["grass_d", grassD],
  ["forest_a", forestA],
  ["forest_b", forestB],
  ["forest_c", forestC],
  ["forest_d", forestD],
  ["sand_a", sandA],
  ["sand_b", sandB],
  ["sand_c", sandC],
  ["sand_d", sandD],
  ["stone_a", stoneA],
  ["stone_b", stoneB],
  ["stone_c", stoneC],
  ["stone_d", stoneD],
  // Row 1: water variants + obstacles
  ["water_a", waterA],
  ["water_b", waterB],
  ["water_c", waterC],
  ["water_d", waterD],
  ["tree_oak", tree],
  ["tree_pine", pine],
  ["rock_a", rock],
  ["rock_b", rock2],
  ["cactus", cactus],
  ["bush", bush],
  ["workbench", workbench],
  // Row 2: resources + misc
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
  ["ore_deposit_outer", depositOuter],
  ["ore_interior_copper", depositInteriorCopper],
  ["ore_interior_tin", depositInteriorTin],
  ["ore_interior_iron", depositInteriorIron],
  ["ore_interior_coal", depositInteriorCoal],
  ["res_copper_ore", copperOre],
  ["res_tin_ore", tinOre],
  ["res_iron_ore", ironOre],
  ["res_coal", coalOre],
  // Row 2 (col 15) onward: structure rotation variants. The default
  // `workbench` frame (row 1) is the south-edge / rotation-0 variant.
  ["workbench_n", workbenchN],
  // Row 3: rotation overflow.
  ["workbench_w", workbenchW],
  ["workbench_e", workbenchE],
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
