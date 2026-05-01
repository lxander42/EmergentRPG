import {
  EAT_ENERGY_PER_FOOD,
  EAT_HEALTH_PER_FOOD,
  STARVE_TICKS_PER_DAMAGE,
  WALK_ENERGY_PER_STEP,
  type PendingAction,
  type Player,
} from "@/lib/sim/player";
import {
  globalToLocal,
  isLocalObstacle,
  regionKey,
  removeResource,
  resourceAtLocal,
  type BiomeInterior,
} from "@/lib/sim/biome-interior";
import type { Inventory } from "@/lib/sim/inventory";
import { RESOURCES } from "@/content/resources";

export type PlayerTickInput = {
  player: Player;
  interiors: Record<string, BiomeInterior>;
  inventory: Inventory;
};

export type PlayerTickOutput = {
  player: Player;
  interiors: Record<string, BiomeInterior>;
  inventory: Inventory;
  death: boolean;
};

export function tickPlayer(input: PlayerTickInput): PlayerTickOutput {
  let { player, interiors, inventory } = input;

  // Walk one step when the cooldown is up.
  if (player.route && player.route.length > 0) {
    if (player.stepCooldown > 0) {
      player = { ...player, stepCooldown: player.stepCooldown - 1 };
    } else {
      const [next, ...rest] = player.route;
      if (next) {
        const blocked = isStepBlocked(interiors, next.gx, next.gy);
        if (blocked) {
          player = { ...player, route: null, stepCooldown: 0, pendingAction: null };
        } else {
          const remaining = rest.length === 0 ? null : rest;
          const accum = player.energyAccumDrain + WALK_ENERGY_PER_STEP;
          let energy = player.energy;
          let nextAccum = accum;
          while (nextAccum >= 1 && energy > 0) {
            energy -= 1;
            nextAccum -= 1;
          }
          if (energy === 0) nextAccum = 0;
          player = {
            ...player,
            gx: next.gx,
            gy: next.gy,
            route: remaining,
            stepCooldown: remaining ? Math.max(1, player.stats.speed) : 0,
            energy,
            energyAccumDrain: nextAccum,
          };
        }
      }
    }
  }

  // Fire pending action when route empties.
  if (player.route === null && player.pendingAction) {
    const action = player.pendingAction;
    player = { ...player, pendingAction: null };
    if (action.kind === "collect") {
      const result = tryCollect(player, interiors, inventory, action.resourceId);
      player = result.player;
      interiors = result.interiors;
      inventory = result.inventory;
    }
  }

  // Starvation: at zero energy, accumulate damage; reset when fed.
  if (player.energy === 0) {
    const accum = player.starveAccum + 1;
    if (accum >= STARVE_TICKS_PER_DAMAGE) {
      const health = Math.max(0, player.health - 1);
      player = { ...player, health, starveAccum: 0 };
    } else {
      player = { ...player, starveAccum: accum };
    }
  } else if (player.starveAccum > 0) {
    player = { ...player, starveAccum: 0 };
  }

  return {
    player,
    interiors,
    inventory,
    death: player.health <= 0,
  };
}

export function setPendingCollect(player: Player, resourceId: string): Player {
  const action: PendingAction = { kind: "collect", resourceId };
  return { ...player, pendingAction: action };
}

function tryCollect(
  player: Player,
  interiors: Record<string, BiomeInterior>,
  inventory: Inventory,
  resourceId: string,
): { player: Player; interiors: Record<string, BiomeInterior>; inventory: Inventory } {
  const { rx, ry, lx, ly } = globalToLocal(player.gx, player.gy);
  const interior = interiors[regionKey(rx, ry)];
  if (!interior) return { player, interiors, inventory };
  const resource = resourceAtLocal(interior, lx, ly);
  if (!resource || resource.id !== resourceId) return { player, interiors, inventory };

  const meta = RESOURCES[resource.kind];
  const updatedInterior = removeResource(interior, resource.id);
  const updatedInteriors = { ...interiors, [regionKey(rx, ry)]: updatedInterior };
  const updatedInventory: Inventory = {
    ...inventory,
    [resource.kind]: (inventory[resource.kind] ?? 0) + 1,
  };

  let nextPlayer = player;
  if (meta.food) {
    nextPlayer = {
      ...player,
      energy: Math.min(player.energyMax, player.energy + EAT_ENERGY_PER_FOOD),
      health: Math.min(player.healthMax, player.health + EAT_HEALTH_PER_FOOD),
    };
  }

  return { player: nextPlayer, interiors: updatedInteriors, inventory: updatedInventory };
}

function isStepBlocked(
  interiors: Record<string, BiomeInterior>,
  gx: number,
  gy: number,
): boolean {
  const { rx, ry, lx, ly } = globalToLocal(gx, gy);
  const interior = interiors[regionKey(rx, ry)];
  if (!interior) return false;
  return isLocalObstacle(interior, lx, ly);
}
