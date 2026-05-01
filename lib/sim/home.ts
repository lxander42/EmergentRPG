import type { Biome } from "@/lib/sim/biome";
import type { Rng } from "@/lib/sim/rng";
import { bfs, isReachable } from "@/lib/sim/path";
import {
  BASE_SPEED_TICKS_PER_TILE,
  ENERGY_MAX,
  ENERGY_REGEN_TICKS,
  type PendingAction,
  type Player,
} from "@/lib/sim/player";
import { BIOME_RESOURCES, type ResourceKind } from "@/content/home-resources";

export const HOME_GRID = 10;
export const RESOURCE_COUNT = 14;
export const RESOURCE_RESPAWN_TICKS = 240;
export const OBSTACLE_DENSITY = 0.12;

export type HomeResource = {
  id: string;
  px: number;
  py: number;
  kind: ResourceKind;
  respawnAt: number | null;
};

export type HomeBase = {
  rx: number;
  ry: number;
  biome: Biome;
  obstacles: boolean[];
  resources: HomeResource[];
};

export type Inventory = Partial<Record<ResourceKind, number>>;

export function createHome(
  rng: Rng,
  biome: Biome,
  rx: number,
  ry: number,
): { home: HomeBase; player: Player } {
  const cells = HOME_GRID * HOME_GRID;
  const spawn = { px: Math.floor(HOME_GRID / 2), py: Math.floor(HOME_GRID / 2) };
  const obstacleTarget = Math.floor(cells * OBSTACLE_DENSITY);

  let obstacles: boolean[] = [];
  let resources: HomeResource[] = [];

  for (let attempt = 0; attempt < 32; attempt++) {
    obstacles = scatterObstacles(rng, spawn, obstacleTarget);
    if (!spawnSurroundedByObstacles(obstacles, spawn)) {
      resources = scatterResources(rng, biome, obstacles, spawn);
      if (resources.length === RESOURCE_COUNT) break;
    }
  }

  const player: Player = {
    px: spawn.px,
    py: spawn.py,
    energy: ENERGY_MAX,
    energyMax: ENERGY_MAX,
    energyRegenAccum: 0,
    stats: { speed: BASE_SPEED_TICKS_PER_TILE },
    route: null,
    stepCooldown: 0,
    pendingAction: null,
  };

  return {
    home: { rx, ry, biome, obstacles, resources },
    player,
  };
}

export function tickHome(
  ticks: number,
  home: HomeBase,
  player: Player,
  inventory: Inventory,
): { home: HomeBase; player: Player; inventory: Inventory } {
  let nextHome = home;
  let nextPlayer = player;
  let nextInventory = inventory;

  // Energy regen.
  if (nextPlayer.energy < nextPlayer.energyMax) {
    const accum = nextPlayer.energyRegenAccum + 1;
    if (accum >= ENERGY_REGEN_TICKS) {
      nextPlayer = {
        ...nextPlayer,
        energy: Math.min(nextPlayer.energyMax, nextPlayer.energy + 1),
        energyRegenAccum: 0,
      };
    } else {
      nextPlayer = { ...nextPlayer, energyRegenAccum: accum };
    }
  }

  // Resource respawn.
  let resourcesChanged = false;
  const respawned = nextHome.resources.map((r) => {
    if (r.respawnAt !== null && ticks >= r.respawnAt) {
      resourcesChanged = true;
      return { ...r, respawnAt: null };
    }
    return r;
  });
  if (resourcesChanged) nextHome = { ...nextHome, resources: respawned };

  // Walk one step if the cooldown is up.
  if (nextPlayer.route && nextPlayer.route.length > 0) {
    if (nextPlayer.stepCooldown > 0) {
      nextPlayer = { ...nextPlayer, stepCooldown: nextPlayer.stepCooldown - 1 };
    } else {
      const [next, ...rest] = nextPlayer.route;
      if (next) {
        const remaining = rest.length === 0 ? null : rest;
        nextPlayer = {
          ...nextPlayer,
          px: next.px,
          py: next.py,
          route: remaining,
          stepCooldown: remaining ? Math.max(1, nextPlayer.stats.speed) : 0,
        };
      }
    }
  }

  // Fire the queued action when we've arrived.
  if (nextPlayer.route === null && nextPlayer.pendingAction) {
    const action = nextPlayer.pendingAction;
    if (action.kind === "collect") {
      const result = tryCollect(ticks, nextHome, nextPlayer, nextInventory, action.resourceId);
      nextHome = result.home;
      nextPlayer = { ...result.player, pendingAction: null };
      nextInventory = result.inventory;
    } else {
      nextPlayer = { ...nextPlayer, pendingAction: null };
    }
  }

  return { home: nextHome, player: nextPlayer, inventory: nextInventory };
}

export function walkTo(
  home: HomeBase,
  player: Player,
  tx: number,
  ty: number,
  action: PendingAction | null = null,
): Player {
  if (tx === player.px && ty === player.py) {
    return { ...player, route: null, stepCooldown: 0, pendingAction: action };
  }
  const path = bfs(home.obstacles, HOME_GRID, HOME_GRID, player.px, player.py, tx, ty);
  if (!path || path.length === 0) {
    return { ...player, pendingAction: null };
  }
  return {
    ...player,
    route: path,
    stepCooldown: Math.max(1, player.stats.speed),
    pendingAction: action,
  };
}

export function tryCollect(
  ticks: number,
  home: HomeBase,
  player: Player,
  inventory: Inventory,
  resourceId: string,
): { home: HomeBase; player: Player; inventory: Inventory; ok: boolean } {
  if (player.energy < 1) return { home, player, inventory, ok: false };
  const idx = home.resources.findIndex((r) => r.id === resourceId);
  if (idx < 0) return { home, player, inventory, ok: false };
  const resource = home.resources[idx]!;
  if (resource.respawnAt !== null) return { home, player, inventory, ok: false };
  if (resource.px !== player.px || resource.py !== player.py) {
    return { home, player, inventory, ok: false };
  }

  const updated: HomeResource = { ...resource, respawnAt: ticks + RESOURCE_RESPAWN_TICKS };
  const resources = home.resources.slice();
  resources[idx] = updated;
  const nextHome: HomeBase = { ...home, resources };
  const nextPlayer: Player = { ...player, energy: player.energy - 1 };
  const nextInventory: Inventory = {
    ...inventory,
    [resource.kind]: (inventory[resource.kind] ?? 0) + 1,
  };
  return { home: nextHome, player: nextPlayer, inventory: nextInventory, ok: true };
}

export function resourceAt(home: HomeBase, px: number, py: number): HomeResource | null {
  return home.resources.find((r) => r.px === px && r.py === py) ?? null;
}

function scatterObstacles(
  rng: Rng,
  spawn: { px: number; py: number },
  target: number,
): boolean[] {
  const cells = HOME_GRID * HOME_GRID;
  const obstacles = new Array<boolean>(cells).fill(false);
  let placed = 0;
  let attempts = 0;
  while (placed < target && attempts < cells * 4) {
    attempts++;
    const px = rng.int(0, HOME_GRID);
    const py = rng.int(0, HOME_GRID);
    if (px === spawn.px && py === spawn.py) continue;
    const idx = py * HOME_GRID + px;
    if (obstacles[idx]) continue;
    obstacles[idx] = true;
    placed++;
  }
  return obstacles;
}

function spawnSurroundedByObstacles(
  obstacles: boolean[],
  spawn: { px: number; py: number },
): boolean {
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    const nx = spawn.px + dx;
    const ny = spawn.py + dy;
    if (nx < 0 || ny < 0 || nx >= HOME_GRID || ny >= HOME_GRID) continue;
    if (!obstacles[ny * HOME_GRID + nx]) return false;
  }
  return true;
}

function scatterResources(
  rng: Rng,
  biome: Biome,
  obstacles: boolean[],
  spawn: { px: number; py: number },
): HomeResource[] {
  const kinds = BIOME_RESOURCES[biome];
  if (kinds.length === 0) return [];
  const placed: HomeResource[] = [];
  let attempts = 0;
  const maxAttempts = HOME_GRID * HOME_GRID * 4;
  while (placed.length < RESOURCE_COUNT && attempts < maxAttempts) {
    attempts++;
    const px = rng.int(0, HOME_GRID);
    const py = rng.int(0, HOME_GRID);
    if (px === spawn.px && py === spawn.py) continue;
    const idx = py * HOME_GRID + px;
    if (obstacles[idx]) continue;
    if (placed.some((r) => r.px === px && r.py === py)) continue;
    if (!isReachable(obstacles, HOME_GRID, HOME_GRID, spawn.px, spawn.py, px, py)) continue;
    const kind = rng.pick(kinds);
    placed.push({
      id: `r-${placed.length}`,
      px,
      py,
      kind,
      respawnAt: null,
    });
  }
  return placed;
}
