import Phaser from "phaser";
import {
  ATLAS_KEY,
  ATLAS_PATH,
  TILE_FRAMES,
  TILE_PX,
  type TileName,
} from "@/content/tiles";

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
