import {
  STARVE_TICKS_PER_DAMAGE,
  WALK_ENERGY_PER_STEP,
  type PendingAction,
  type Player,
} from "@/lib/sim/player";
import {
  INTERIOR_W,
  INTERIOR_H,
  globalToLocal,
  isLocalObstacle,
  localToGlobal,
  lootAtLocal,
  removeLoot,
  regionKey,
  removeResource,
  resourceAtLocal,
  type BiomeInterior,
} from "@/lib/sim/biome-interior";
import type { Inventory } from "@/lib/sim/inventory";
import type { ResourceKind } from "@/content/resources";
import type { Npc } from "@/lib/sim/npc";
import { applyRepPenalty, resolvePlayerAttack, chebyshev } from "@/lib/sim/combat";
import { pickWeaponForRange, weaponReach } from "@/lib/sim/weapons";
import { bfs } from "@/lib/sim/path";
import type { Rng } from "@/lib/sim/rng";

export type PickupNotice = {
  kind: ResourceKind;
  amount: number;
};

export type PlayerTickInput = {
  player: Player;
  interiors: Record<string, BiomeInterior>;
  inventory: Inventory;
  npcs: Npc[];
  playerReputation: Record<string, number>;
  rng: Rng;
  ticks: number;
};

export type ProjectileNotice = {
  fromGx: number;
  fromGy: number;
  toGx: number;
  toGy: number;
};

export type PlayerTickOutput = {
  player: Player;
  interiors: Record<string, BiomeInterior>;
  inventory: Inventory;
  npcs: Npc[];
  playerReputation: Record<string, number>;
  pickups: PickupNotice[];
  projectiles: ProjectileNotice[];
  death: boolean;
};

export function tickPlayer(input: PlayerTickInput): PlayerTickOutput {
  let { player, interiors, inventory, npcs, playerReputation } = input;
  const rng = input.rng;
  const ticks = input.ticks;
  const pickups: PickupNotice[] = [];
  const projectiles: ProjectileNotice[] = [];

  if (player.combatCooldown > 0) {
    player = { ...player, combatCooldown: player.combatCooldown - 1 };
  }

  // Attack pending: keep chasing the NPC until they die, leave the region,
  // or the player cancels by walking somewhere else. We re-plot the route
  // each tick the player isn't already in reach.
  if (player.pendingAction?.kind === "attack") {
    const attackId = player.pendingAction.npcId;
    const target = npcs.find((n) => n.id === attackId);
    if (!target || target.combatHealth <= 0 || !target.interior) {
      player = { ...player, pendingAction: null, route: null, stepCooldown: 0 };
    } else {
      const here = globalToLocal(player.gx, player.gy);
      if (here.rx !== target.rx || here.ry !== target.ry) {
        // Target moved out of the player's region; abandon the chase.
        player = { ...player, pendingAction: null, route: null, stepCooldown: 0 };
      } else {
        const dist = chebyshev(here.lx, here.ly, target.interior.lx, target.interior.ly);
        const weapon = pickWeaponForRange(player.weapons, dist);
        const reach = weapon ? weaponReach(weapon) : player.stats.reach;
        if (dist > reach) {
          // Need to close the gap. Replot route only if we don't have one
          // ending within reach of the target's current tile.
          const rerouted = chasePlan(
            player,
            interiors,
            target,
            reach,
            here,
          );
          if (rerouted) player = rerouted;
        }
      }
    }
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
          player = picked.player;
          interiors = picked.interiors;
          inventory = picked.inventory;
          for (const p of picked.pickups) pickups.push(p);
        }
      }
    }
  }

  // Fire pending action when route empties.
  if (player.route === null && player.pendingAction) {
    const action = player.pendingAction;
    if (action.kind === "collect") {
      player = { ...player, pendingAction: null };
      const result = tryCollect(player, interiors, inventory, action.resourceId);
      player = result.player;
      interiors = result.interiors;
      inventory = result.inventory;
      if (result.pickup) pickups.push(result.pickup);
    } else if (action.kind === "attack") {
      const targetIdx = npcs.findIndex((n) => n.id === action.npcId);
      if (targetIdx >= 0) {
        const target = npcs[targetIdx]!;
        const out = resolvePlayerAttack(player, target, rng, ticks);
        if (out.attacked) {
          player = out.player;
          if (out.projectile) projectiles.push(out.projectile);
          if (out.repPenaltyAmount > 0) {
            playerReputation = applyRepPenalty(
              playerReputation,
              out.repPenaltyFactionId,
              out.repPenaltyAmount,
            );
          }
          // Keep pendingAction set so we keep chasing if the target is still
          // alive. resolvePlayerAttack already cleared it on success; restore
          // it unless the NPC died.
          if (out.npc.combatHealth > 0) {
            player = { ...player, pendingAction: action };
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
    pickups,
    projectiles,
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

// Plan a chase route to within `reach` of the NPC's current interior tile.
// Returns the player with an updated route, or null if no plan is needed
// (existing route already ends within reach of the target's current tile).
function chasePlan(
  player: Player,
  interiors: Record<string, BiomeInterior>,
  target: Npc,
  reach: number,
  here: { rx: number; ry: number; lx: number; ly: number },
): Player | null {
  if (!target.interior) return null;
  const interior = interiors[regionKey(here.rx, here.ry)];
  if (!interior) return null;

  // If we already have a route whose final step lands within reach of the
  // target's current tile, leave it alone.
  if (player.route && player.route.length > 0) {
    const last = player.route[player.route.length - 1]!;
    const lastLocal = globalToLocal(last.gx, last.gy);
    if (
      lastLocal.rx === target.rx &&
      lastLocal.ry === target.ry &&
      Math.max(
        Math.abs(lastLocal.lx - target.interior.lx),
        Math.abs(lastLocal.ly - target.interior.ly),
      ) <= reach
    ) {
      return null;
    }
  }

  // BFS over the interior obstacles, treating other NPC tiles as blocked.
  const occupied = interior.obstacles.slice();
  // Block other NPC tiles so we don't try to walk through them.
  // (We don't have full npcs here; the route walker treats live obstacle
  // collisions as a hard stop separately.)
  // Find a passable tile within reach of the target that has a path.
  const tx = target.interior.lx;
  const ty = target.interior.ly;
  let bestPath: Array<{ px: number; py: number }> | null = null;
  for (let r = 1; r <= reach && !bestPath; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const lx = tx + dx;
        const ly = ty + dy;
        if (lx < 0 || ly < 0 || lx >= INTERIOR_W || ly >= INTERIOR_H) continue;
        if (isLocalObstacle(interior, lx, ly)) continue;
        const path = bfs(occupied, INTERIOR_W, INTERIOR_H, here.lx, here.ly, lx, ly);
        if (!path) continue;
        if (!bestPath || path.length < bestPath.length) bestPath = path;
      }
    }
  }
  if (!bestPath) return null;
  const route = bestPath.map((p) => {
    const g = localToGlobal(here.rx, here.ry, p.px, p.py);
    return { gx: g.gx, gy: g.gy };
  });
  return {
    ...player,
    route: route.length === 0 ? null : route,
    stepCooldown: route.length === 0 ? 0 : Math.max(1, player.stats.speed),
  };
}

function tryCollect(
  player: Player,
  interiors: Record<string, BiomeInterior>,
  inventory: Inventory,
  resourceId: string,
): {
  player: Player;
  interiors: Record<string, BiomeInterior>;
  inventory: Inventory;
  pickup: PickupNotice | null;
} {
  const { rx, ry, lx, ly } = globalToLocal(player.gx, player.gy);
  const interior = interiors[regionKey(rx, ry)];
  if (!interior) return { player, interiors, inventory, pickup: null };
  const resource = resourceAtLocal(interior, lx, ly);
  if (!resource || resource.id !== resourceId) {
    return { player, interiors, inventory, pickup: null };
  }

  const updatedInterior = removeResource(interior, resource.id);
  const updatedInteriors = { ...interiors, [regionKey(rx, ry)]: updatedInterior };
  const updatedInventory: Inventory = {
    ...inventory,
    [resource.kind]: (inventory[resource.kind] ?? 0) + 1,
  };

  return {
    player,
    interiors: updatedInteriors,
    inventory: updatedInventory,
    pickup: { kind: resource.kind, amount: 1 },
  };
}

function pickupLoot(
  player: Player,
  interiors: Record<string, BiomeInterior>,
  inventory: Inventory,
): {
  player: Player;
  interiors: Record<string, BiomeInterior>;
  inventory: Inventory;
  pickups: PickupNotice[];
} {
  const { rx, ry, lx, ly } = globalToLocal(player.gx, player.gy);
  const k = regionKey(rx, ry);
  const interior = interiors[k];
  if (!interior) return { player, interiors, inventory, pickups: [] };
  const pile = lootAtLocal(interior, lx, ly);
  if (!pile) return { player, interiors, inventory, pickups: [] };
  const nextInventory: Inventory = { ...inventory };
  const pickups: PickupNotice[] = [];
  for (const key of Object.keys(pile.items) as ResourceKind[]) {
    const amt = pile.items[key] ?? 0;
    if (amt <= 0) continue;
    nextInventory[key] = (nextInventory[key] ?? 0) + amt;
    pickups.push({ kind: key, amount: amt });
  }
  let nextPlayer = player;
  if (pile.weapons && pile.weapons.length > 0) {
    nextPlayer = { ...player, weapons: [...player.weapons, ...pile.weapons] };
  }
  return {
    player: nextPlayer,
    interiors: { ...interiors, [k]: removeLoot(interior, pile.id) },
    inventory: nextInventory,
    pickups,
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
