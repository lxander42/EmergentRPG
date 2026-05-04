import { biomeAt, type Biome } from "@/lib/sim/biome";
import { createRng, type Rng } from "@/lib/sim/rng";
import {
  BIOME_RESOURCES,
  RESOURCE_DENSITY,
  type ResourceKind,
} from "@/content/resources";

export const INTERIOR_W = 20;
export const INTERIOR_H = 20;
export const OBSTACLE_DENSITY = 0.10;

export type ObstacleKind = "tree" | "rock" | "cactus" | "bush" | "workbench";

export type InteriorResource = {
  id: string;
  lx: number;
  ly: number;
  kind: ResourceKind;
};

export type LootPile = {
  id: string;
  lx: number;
  ly: number;
  items: Partial<Record<ResourceKind, number>>;
  weapons?: import("@/lib/sim/weapons").WeaponInstance[];
  tools?: import("@/lib/sim/tools").ToolInstance[];
  // Optional flag: this pile was dropped by the player on death. Lets the
  // render layer show it differently and the encounter feed reference it.
  fromDeath?: boolean;
};

export type BiomeInterior = {
  rx: number;
  ry: number;
  biome: Biome;
  obstacles: (ObstacleKind | null)[];
  resources: InteriorResource[];
  loot: LootPile[];
};

export function regionKey(rx: number, ry: number): string {
  return `${rx},${ry}`;
}

export function globalToLocal(gx: number, gy: number): {
  rx: number;
  ry: number;
  lx: number;
  ly: number;
} {
  const rx = Math.floor(gx / INTERIOR_W);
  const ry = Math.floor(gy / INTERIOR_H);
  const lx = gx - rx * INTERIOR_W;
  const ly = gy - ry * INTERIOR_H;
  return { rx, ry, lx, ly };
}

export function localToGlobal(rx: number, ry: number, lx: number, ly: number): {
  gx: number;
  gy: number;
} {
  return { gx: rx * INTERIOR_W + lx, gy: ry * INTERIOR_H + ly };
}

export function regionCenterGlobal(rx: number, ry: number): { gx: number; gy: number } {
  return localToGlobal(rx, ry, Math.floor(INTERIOR_W / 2), Math.floor(INTERIOR_H / 2));
}

export function defaultObstacleKindForBiome(biome: Biome): ObstacleKind | null {
  switch (biome) {
    case "forest":
      return "tree";
    case "stone":
      return "rock";
    case "sand":
      return "cactus";
    case "grass":
      return "bush";
    case "water":
      return null;
  }
}

// Each region's interior derives from a per-region rng so the generator is
// reproducible and decoupled from the world's master rng -- the order in
// which the player visits regions can't desync the rest of the sim.
export function generateInterior(worldSeed: number, rx: number, ry: number): BiomeInterior {
  const biome: Biome = biomeAt(rx, ry);
  const seed = mixSeed(worldSeed, rx, ry);
  const rng = createRng(seed);

  if (biome === "water") {
    return {
      rx,
      ry,
      biome,
      obstacles: new Array<ObstacleKind | null>(INTERIOR_W * INTERIOR_H).fill("rock"),
      resources: [],
      loot: [],
    };
  }

  const obstacles = scatterObstacles(rng, biome);
  const resources = scatterResources(rng, biome, obstacles);
  return { rx, ry, biome, obstacles, resources, loot: [] };
}

export function isLocalObstacle(interior: BiomeInterior, lx: number, ly: number): boolean {
  if (lx < 0 || ly < 0 || lx >= INTERIOR_W || ly >= INTERIOR_H) return true;
  return interior.obstacles[ly * INTERIOR_W + lx] != null;
}

export function obstacleKindAt(
  interior: BiomeInterior,
  lx: number,
  ly: number,
): ObstacleKind | null {
  if (lx < 0 || ly < 0 || lx >= INTERIOR_W || ly >= INTERIOR_H) return null;
  return interior.obstacles[ly * INTERIOR_W + lx] ?? null;
}

export function clearObstacle(
  interior: BiomeInterior,
  lx: number,
  ly: number,
): BiomeInterior {
  if (lx < 0 || ly < 0 || lx >= INTERIOR_W || ly >= INTERIOR_H) return interior;
  const idx = ly * INTERIOR_W + lx;
  if (interior.obstacles[idx] == null) return interior;
  const next = interior.obstacles.slice();
  next[idx] = null;
  return { ...interior, obstacles: next };
}

// Place a workbench on the interior at a passable tile near `near`. Picks
// from candidates within radius 3 using `rng`, so the choice is deterministic
// for a given (worldSeed, regionKey, spawn). Returns the original interior
// when no candidate exists (extremely rare given 10% density).
export function placeWorkbench(
  interior: BiomeInterior,
  near: { lx: number; ly: number },
  rng: Rng,
): BiomeInterior {
  const candidates: Array<{ idx: number; lx: number; ly: number }> = [];
  for (let r = 1; r <= 3 && candidates.length === 0; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const lx = near.lx + dx;
        const ly = near.ly + dy;
        if (lx < 0 || ly < 0 || lx >= INTERIOR_W || ly >= INTERIOR_H) continue;
        const idx = ly * INTERIOR_W + lx;
        if (interior.obstacles[idx] != null) continue;
        if (interior.resources.some((res) => res.lx === lx && res.ly === ly)) continue;
        candidates.push({ idx, lx, ly });
      }
    }
  }
  if (candidates.length === 0) return interior;
  const pick = candidates[rng.int(0, candidates.length)]!;
  const next = interior.obstacles.slice();
  next[pick.idx] = "workbench";
  return { ...interior, obstacles: next };
}

export function findWorkbenchTile(
  interior: BiomeInterior,
): { lx: number; ly: number } | null {
  for (let i = 0; i < interior.obstacles.length; i++) {
    if (interior.obstacles[i] === "workbench") {
      const lx = i % INTERIOR_W;
      const ly = Math.floor(i / INTERIOR_W);
      return { lx, ly };
    }
  }
  return null;
}

// Spiral-search for the first tile within `radius` of (lx, ly) that is
// passable and not occupied by a resource. Deterministic — used by
// player-initiated structure placement so the chosen slot is stable.
export function findAdjacentPassable(
  interior: BiomeInterior,
  lx: number,
  ly: number,
  radius: number,
): { lx: number; ly: number } | null {
  for (let r = 1; r <= radius; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const tlx = lx + dx;
        const tly = ly + dy;
        if (tlx < 0 || tly < 0 || tlx >= INTERIOR_W || tly >= INTERIOR_H) continue;
        const idx = tly * INTERIOR_W + tlx;
        if (interior.obstacles[idx] != null) continue;
        if (interior.resources.some((res) => res.lx === tlx && res.ly === tly)) continue;
        return { lx: tlx, ly: tly };
      }
    }
  }
  return null;
}

export function placeObstacle(
  interior: BiomeInterior,
  lx: number,
  ly: number,
  kind: ObstacleKind,
): BiomeInterior {
  if (lx < 0 || ly < 0 || lx >= INTERIOR_W || ly >= INTERIOR_H) return interior;
  const idx = ly * INTERIOR_W + lx;
  if (interior.obstacles[idx] != null) return interior;
  const next = interior.obstacles.slice();
  next[idx] = kind;
  return { ...interior, obstacles: next };
}

export function resourceAtLocal(
  interior: BiomeInterior,
  lx: number,
  ly: number,
): InteriorResource | null {
  return interior.resources.find((r) => r.lx === lx && r.ly === ly) ?? null;
}

export function removeResource(
  interior: BiomeInterior,
  resourceId: string,
): BiomeInterior {
  const next = interior.resources.filter((r) => r.id !== resourceId);
  if (next.length === interior.resources.length) return interior;
  return { ...interior, resources: next };
}

export function lootAtLocal(
  interior: BiomeInterior,
  lx: number,
  ly: number,
): LootPile | null {
  return interior.loot.find((l) => l.lx === lx && l.ly === ly) ?? null;
}

export function addLoot(interior: BiomeInterior, pile: LootPile): BiomeInterior {
  return { ...interior, loot: [...interior.loot, pile] };
}

export function removeLoot(interior: BiomeInterior, lootId: string): BiomeInterior {
  const next = interior.loot.filter((l) => l.id !== lootId);
  if (next.length === interior.loot.length) return interior;
  return { ...interior, loot: next };
}

// Find a passable interior tile near (cx, cy) that isn't occupied by another
// NPC. Used for spawning NPC interior slots and loot piles.
export function findPassableTile(
  interior: BiomeInterior,
  cx: number,
  cy: number,
  isOccupied: (lx: number, ly: number) => boolean,
): { lx: number; ly: number } | null {
  for (let r = 0; r <= Math.max(INTERIOR_W, INTERIOR_H); r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const lx = cx + dx;
        const ly = cy + dy;
        if (lx < 0 || ly < 0 || lx >= INTERIOR_W || ly >= INTERIOR_H) continue;
        if (isLocalObstacle(interior, lx, ly)) continue;
        if (isOccupied(lx, ly)) continue;
        return { lx, ly };
      }
    }
  }
  return null;
}

export function mixSeed(worldSeed: number, rx: number, ry: number): number {
  let h = worldSeed >>> 0;
  h = Math.imul(h ^ rx, 0x9e3779b1);
  h = Math.imul(h ^ ry, 0x85ebca77);
  h ^= h >>> 16;
  return h >>> 0;
}

function scatterObstacles(rng: Rng, biome: Biome): (ObstacleKind | null)[] {
  const cells = INTERIOR_W * INTERIOR_H;
  const target = Math.floor(cells * OBSTACLE_DENSITY);
  const obstacles = new Array<ObstacleKind | null>(cells).fill(null);
  const kind = defaultObstacleKindForBiome(biome);
  if (!kind) return obstacles;
  let placed = 0;
  let attempts = 0;
  while (placed < target && attempts < cells * 4) {
    attempts++;
    const lx = rng.int(0, INTERIOR_W);
    const ly = rng.int(0, INTERIOR_H);
    const idx = ly * INTERIOR_W + lx;
    if (obstacles[idx]) continue;
    obstacles[idx] = kind;
    placed++;
  }
  return obstacles;
}

function scatterResources(
  rng: Rng,
  biome: Biome,
  obstacles: (ObstacleKind | null)[],
): InteriorResource[] {
  const lists = BIOME_RESOURCES[biome];
  const density = RESOURCE_DENSITY[biome];
  const cells = INTERIOR_W * INTERIOR_H;
  const target = Math.max(1, Math.floor(cells * density));
  const placed: InteriorResource[] = [];
  let attempts = 0;
  while (placed.length < target && attempts < cells * 4) {
    attempts++;
    const lx = rng.int(0, INTERIOR_W);
    const ly = rng.int(0, INTERIOR_H);
    const idx = ly * INTERIOR_W + lx;
    if (obstacles[idx]) continue;
    if (placed.some((r) => r.lx === lx && r.ly === ly)) continue;
    // Bias toward food: 70% food, 30% material when both lists exist.
    const useFood = lists.food.length > 0 && (lists.materials.length === 0 || rng.chance(0.7));
    const pool = useFood ? lists.food : lists.materials;
    if (pool.length === 0) continue;
    const kind = rng.pick(pool);
    placed.push({ id: `r-${biome}-${lx}-${ly}`, lx, ly, kind });
  }
  return placed;
}
