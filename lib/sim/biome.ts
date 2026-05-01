export type Biome = "grass" | "forest" | "water" | "sand" | "stone";

// Smooth, low-frequency biomes so adjacent regions usually agree -- gives
// the map a "regions" feel instead of speckle noise.
export function biomeAt(x: number, y: number): Biome {
  const a = Math.sin(x * 0.45 + y * 0.7);
  const b = Math.cos(x * 0.3 - y * 0.55 + 1.7);
  const c = Math.sin((x + y) * 0.35 + 4.1);
  const r = (a + b + c) / 6 + 0.5;
  if (r < 0.2) return "water";
  if (r < 0.27) return "sand";
  if (r < 0.55) return "grass";
  if (r < 0.85) return "forest";
  return "stone";
}

export function isPassable(x: number, y: number, mapW: number, mapH: number): boolean {
  if (x < 0 || y < 0 || x >= mapW || y >= mapH) return false;
  return biomeAt(x, y) !== "water";
}

// Smooth pseudo-noise for blending biome edges -- value in [-1, 1] using
// the same trig basis as biomeAt so the noise tracks biome boundaries.
export function blendNoise(gx: number, gy: number): number {
  const a = Math.sin(gx * 0.7 + gy * 0.31);
  const b = Math.cos(gx * 0.22 - gy * 0.58 + 2.1);
  return (a + b) * 0.5;
}
