import type { WeaponInstance } from "@/lib/sim/weapons";
import type { ToolInstance } from "@/lib/sim/tools";
import type { ObstacleKind } from "@/lib/sim/biome-interior";

export type PlayerStats = {
  speed: number;
  perception: number;
  attack: number;
  defense: number;
  reach: number;
};

export type PendingAction =
  | { kind: "collect"; resourceId: string }
  | { kind: "attack"; npcId: string }
  | { kind: "harvest"; rx: number; ry: number; lx: number; ly: number; obstacle: ObstacleKind }
  | { kind: "workbench"; rx: number; ry: number; lx: number; ly: number }
  | {
      kind: "deconstruct";
      rx: number;
      ry: number;
      lx: number;
      ly: number;
      obstacle: ObstacleKind;
    };

export type Player = {
  gx: number;
  gy: number;
  energy: number;
  energyMax: number;
  energyAccumDrain: number;
  health: number;
  healthMax: number;
  starveAccum: number;
  stats: PlayerStats;
  weapons: WeaponInstance[];
  tools: ToolInstance[];
  combatCooldown: number;
  route: Array<{ gx: number; gy: number }> | null;
  stepCooldown: number;
  pendingAction: PendingAction | null;
};

export const ENERGY_MAX = 10;
export const HEALTH_MAX = 10;
export const BASE_SPEED_TICKS_PER_TILE = 2;
export const BASE_PERCEPTION = 6;
export const BASE_ATTACK = 1;
export const BASE_DEFENSE = 0;
export const BASE_REACH = 1;

export const WALK_ENERGY_PER_STEP = 0.3;
export const STARVE_TICKS_PER_DAMAGE = 80;
export const EAT_ENERGY_PER_FOOD = 3;
export const EAT_HEALTH_PER_FOOD = 1;

export function createPlayer(spawn: { gx: number; gy: number }): Player {
  return {
    gx: spawn.gx,
    gy: spawn.gy,
    energy: ENERGY_MAX,
    energyMax: ENERGY_MAX,
    energyAccumDrain: 0,
    health: HEALTH_MAX,
    healthMax: HEALTH_MAX,
    starveAccum: 0,
    stats: {
      speed: BASE_SPEED_TICKS_PER_TILE,
      perception: BASE_PERCEPTION,
      attack: BASE_ATTACK,
      defense: BASE_DEFENSE,
      reach: BASE_REACH,
    },
    weapons: [],
    tools: [],
    combatCooldown: 0,
    route: null,
    stepCooldown: 0,
    pendingAction: null,
  };
}
