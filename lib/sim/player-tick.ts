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
  lootAtLocal,
  removeLoot,
  regionKey,
  removeResource,
  resourceAtLocal,
  type BiomeInterior,
} from "@/lib/sim/biome-interior";
import type { Inventory } from "@/lib/sim/inventory";
import { RESOURCES, type ResourceKind } from "@/content/resources";
import type { Npc } from "@/lib/sim/npc";
import { applyRepPenalty, resolvePlayerAttack } from "@/lib/sim/combat";
import type { Rng } from "@/lib/sim/rng";

export type PlayerTickInput = {
  player: Player;
  interiors: Record<string, BiomeInterior>;
  inventory: Inventory;
  npcs: Npc[];
  playerReputation: Record<string, number>;
  rng: Rng;
};

export type PlayerTickOutput = {
  player: Player;
  interiors: Record<string, BiomeInterior>;
  inventory: Inventory;
  npcs: Npc[];
  playerReputation: Record<string, number>;
  death: boolean;
};

export function tickPlayer(input: PlayerTickInput): PlayerTickOutput {
  let { player, interiors, inventory, npcs, playerReputation } = input;
  const rng = input.rng;

  if (player.combatCooldown > 0) {
    player = { ...player, combatCooldown: player.combatCooldown - 1 };
  }

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
          // Auto-pickup loot at the new tile.
          const picked = pickupLoot(player, interiors, inventory);
          interiors = picked.interiors;
          inventory = picked.inventory;
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
    } else if (action.kind === "attack") {
      const targetIdx = npcs.findIndex((n) => n.id === action.npcId);
      if (targetIdx >= 0) {
        const target = npcs[targetIdx]!;
        const out = resolvePlayerAttack(player, target, rng);
        if (out.attacked) {
          player = out.player;
          if (out.repPenaltyAmount > 0) {
            playerReputation = applyRepPenalty(
              playerReputation,
              out.repPenaltyFactionId,
              out.repPenaltyAmount,
            );
          }
          if (out.npc.combatHealth <= 0) {
            // Dead NPC: drop loot in interior; remove from list.
            if (out.loot) {
              const k = regionKey(out.npc.rx, out.npc.ry);
              const interior = interiors[k];
              if (interior) {
                interiors = {
                  ...interiors,
                  [k]: { ...interior, loot: [...interior.loot, out.loot] },
                };
              }
            }
            const nextNpcs = npcs.slice();
            nextNpcs.splice(targetIdx, 1);
            npcs = nextNpcs;
          } else {
            const nextNpcs = npcs.slice();
            nextNpcs[targetIdx] = out.npc;
            npcs = nextNpcs;
          }
        }
      }
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
    npcs,
    playerReputation,
    death: player.health <= 0,
  };
}

export function setPendingCollect(player: Player, resourceId: string): Player {
  const action: PendingAction = { kind: "collect", resourceId };
  return { ...player, pendingAction: action };
}

export function setPendingAttack(player: Player, npcId: string): Player {
  const action: PendingAction = { kind: "attack", npcId };
  return { ...player, pendingAction: action, route: null, stepCooldown: 0 };
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

function pickupLoot(
  player: Player,
  interiors: Record<string, BiomeInterior>,
  inventory: Inventory,
): { interiors: Record<string, BiomeInterior>; inventory: Inventory } {
  const { rx, ry, lx, ly } = globalToLocal(player.gx, player.gy);
  const k = regionKey(rx, ry);
  const interior = interiors[k];
  if (!interior) return { interiors, inventory };
  const pile = lootAtLocal(interior, lx, ly);
  if (!pile) return { interiors, inventory };
  let nextInventory: Inventory = { ...inventory };
  for (const key of Object.keys(pile.items) as ResourceKind[]) {
    const amt = pile.items[key] ?? 0;
    if (amt <= 0) continue;
    nextInventory[key] = (nextInventory[key] ?? 0) + amt;
  }
  return {
    interiors: { ...interiors, [k]: removeLoot(interior, pile.id) },
    inventory: nextInventory,
  };
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
