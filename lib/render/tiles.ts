import Phaser from "phaser";
import {
  ATLAS_KEY,
  ATLAS_PATH,
  TILE_FRAMES,
  TILE_PX,
  type TileName,
} from "@/content/tiles";
import { biomeAt, type Biome } from "@/lib/sim/biome";
import { globalToLocal, INTERIOR_W, INTERIOR_H } from "@/lib/sim/biome-interior";

// Phaser texture-key prefix for the named sub-frames we register against the
// atlas image. Each frame becomes "tile/<TileName>" so multiple sheets could
// later coexist without clashing on common names.
const FRAME_PREFIX = "tile/";

export function preloadTiles(scene: Phaser.Scene): void {
  if (scene.textures.exists(ATLAS_KEY)) return;
  scene.load.image(ATLAS_KEY, ATLAS_PATH);
}

export function registerTileFrames(scene: Phaser.Scene): void {
  if (!scene.textures.exists(ATLAS_KEY)) return;
  const tex = scene.textures.get(ATLAS_KEY);
  // Force nearest-neighbour filtering on the atlas only — WorldScene Graphics
  // keep their default smooth rendering. Idempotent.
  tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
  for (const [name, frame] of Object.entries(TILE_FRAMES)) {
    const key = FRAME_PREFIX + name;
    if (tex.has(key)) continue;
    tex.add(key, 0, frame.x, frame.y, TILE_PX, TILE_PX);
  }
}

export function frameKey(name: TileName): string {
  return FRAME_PREFIX + name;
}

// Deterministic variant pick — the same tile coords always resolve to the
// same frame so saves stay visually stable across reloads. Uses two coprime
// large odd numbers to avoid stripe patterns from naive `(x + y) % n`.
export function pickVariant<T extends string>(
  variants: readonly T[],
  gx: number,
  gy: number,
): T {
  if (variants.length === 1) return variants[0]!;
  const h = (gx * 73856093) ^ (gy * 19349663);
  const idx = ((h % variants.length) + variants.length) % variants.length;
  return variants[idx]!;
}

// Scatter-blend transition picker.
//
// Within `EDGE_BAND` tiles of a region boundary, a tile may visually borrow
// the neighbour region's biome (deterministically, via the same hash used
// for variants). Crossover probability falls off with distance from the
// edge: at the very last row/column it's ~40%, two tiles in ~20%, then
// nothing. The result is a feathered, dithered transition rather than a
// hard line, without needing dedicated transition sprites.
//
// `hereBiome` is the canonical biome of this tile's region (from the
// interior). The returned biome is purely visual — gameplay still uses
// `hereBiome` for resources/obstacles/passability.
const EDGE_BAND = 3;

export function blendedBiomeAt(gx: number, gy: number, hereBiome: Biome): Biome {
  const { rx, ry, lx, ly } = globalToLocal(gx, gy);

  const distLeft = lx;
  const distRight = INTERIOR_W - 1 - lx;
  const distTop = ly;
  const distBottom = INTERIOR_H - 1 - ly;
  const minDist = Math.min(distLeft, distRight, distTop, distBottom);
  if (minDist > EDGE_BAND) return hereBiome;

  const neighbours: Biome[] = [];
  if (distLeft <= EDGE_BAND) {
    const nb = biomeAt(rx - 1, ry);
    if (nb !== hereBiome) neighbours.push(nb);
  }
  if (distRight <= EDGE_BAND) {
    const nb = biomeAt(rx + 1, ry);
    if (nb !== hereBiome) neighbours.push(nb);
  }
  if (distTop <= EDGE_BAND) {
    const nb = biomeAt(rx, ry - 1);
    if (nb !== hereBiome) neighbours.push(nb);
  }
  if (distBottom <= EDGE_BAND) {
    const nb = biomeAt(rx, ry + 1);
    if (nb !== hereBiome) neighbours.push(nb);
  }
  if (neighbours.length === 0) return hereBiome;

  // Probability that a tile this close to the edge crosses over. Falls off
  // sharply: 0→0.4, 1→0.2, 2→0.1, 3→0.05.
  const crossover = 0.4 / Math.pow(2, minDist);
  const h = ((gx * 73856093) ^ (gy * 19349663)) >>> 0;
  const r = (h % 1000) / 1000;
  if (r >= crossover) return hereBiome;

  const idx = Math.floor((r / crossover) * neighbours.length);
  return neighbours[Math.min(idx, neighbours.length - 1)]!;
}
