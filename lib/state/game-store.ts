"use client";

import { create } from "zustand";
import {
  beginNewLife,
  claimRandomForestHome,
  createWorld,
  ensureInteriorsForRegion,
  tickWorld,
  WORLD_VERSION,
  MAP_W,
  MAP_H,
  type LifeState,
  type World,
} from "@/lib/sim/world";
import { loadWorld, saveWorld } from "@/lib/save/db";
import { bus } from "@/lib/render/bus";
import type { WorldEvent } from "@/lib/sim/events";
import { gainPlayerRep } from "@/lib/sim/faction";
import {
  findAdjacentPassable,
  findWorkbenchTile,
  globalToLocal,
  isLocalObstacle,
  localToGlobal,
  obstacleKindAt,
  placeObstacle,
  regionCenterGlobal,
  regionKey,
  resourceAtLocal,
  INTERIOR_W,
  INTERIOR_H,
  type ObstacleKind,
} from "@/lib/sim/biome-interior";
import { bfsPredicate } from "@/lib/sim/path";
import { chebyshev } from "@/lib/sim/combat";
import type { PendingAction, Player } from "@/lib/sim/player";
import { setPendingAttack } from "@/lib/sim/player-tick";
import {
  affordable,
  makeWeapon,
  spendRecipe,
} from "@/lib/sim/weapons";
import { makeTool } from "@/lib/sim/tools";
import { RECIPES_BY_ID } from "@/content/recipes";
import { RESOURCES, type ResourceKind } from "@/content/resources";
import { EAT_ENERGY_PER_FOOD, EAT_HEALTH_PER_FOOD } from "@/lib/sim/player";

const AUTOSAVE_EVERY_TICKS = 60;
export const WALK_MAX_RADIUS = 80;

export type SelectedRegion = { rx: number; ry: number };
export type View = "world" | "biome";

export type NpcContextMenu = { id: string; x: number; y: number };
export type ObstacleContextMenuState = {
  rx: number;
  ry: number;
  lx: number;
  ly: number;
  kind: ObstacleKind;
  x: number;
  y: number;
  remembered: boolean;
};

type GameStore = {
  world: World | null;
  paused: boolean;
  speed: number;
  selectedNpcId: string | null;
  selectedRegion: SelectedRegion | null;
  lastEvent: WorldEvent | null;
  view: View;
  inventoryOpen: boolean;
  workbenchOpen: boolean;
  pastLivesOpen: boolean;
  tutorialOpen: boolean;
  debugMode: boolean;
  debugMinimized: boolean;
  mapShowFactions: boolean;
  npcContextMenu: NpcContextMenu | null;
  obstacleContextMenu: ObstacleContextMenuState | null;
  pendingMarker: { rx: number; ry: number } | null;

  startNew: () => void;
  loadFromDisk: (slot: string) => Promise<void>;
  saveToDisk: (slot: string) => Promise<void>;

  tick: () => void;
  togglePause: () => void;
  setSpeed: (s: number) => void;
  selectNpc: (id: string | null) => void;
  selectRegion: (region: SelectedRegion | null) => void;

  setView: (v: View) => void;
  walkPlayerTo: (gx: number, gy: number) => void;
  travelToRegion: (rx: number, ry: number) => void;
  interactWithObstacle: (
    rx: number,
    ry: number,
    lx: number,
    ly: number,
    action: "harvest" | "workbench" | "deconstruct",
  ) => void;
  resetAfterDeath: () => void;

  acceptEncounter: () => void;
  dismissEncounter: () => void;

  craftRecipe: (recipeId: string) => boolean;
  attackNpc: (id: string) => void;

  openInventory: () => void;
  closeInventory: () => void;
  openWorkbench: () => void;
  closeWorkbench: () => void;
  openPastLives: () => void;
  closePastLives: () => void;
  openTutorial: () => void;
  closeTutorial: () => void;
  toggleDebug: () => void;
  toggleDebugMinimized: () => void;
  toggleMapFactions: () => void;
  openNpcContextMenu: (id: string, x: number, y: number) => void;
  closeNpcContextMenu: () => void;
  openObstacleContextMenu: (
    rx: number,
    ry: number,
    lx: number,
    ly: number,
    kind: ObstacleKind,
    x: number,
    y: number,
    remembered?: boolean,
  ) => void;
  closeObstacleContextMenu: () => void;
  eatFood: (kind: import("@/content/resources").ResourceKind) => void;
  teleportToRegion: (rx: number, ry: number) => void;
  inspectBiome: (rx: number, ry: number) => void;
  examineKind: (kind: string) => void;
  requestMarker: (rx: number, ry: number) => void;
  cancelMarker: () => void;
  addMapMarker: (rx: number, ry: number, name: string) => void;
  removeMapMarker: (id: string) => void;
};

function withLife(world: World, life: LifeState): World {
  return { ...world, life };
}

function withPlayer(world: World, player: Player): World | null {
  if (!world.life) return null;
  return withLife(world, { ...world.life, player });
}

export const useGameStore = create<GameStore>((set, get) => ({
  world: null,
  paused: false,
  speed: 1,
  selectedNpcId: null,
  selectedRegion: null,
  lastEvent: null,
  view: "world",
  inventoryOpen: false,
  workbenchOpen: false,
  pastLivesOpen: false,
  tutorialOpen: false,
  debugMode: false,
  debugMinimized: false,
  mapShowFactions: true,
  npcContextMenu: null,
  obstacleContextMenu: null,
  pendingMarker: null,

  startNew: () => {
    const fresh = createWorld();
    const claimed = claimRandomForestHome(fresh) ?? fresh;
    set({
      world: claimed,
      selectedNpcId: null,
      selectedRegion: null,
      lastEvent: null,
      paused: false,
      view: claimed.home ? "biome" : "world",
      inventoryOpen: false,
      workbenchOpen: false,
      pastLivesOpen: false,
      tutorialOpen: true,
      npcContextMenu: null,
      obstacleContextMenu: null,
    });
    void saveWorld("default", claimed);
  },

  loadFromDisk: async (slot) => {
    const loaded = await loadWorld(slot);
    if (loaded && loaded.version === WORLD_VERSION) {
      set({
        world: loaded,
        view: loaded.home ? "biome" : "world",
        paused: false,
      });
      return;
    }
    const fresh = createWorld();
    const claimed = claimRandomForestHome(fresh) ?? fresh;
    set({
      world: claimed,
      view: claimed.home ? "biome" : "world",
      paused: false,
    });
    void saveWorld(slot, claimed);
  },

  saveToDisk: async (slot) => {
    const w = get().world;
    if (w) await saveWorld(slot, w);
  },

  tick: () => {
    const current = get().world;
    if (!current) return;
    const { world, event, workbenchOpened } = tickWorld(current);
    const patch: Partial<GameStore> = {
      world,
      lastEvent: event ?? get().lastEvent,
    };
    const wasOver = current.life?.gameOver ?? false;
    const isOver = world.life?.gameOver ?? false;
    if (isOver && !wasOver) patch.paused = true;
    if (workbenchOpened) {
      patch.workbenchOpen = true;
      patch.selectedNpcId = null;
      patch.selectedRegion = null;
      patch.inventoryOpen = false;
      patch.pastLivesOpen = false;
      patch.npcContextMenu = null;
      patch.obstacleContextMenu = null;
    }
    set(patch);
    if (world.ticks % AUTOSAVE_EVERY_TICKS === 0) {
      void saveWorld("default", world);
    }
  },

  togglePause: () => set({ paused: !get().paused }),
  setSpeed: (s) => set({ speed: s }),

  selectNpc: (id) => {
    set({
      selectedNpcId: id,
      selectedRegion: id ? null : get().selectedRegion,
      obstacleContextMenu: id ? null : get().obstacleContextMenu,
      workbenchOpen: id ? false : get().workbenchOpen,
      pastLivesOpen: id ? false : get().pastLivesOpen,
    });
    if (!id) bus.emit("npc:deselected");
  },
  selectRegion: (region) => {
    set({
      selectedRegion: region,
      selectedNpcId: region ? null : get().selectedNpcId,
      obstacleContextMenu: region ? null : get().obstacleContextMenu,
      workbenchOpen: region ? false : get().workbenchOpen,
      pastLivesOpen: region ? false : get().pastLivesOpen,
    });
    if (region) bus.emit("npc:deselected");
  },

  setView: (v) => {
    if (v === get().view) return;
    set({
      view: v,
      selectedNpcId: null,
      selectedRegion: null,
      obstacleContextMenu: null,
      workbenchOpen: false,
    });
    bus.emit("npc:deselected");
  },

  walkPlayerTo: (gx, gy) => {
    const current = get().world;
    if (!current?.life || current.life.gameOver) return;

    const startingPlayer: Player = current.life.player;
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

    const next = withPlayer(world, player);
    if (next) set({ world: next });
  },

  travelToRegion: (rx, ry) => {
    const w = get().world;
    if (!w?.life || w.life.gameOver) return;
    set({
      view: "biome",
      selectedNpcId: null,
      selectedRegion: null,
      obstacleContextMenu: null,
      workbenchOpen: false,
    });
    bus.emit("npc:deselected");
    const seeded = ensureInteriorsForRegion(w, rx, ry);
    if (seeded !== w) set({ world: seeded });
    const interior = seeded.biomeInteriors[regionKey(rx, ry)];
    const center = regionCenterGlobal(rx, ry);
    const target = interior
      ? nearestPassable(interior, center.gx, center.gy, rx, ry)
      : center;
    get().walkPlayerTo(target.gx, target.gy);
  },

  interactWithObstacle: (rx, ry, lx, ly, action) => {
    const current = get().world;
    if (!current?.life || current.life.gameOver) return;
    let world = ensureInteriorsForRegion(current, rx, ry);
    const interior = world.biomeInteriors[regionKey(rx, ry)];
    if (!interior) return;
    const obstacle = obstacleKindAt(interior, lx, ly);
    if (!obstacle) {
      set({ obstacleContextMenu: null });
      return;
    }

    const startingPlayer = world.life!.player;
    const isObstacle = (tgx: number, tgy: number): boolean => {
      const loc = globalToLocal(tgx, tgy);
      if (loc.rx < 0 || loc.ry < 0 || loc.rx >= MAP_W || loc.ry >= MAP_H) return true;
      if (loc.lx < 0 || loc.ly < 0 || loc.lx >= INTERIOR_W || loc.ly >= INTERIOR_H) return true;
      const i2 = world.biomeInteriors[regionKey(loc.rx, loc.ry)];
      if (!i2) {
        const w2 = ensureInteriorsForRegion(world, loc.rx, loc.ry);
        if (w2 !== world) world = w2;
        const fresh = world.biomeInteriors[regionKey(loc.rx, loc.ry)];
        if (!fresh) return true;
        return isLocalObstacle(fresh, loc.lx, loc.ly);
      }
      return isLocalObstacle(i2, loc.lx, loc.ly);
    };

    let bestPath: Array<{ gx: number; gy: number }> | null = null;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const tlx = lx + dx;
        const tly = ly + dy;
        if (tlx < 0 || tly < 0 || tlx >= INTERIOR_W || tly >= INTERIOR_H) continue;
        if (isLocalObstacle(interior, tlx, tly)) continue;
        const tg = localToGlobal(rx, ry, tlx, tly);
        const path = bfsPredicate(
          isObstacle,
          startingPlayer.gx,
          startingPlayer.gy,
          tg.gx,
          tg.gy,
          WALK_MAX_RADIUS,
        );
        if (!path) continue;
        if (!bestPath || path.length < bestPath.length) bestPath = path;
      }
    }

    if (!bestPath) {
      set({ obstacleContextMenu: null });
      return;
    }

    let pendingAction: PendingAction;
    if (action === "harvest") {
      pendingAction = { kind: "harvest", rx, ry, lx, ly, obstacle };
    } else if (action === "deconstruct") {
      pendingAction = { kind: "deconstruct", rx, ry, lx, ly, obstacle };
    } else {
      pendingAction = { kind: "workbench", rx, ry, lx, ly };
    }

    const player: Player = {
      ...startingPlayer,
      route: bestPath.length === 0 ? null : bestPath,
      stepCooldown: bestPath.length === 0 ? 0 : Math.max(1, startingPlayer.stats.speed),
      pendingAction,
    };
    const next = withPlayer(world, player);
    if (!next) return;
    set({
      world: next,
      obstacleContextMenu: null,
      npcContextMenu: null,
    });
  },

  resetAfterDeath: () => {
    const current = get().world;
    if (!current) return;
    let next: World;
    if (current.home) {
      next = beginNewLife(current);
    } else {
      const fresh = createWorld();
      next = claimRandomForestHome(fresh) ?? fresh;
    }
    set({
      world: next,
      selectedNpcId: null,
      selectedRegion: null,
      lastEvent: null,
      paused: false,
      view: next.home ? "biome" : "world",
      inventoryOpen: false,
      workbenchOpen: false,
      pastLivesOpen: false,
      tutorialOpen: false,
      npcContextMenu: null,
      obstacleContextMenu: null,
    });
    void saveWorld("default", next);
  },

  acceptEncounter: () => {
    const current = get().world;
    const event = get().lastEvent;
    if (!current?.life || !event?.encounter) {
      set({ lastEvent: null });
      return;
    }
    const enc = event.encounter;
    if (enc.sentiment !== "friendly") {
      set({ lastEvent: null });
      return;
    }
    let inventory = current.life.inventory;
    if (enc.offer) {
      const prev = inventory[enc.offer.kind] ?? 0;
      inventory = { ...inventory, [enc.offer.kind]: prev + enc.offer.amount };
    }
    const playerReputation = gainPlayerRep(current.playerReputation, enc.factionId, 2);
    set({
      world: {
        ...current,
        playerReputation,
        life: { ...current.life, inventory },
      },
      lastEvent: null,
    });
  },

  dismissEncounter: () => set({ lastEvent: null }),

  craftRecipe: (recipeId) => {
    const current = get().world;
    if (!current?.life || current.life.gameOver) return false;
    const recipe = RECIPES_BY_ID[recipeId];
    if (!recipe) return false;
    const life = current.life;
    const here = globalToLocal(life.player.gx, life.player.gy);
    const interior = current.biomeInteriors[regionKey(here.rx, here.ry)];
    if (recipe.station === "workbench") {
      if (!interior) return false;
      const wb = findWorkbenchTile(interior);
      if (!wb || chebyshev(here.lx, here.ly, wb.lx, wb.ly) > 1) return false;
    }
    // Structures must place into the world before we spend inputs.
    let placedInteriors: Record<string, import("@/lib/sim/biome-interior").BiomeInterior> | null = null;
    if (recipe.result.kind === "structure") {
      if (!interior) return false;
      const slot = findAdjacentPassable(interior, here.lx, here.ly, 2);
      if (!slot) return false;
      const nextInterior = placeObstacle(interior, slot.lx, slot.ly, recipe.result.id);
      placedInteriors = {
        ...current.biomeInteriors,
        [regionKey(here.rx, here.ry)]: nextInterior,
      };
    }
    if (!affordable(life.inventory, recipe)) return false;
    const nextInventory = spendRecipe(life.inventory, recipe);
    if (!nextInventory) return false;
    let player: Player = life.player;
    if (recipe.result.kind === "weapon") {
      const w = makeWeapon(recipe.result.id);
      player = { ...player, weapons: [...player.weapons, w] };
    } else if (recipe.result.kind === "tool") {
      const t = makeTool(recipe.result.id);
      player = { ...player, tools: [...player.tools, t] };
    }
    set({
      world: {
        ...current,
        biomeInteriors: placedInteriors ?? current.biomeInteriors,
        ticks: current.ticks + recipe.time,
        life: { ...life, player, inventory: nextInventory },
      },
    });
    return true;
  },

  attackNpc: (id) => {
    const current = get().world;
    if (!current?.life || current.life.gameOver) return;
    const player = setPendingAttack(current.life.player, id);
    set({ world: { ...current, life: { ...current.life, player } } });
  },

  openInventory: () =>
    set({
      inventoryOpen: true,
      workbenchOpen: false,
      pastLivesOpen: false,
      selectedNpcId: null,
      selectedRegion: null,
      obstacleContextMenu: null,
      npcContextMenu: null,
    }),
  closeInventory: () => set({ inventoryOpen: false }),
  openWorkbench: () =>
    set({
      workbenchOpen: true,
      inventoryOpen: false,
      pastLivesOpen: false,
      selectedNpcId: null,
      selectedRegion: null,
      obstacleContextMenu: null,
      npcContextMenu: null,
    }),
  closeWorkbench: () => set({ workbenchOpen: false }),
  openPastLives: () =>
    set({
      pastLivesOpen: true,
      inventoryOpen: false,
      workbenchOpen: false,
      selectedNpcId: null,
      selectedRegion: null,
      obstacleContextMenu: null,
      npcContextMenu: null,
    }),
  closePastLives: () => set({ pastLivesOpen: false }),
  openTutorial: () => set({ tutorialOpen: true }),
  closeTutorial: () => set({ tutorialOpen: false }),
  toggleDebug: () => set({ debugMode: !get().debugMode }),
  toggleDebugMinimized: () => set({ debugMinimized: !get().debugMinimized }),
  toggleMapFactions: () => set({ mapShowFactions: !get().mapShowFactions }),

  openNpcContextMenu: (id, x, y) =>
    set({
      npcContextMenu: { id, x, y },
      obstacleContextMenu: null,
      selectedNpcId: null,
      selectedRegion: null,
      workbenchOpen: false,
    }),
  closeNpcContextMenu: () => set({ npcContextMenu: null }),

  openObstacleContextMenu: (rx, ry, lx, ly, kind, x, y, remembered = false) =>
    set({
      obstacleContextMenu: { rx, ry, lx, ly, kind, x, y, remembered },
      npcContextMenu: null,
      selectedNpcId: null,
      selectedRegion: null,
      inventoryOpen: false,
      workbenchOpen: false,
    }),
  closeObstacleContextMenu: () => set({ obstacleContextMenu: null }),

  eatFood: (kind: ResourceKind) => {
    const current = get().world;
    if (!current?.life || current.life.gameOver) return;
    if (!RESOURCES[kind].food) return;
    const life = current.life;
    const have = life.inventory[kind] ?? 0;
    if (have <= 0) return;
    const inventory = { ...life.inventory, [kind]: have - 1 };
    const player: Player = {
      ...life.player,
      energy: Math.min(life.player.energyMax, life.player.energy + EAT_ENERGY_PER_FOOD),
      health: Math.min(life.player.healthMax, life.player.health + EAT_HEALTH_PER_FOOD),
    };
    set({ world: { ...current, life: { ...life, player, inventory } } });
  },

  teleportToRegion: (rx, ry) => {
    const current = get().world;
    if (!current?.life || current.life.gameOver) return;
    const center = regionCenterGlobal(rx, ry);
    const seeded = ensureInteriorsForRegion(current, rx, ry);
    const interior = seeded.biomeInteriors[regionKey(rx, ry)];
    if (!interior) return;
    const target = nearestPassable(interior, center.gx, center.gy, rx, ry);
    const life = seeded.life!;
    const player: Player = {
      ...life.player,
      gx: target.gx,
      gy: target.gy,
      route: null,
      stepCooldown: 0,
      pendingAction: null,
    };
    set({
      world: { ...seeded, life: { ...life, player } },
      view: "biome",
      selectedNpcId: null,
      selectedRegion: null,
      obstacleContextMenu: null,
      workbenchOpen: false,
    });
    bus.emit("npc:deselected");
  },

  inspectBiome: (rx, ry) => {
    get().teleportToRegion(rx, ry);
  },

  examineKind: (kind) => {
    const current = get().world;
    if (!current) return;
    if (current.examinedKinds[kind]) return;
    set({
      world: {
        ...current,
        examinedKinds: { ...current.examinedKinds, [kind]: true as const },
      },
    });
  },

  requestMarker: (rx, ry) => set({ pendingMarker: { rx, ry } }),
  cancelMarker: () => set({ pendingMarker: null }),
  addMapMarker: (rx, ry, name) => {
    const current = get().world;
    if (!current) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    const id = `mk-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    set({
      world: {
        ...current,
        mapMarkers: [...current.mapMarkers, { id, rx, ry, name: trimmed }],
      },
      pendingMarker: null,
    });
  },
  removeMapMarker: (id) => {
    const current = get().world;
    if (!current) return;
    set({
      world: {
        ...current,
        mapMarkers: current.mapMarkers.filter((m) => m.id !== id),
      },
    });
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
