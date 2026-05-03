"use client";

import { create } from "zustand";
import {
  claimHome as claimHomeWorld,
  createWorld,
  ensureInteriorsForRegion,
  tickWorld,
  WORLD_VERSION,
  MAP_W,
  MAP_H,
  type World,
} from "@/lib/sim/world";
import { loadWorld, saveWorld } from "@/lib/save/db";
import { bus } from "@/lib/render/bus";
import type { WorldEvent } from "@/lib/sim/events";
import { gainPlayerRep } from "@/lib/sim/faction";
import {
  globalToLocal,
  isLocalObstacle,
  regionCenterGlobal,
  regionKey,
  resourceAtLocal,
  INTERIOR_W,
  INTERIOR_H,
} from "@/lib/sim/biome-interior";
import { bfsPredicate } from "@/lib/sim/path";
import type { PendingAction, Player } from "@/lib/sim/player";
import { setPendingAttack } from "@/lib/sim/player-tick";
import {
  affordable,
  makeWeapon,
  spendRecipe,
} from "@/lib/sim/weapons";
import type { WeaponKind } from "@/content/weapons";

const AUTOSAVE_EVERY_TICKS = 60;
export const WALK_MAX_RADIUS = 80;

export type SelectedRegion = { rx: number; ry: number };
export type View = "world" | "biome";

type GameStore = {
  world: World | null;
  paused: boolean;
  speed: number;
  selectedNpcId: string | null;
  selectedRegion: SelectedRegion | null;
  lastEvent: WorldEvent | null;
  view: View;
  homePending: boolean;
  inventoryOpen: boolean;
  tutorialOpen: boolean;
  debugMode: boolean;

  startNew: () => void;
  loadFromDisk: (slot: string) => Promise<void>;
  saveToDisk: (slot: string) => Promise<void>;

  tick: () => void;
  togglePause: () => void;
  setSpeed: (s: number) => void;
  selectNpc: (id: string | null) => void;
  selectRegion: (region: SelectedRegion | null) => void;

  claimHome: (rx: number, ry: number) => void;
  setView: (v: View) => void;
  walkPlayerTo: (gx: number, gy: number) => void;
  travelToRegion: (rx: number, ry: number) => void;
  resetAfterDeath: () => void;

  acceptEncounter: () => void;
  dismissEncounter: () => void;

  craft: (kind: WeaponKind) => boolean;
  attackNpc: (id: string) => void;

  openInventory: () => void;
  closeInventory: () => void;
  openTutorial: () => void;
  closeTutorial: () => void;
  toggleDebug: () => void;
  teleportToRegion: (rx: number, ry: number) => void;
  inspectBiome: (rx: number, ry: number) => void;
};

export const useGameStore = create<GameStore>((set, get) => ({
  world: null,
  paused: false,
  speed: 1,
  selectedNpcId: null,
  selectedRegion: null,
  lastEvent: null,
  view: "world",
  homePending: false,
  inventoryOpen: false,
  tutorialOpen: false,
  debugMode: false,

  startNew: () => {
    set({
      world: createWorld(),
      selectedNpcId: null,
      selectedRegion: null,
      lastEvent: null,
      paused: false,
      view: "world",
      homePending: true,
      inventoryOpen: false,
      tutorialOpen: true,
    });
  },

  loadFromDisk: async (slot) => {
    const loaded = await loadWorld(slot);
    if (loaded && loaded.version === WORLD_VERSION) {
      set({
        world: loaded,
        view: loaded.home ? "biome" : "world",
        homePending: !loaded.home,
        paused: false,
      });
    } else {
      set({ world: createWorld(), view: "world", homePending: true, paused: false });
    }
  },

  saveToDisk: async (slot) => {
    const w = get().world;
    if (w) await saveWorld(slot, w);
  },

  tick: () => {
    const current = get().world;
    if (!current) return;
    const { world, event } = tickWorld(current);
    const patch: Partial<GameStore> = {
      world,
      lastEvent: event ?? get().lastEvent,
    };
    if (world.gameOver && !current.gameOver) patch.paused = true;
    set(patch);
    if (world.ticks % AUTOSAVE_EVERY_TICKS === 0) {
      void saveWorld("default", world);
    }
  },

  togglePause: () => set({ paused: !get().paused }),
  setSpeed: (s) => set({ speed: s }),

  selectNpc: (id) => {
    set({ selectedNpcId: id, selectedRegion: id ? null : get().selectedRegion });
    if (!id) bus.emit("npc:deselected");
  },
  selectRegion: (region) => {
    set({ selectedRegion: region, selectedNpcId: region ? null : get().selectedNpcId });
    if (region) bus.emit("npc:deselected");
  },

  claimHome: (rx, ry) => {
    const current = get().world;
    if (!current) return;
    const next = claimHomeWorld(current, rx, ry);
    if (!next) return;
    set({
      world: next,
      homePending: false,
      view: "biome",
      selectedNpcId: null,
      selectedRegion: null,
    });
    void saveWorld("default", next);
  },

  setView: (v) => {
    if (v === get().view) return;
    set({ view: v, selectedNpcId: null, selectedRegion: null });
    bus.emit("npc:deselected");
  },

  walkPlayerTo: (gx, gy) => {
    const current = get().world;
    if (!current || !current.player) return;
    if (current.gameOver) return;

    // Make sure source + target regions (and a small buffer around the
    // target) are generated before BFS reads obstacles. Without this,
    // unvisited tiles look passable, which would break "feels like a wall".
    const startingPlayer: Player = current.player;
    let world = current;
    const src = globalToLocal(startingPlayer.gx, startingPlayer.gy);
    const dst = globalToLocal(gx, gy);
    world = ensureInteriorsForRegion(world, src.rx, src.ry);
    world = ensureInteriorsForRegion(world, dst.rx, dst.ry);

    const isObstacle = (tgx: number, tgy: number): boolean => {
      const { rx, ry, lx, ly } = globalToLocal(tgx, tgy);
      if (rx < 0 || ry < 0 || rx >= MAP_W || ry >= MAP_H) return true;
      if (lx < 0 || ly < 0 || lx >= INTERIOR_W || ly >= INTERIOR_H) return true;
      const interior = world.biomeInteriors[regionKey(rx, ry)];
      if (!interior) {
        const w2 = ensureInteriorsForRegion(world, rx, ry);
        if (w2 !== world) world = w2;
        const fresh = world.biomeInteriors[regionKey(rx, ry)];
        if (!fresh) return true;
        return isLocalObstacle(fresh, lx, ly);
      }
      return isLocalObstacle(interior, lx, ly);
    };

    const path = bfsPredicate(
      isObstacle,
      startingPlayer.gx,
      startingPlayer.gy,
      gx,
      gy,
      WALK_MAX_RADIUS,
    );

    let pendingAction: PendingAction | null = null;
    if (path) {
      const interior = world.biomeInteriors[regionKey(dst.rx, dst.ry)];
      if (interior) {
        const r = resourceAtLocal(interior, dst.lx, dst.ly);
        if (r) pendingAction = { kind: "collect", resourceId: r.id };
      }
    }

    const player: Player = path
      ? {
          ...startingPlayer,
          route: path.length === 0 ? null : path,
          stepCooldown: path.length === 0 ? 0 : Math.max(1, startingPlayer.stats.speed),
          pendingAction,
        }
      : { ...startingPlayer, pendingAction: null };

    set({ world: { ...world, player } });
  },

  travelToRegion: (rx, ry) => {
    const w = get().world;
    if (!w?.player || w.gameOver) return;
    set({
      view: "biome",
      selectedNpcId: null,
      selectedRegion: null,
    });
    bus.emit("npc:deselected");
    const center = regionCenterGlobal(rx, ry);
    get().walkPlayerTo(center.gx, center.gy);
  },

  resetAfterDeath: () => {
    set({
      world: createWorld(),
      selectedNpcId: null,
      selectedRegion: null,
      lastEvent: null,
      paused: false,
      view: "world",
      homePending: true,
      inventoryOpen: false,
      tutorialOpen: false,
    });
  },

  acceptEncounter: () => {
    const current = get().world;
    const event = get().lastEvent;
    if (!current || !event?.encounter) {
      set({ lastEvent: null });
      return;
    }
    const enc = event.encounter;
    if (enc.sentiment !== "friendly") {
      set({ lastEvent: null });
      return;
    }
    let inventory = current.inventory;
    if (enc.offer) {
      const prev = inventory[enc.offer.kind] ?? 0;
      inventory = { ...inventory, [enc.offer.kind]: prev + enc.offer.amount };
    }
    const playerReputation = gainPlayerRep(current.playerReputation, enc.factionId, 2);
    set({ world: { ...current, inventory, playerReputation }, lastEvent: null });
  },

  dismissEncounter: () => set({ lastEvent: null }),

  craft: (kind) => {
    const current = get().world;
    if (!current?.player) return false;
    if (!affordable(current.inventory, kind)) return false;
    const nextInventory = spendRecipe(current.inventory, kind);
    if (!nextInventory) return false;
    const weapon = makeWeapon(kind);
    const player: Player = {
      ...current.player,
      weapons: [...current.player.weapons, weapon],
    };
    set({ world: { ...current, inventory: nextInventory, player } });
    return true;
  },

  attackNpc: (id) => {
    const current = get().world;
    if (!current?.player || current.gameOver) return;
    const player = setPendingAttack(current.player, id);
    set({ world: { ...current, player } });
  },

  openInventory: () =>
    set({
      inventoryOpen: true,
      selectedNpcId: null,
      selectedRegion: null,
    }),
  closeInventory: () => set({ inventoryOpen: false }),
  openTutorial: () => set({ tutorialOpen: true }),
  closeTutorial: () => set({ tutorialOpen: false }),
  toggleDebug: () => set({ debugMode: !get().debugMode }),

  teleportToRegion: (rx, ry) => {
    const current = get().world;
    if (!current?.player || current.gameOver) return;
    const center = regionCenterGlobal(rx, ry);
    const seeded = ensureInteriorsForRegion(current, rx, ry);
    const interior = seeded.biomeInteriors[regionKey(rx, ry)];
    if (!interior) return;
    const target = nearestPassable(interior, center.gx, center.gy, rx, ry);
    const player: Player = {
      ...seeded.player!,
      gx: target.gx,
      gy: target.gy,
      route: null,
      stepCooldown: 0,
      pendingAction: null,
    };
    set({
      world: { ...seeded, player },
      view: "biome",
      selectedNpcId: null,
      selectedRegion: null,
    });
    bus.emit("npc:deselected");
  },

  inspectBiome: (rx, ry) => {
    get().teleportToRegion(rx, ry);
  },
}));

function nearestPassable(
  interior: import("@/lib/sim/biome-interior").BiomeInterior,
  gx: number,
  gy: number,
  rx: number,
  ry: number,
): { gx: number; gy: number } {
  for (let r = 0; r <= 8; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const tgx = gx + dx;
        const tgy = gy + dy;
        const lx = tgx - rx * INTERIOR_W;
        const ly = tgy - ry * INTERIOR_H;
        if (lx < 0 || ly < 0 || lx >= INTERIOR_W || ly >= INTERIOR_H) continue;
        if (!isLocalObstacle(interior, lx, ly)) return { gx: tgx, gy: tgy };
      }
    }
  }
  return { gx, gy };
}
