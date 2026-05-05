import {
  INTERIOR_W,
  INTERIOR_H,
  globalToLocal,
  regionKey,
} from "@/lib/sim/biome-interior";
import type { Player } from "@/lib/sim/player";

export const REGION_BITMAP_BYTES = Math.ceil((INTERIOR_W * INTERIOR_H) / 8);

export function emptyRegionBitmap(): Uint8Array {
  return new Uint8Array(REGION_BITMAP_BYTES);
}

export function isBitmapTileDiscovered(
  bitmap: Uint8Array,
  lx: number,
  ly: number,
): boolean {
  if (lx < 0 || ly < 0 || lx >= INTERIOR_W || ly >= INTERIOR_H) return false;
  const idx = ly * INTERIOR_W + lx;
  return (bitmap[idx >> 3]! & (1 << (idx & 7))) !== 0;
}

function setBitmapTile(bitmap: Uint8Array, lx: number, ly: number): boolean {
  const idx = ly * INTERIOR_W + lx;
  const byte = idx >> 3;
  const mask = 1 << (idx & 7);
  if ((bitmap[byte]! & mask) !== 0) return false;
  bitmap[byte]! |= mask;
  return true;
}

export function bitmapAnyDiscovered(bitmap: Uint8Array): boolean {
  for (let i = 0; i < bitmap.length; i++) {
    if (bitmap[i]! !== 0) return true;
  }
  return false;
}

export function markPerceptionDiscovered(
  prev: Record<string, Uint8Array>,
  gx: number,
  gy: number,
  perception: number,
  mapW: number,
  mapH: number,
): Record<string, Uint8Array> {
  if (perception <= 0) return prev;
  const r = Math.floor(perception);
  const r2 = r * r;
  let next: Record<string, Uint8Array> | null = null;
  const cloned = new Set<string>();

  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r2) continue;
      const tgx = gx + dx;
      const tgy = gy + dy;
      const { rx, ry, lx, ly } = globalToLocal(tgx, tgy);
      if (rx < 0 || ry < 0 || rx >= mapW || ry >= mapH) continue;
      const key = regionKey(rx, ry);
      let bitmap = (next ?? prev)[key];
      if (!bitmap) {
        bitmap = emptyRegionBitmap();
        if (!next) next = { ...prev };
        next[key] = bitmap;
        cloned.add(key);
      } else if (!cloned.has(key)) {
        const idx = ly * INTERIOR_W + lx;
        const byte = idx >> 3;
        const mask = 1 << (idx & 7);
        if ((bitmap[byte]! & mask) !== 0) continue;
        const fresh = new Uint8Array(bitmap);
        if (!next) next = { ...prev };
        next[key] = fresh;
        cloned.add(key);
        bitmap = fresh;
      }
      setBitmapTile(bitmap, lx, ly);
    }
  }
  return next ?? prev;
}

export function isTileDiscovered(
  discovered: Record<string, Uint8Array>,
  rx: number,
  ry: number,
  lx: number,
  ly: number,
): boolean {
  const bitmap = discovered[regionKey(rx, ry)];
  if (!bitmap) return false;
  return isBitmapTileDiscovered(bitmap, lx, ly);
}

export function regionAnyDiscovered(
  discovered: Record<string, Uint8Array>,
  rx: number,
  ry: number,
): boolean {
  const bitmap = discovered[regionKey(rx, ry)];
  if (!bitmap) return false;
  return bitmapAnyDiscovered(bitmap);
}

export function isTileVisibleEuclid(
  player: Player,
  gx: number,
  gy: number,
  perception: number,
): boolean {
  const dx = gx - player.gx;
  const dy = gy - player.gy;
  const r = Math.floor(perception);
  return dx * dx + dy * dy <= r * r;
}

export function effectivePerception(player: Player): number {
  return player.stats.perception;
}

export function countDiscoveredRegions(
  discovered: Record<string, Uint8Array>,
): number {
  let n = 0;
  for (const key of Object.keys(discovered)) {
    if (bitmapAnyDiscovered(discovered[key]!)) n++;
  }
  return n;
}
