export type PlayerStats = {
  // Ticks the walker waits between adjacent steps. Lower = faster.
  speed: number;
};

export type PendingAction = { kind: "collect"; resourceId: string };

export type Player = {
  px: number;
  py: number;
  energy: number;
  energyMax: number;
  energyRegenAccum: number;
  stats: PlayerStats;
  route: Array<{ px: number; py: number }> | null;
  stepCooldown: number;
  pendingAction: PendingAction | null;
};

export const BASE_SPEED_TICKS_PER_TILE = 2;
export const ENERGY_MAX = 8;
export const ENERGY_REGEN_TICKS = 20;

export function createPlayer(spawn: { px: number; py: number }): Player {
  return {
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
}
