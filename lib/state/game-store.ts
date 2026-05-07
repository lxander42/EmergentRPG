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
  addLoot,
  findAdjacentPassable,
  findWorkbenchTile,
  globalToLocal,
  isLocalObstacle,
  localToGlobal,
  lootAtLocal,
  obstacleKindAt,
  placeObstacle,
  placedStructureAt,
  placedStructureById,
  regionCenterGlobal,
  regionKey,
  removeLoot,
  tileOccupied,
  INTERIOR_W,
  INTERIOR_H,
  type LootPile,
  type ObstacleKind,
  type Rotation,
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
import { makeTool, type ToolKind } from "@/lib/sim/tools";
import { RECIPES_BY_ID, type StructureKind } from "@/content/recipes";
import { RESOURCES, type ResourceKind } from "@/content/resources";
import { EAT_ENERGY_PER_FOOD, EAT_HEALTH_PER_FOOD } from "@/lib/sim/player";

const AUTOSAVE_EVERY_TICKS = 60;
export const WALK_MAX_RADIUS = 80;

export type SelectedRegion = { rx: number; ry: number };
export type View = "world" | "biome";

export type NpcContextMenu = { id: string; x: number; y: number };
export type StatusMessage = {
  id: number;
  text: string;
  addedAt: number;
};

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

// Rotation index 0..3 cycles south, east, north, west (clockwise) and
// pins the placed structure against that tile edge. Persisted on
// PlacedStructure via `orientation` and on obstacle-grid kinds (workbench)
// via `obstacleRotations`.
export type BuildRotation = Rotation;

export type BuildModeState = {
  active: boolean;
  selectedKind: StructureKind | null;
  selectedTile: { rx: number; ry: number; lx: number; ly: number } | null;
  rotation: BuildRotation;
};

export type PlacedStructureContextMenuState = {
  rx: number;
  ry: number;
  lx: number;
  ly: number;
  structureId: string;
  kind: StructureKind;
  x: number;
  y: number;
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
  debugBubblePos: { x: number; y: number } | null;
  mapShowFactions: boolean;
  npcContextMenu: NpcContextMenu | null;
  obstacleContextMenu: ObstacleContextMenuState | null;
  placedStructureContextMenu: PlacedStructureContextMenuState | null;
  buildMode: BuildModeState;
  pendingMarker: { rx: number; ry: number } | null;
  pendingDrop: { kind: ResourceKind; max: number } | null;
  hudMenuOpen: boolean;
  statusMessages: StatusMessage[];
  cameraPanned: boolean;
  // One-shot guard: when an overlay is dismissed by tapping outside it, the
  // same DOM tap would otherwise reach Phaser's pointerup handler and walk
  // the player. The outside-close hook sets this true; BiomeScene/WorldScene
  // consume it on the next pointerup.
  swallowNextWorldTap: boolean;

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
  setDebugMode: (on: boolean) => void;
  toggleDebugMinimized: () => void;
  setDebugBubblePos: (x: number, y: number) => void;
  requestDropConfirm: (kind: ResourceKind, max: number) => void;
  cancelDrop: () => void;
  confirmDrop: (qty: number) => void;
  dropInventoryItem: (kind: ResourceKind, qty: number) => void;
  setSwallowNextWorldTap: (v: boolean) => void;
  setHudMenuOpen: (v: boolean) => void;
  debugGrantTool: (kind: ToolKind) => void;
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
  openPlacedStructureContextMenu: (
    rx: number,
    ry: number,
    lx: number,
    ly: number,
    structureId: string,
    kind: StructureKind,
    x: number,
    y: number,
  ) => void;
  closePlacedStructureContextMenu: () => void;
  interactWithPlacedStructure: (
    rx: number,
    ry: number,
    structureId: string,
    action: "deconstruct",
  ) => void;
  enterBuildMode: () => void;
  exitBuildMode: () => void;
  selectBuildKind: (kind: StructureKind | null) => void;
  selectBuildTile: (rx: number, ry: number, lx: number, ly: number) => void;
  cycleBuildRotation: () => void;
  confirmPlaceStructure: () => void;
  eatFood: (kind: import("@/content/resources").ResourceKind) => void;
  teleportToRegion: (rx: number, ry: number) => void;
  inspectBiome: (rx: number, ry: number) => void;
  examineKind: (kind: string) => void;
  requestMarker: (rx: number, ry: number) => void;
  cancelMarker: () => void;
  addMapMarker: (rx: number, ry: number, name: string) => void;
  removeMapMarker: (id: string) => void;
  pushStatus: (text: string) => void;
  dismissStatus: (id: number) => void;
  collectResourceAt: (
    rx: number,
    ry: number,
    lx: number,
    ly: number,
    resourceId: string,
  ) => void;
  pickupLootAt: (
    rx: number,
    ry: number,
    lx: number,
    ly: number,
    lootId: string,
  ) => void;
  setCameraPanned: (panned: boolean) => void;
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
  debugMinimized: true,
  debugBubblePos: null,
  mapShowFactions: true,
  npcContextMenu: null,
  obstacleContextMenu: null,
  placedStructureContextMenu: null,
  buildMode: { active: false, selectedKind: null, selectedTile: null, rotation: 0 },
  pendingMarker: null,
  pendingDrop: null,
  hudMenuOpen: false,
  statusMessages: [],
  cameraPanned: false,
  swallowNextWorldTap: false,

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
      placedStructureContextMenu: null,
      buildMode: { active: false, selectedKind: null, selectedTile: null, rotation: 0 },
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

    const player: Player = path
      ? {
          ...startingPlayer,
          route: path.length === 0 ? null : path,
          stepCooldown: path.length === 0 ? 0 : Math.max(1, startingPlayer.stats.speed),
          pendingAction: null,
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
      placedStructureContextMenu: null,
      buildMode: { active: false, selectedKind: null, selectedTile: null, rotation: 0 },
      // Resume auto-follow so the camera centres on the respawned player
      // instead of holding wherever the previous life died.
      cameraPanned: false,
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
    // Structures must place into the world before we spend inputs. Only
    // the workbench currently lives in the obstacle grid; other structure
    // kinds in StructureKind land via the build-mode placement UI in B2.
    let placedInteriors: Record<string, import("@/lib/sim/biome-interior").BiomeInterior> | null = null;
    if (recipe.result.kind === "structure") {
      if (!interior) return false;
      if (recipe.result.id !== "workbench") return false;
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
  setDebugMode: (on) => {
    if (get().debugMode === on) return;
    set({ debugMode: on });
  },
  toggleDebugMinimized: () => set({ debugMinimized: !get().debugMinimized }),
  setDebugBubblePos: (x, y) => set({ debugBubblePos: { x, y } }),

  requestDropConfirm: (kind, max) => {
    if (max <= 0) return;
    set({ pendingDrop: { kind, max } });
  },
  cancelDrop: () => set({ pendingDrop: null }),
  confirmDrop: (qty) => {
    const pending = get().pendingDrop;
    if (!pending) return;
    set({ pendingDrop: null });
    get().dropInventoryItem(pending.kind, qty);
  },
  dropInventoryItem: (kind, qty) => {
    if (qty <= 0) return;
    const current = get().world;
    if (!current?.life || current.life.gameOver) return;
    const life = current.life;
    const have = life.inventory[kind] ?? 0;
    if (have <= 0) return;
    const drop = Math.min(qty, have);
    const remainder = have - drop;
    const inventory = { ...life.inventory };
    if (remainder > 0) inventory[kind] = remainder;
    else delete inventory[kind];

    const here = globalToLocal(life.player.gx, life.player.gy);
    let world = ensureInteriorsForRegion(current, here.rx, here.ry);
    const interior = world.biomeInteriors[regionKey(here.rx, here.ry)];
    if (!interior) return;
    const existing = lootAtLocal(interior, here.lx, here.ly);
    let nextInterior;
    if (existing) {
      const merged: LootPile = {
        ...existing,
        items: { ...existing.items, [kind]: (existing.items[kind] ?? 0) + drop },
      };
      const without = removeLoot(interior, existing.id);
      nextInterior = addLoot(without, merged);
    } else {
      const id = `drop-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const pile: LootPile = {
        id,
        lx: here.lx,
        ly: here.ly,
        items: { [kind]: drop },
      };
      nextInterior = addLoot(interior, pile);
    }
    world = {
      ...world,
      biomeInteriors: {
        ...world.biomeInteriors,
        [regionKey(here.rx, here.ry)]: nextInterior,
      },
    };
    set({
      world: { ...world, life: { ...life, inventory } },
    });
    const label = RESOURCES[kind].label;
    get().pushStatus(`Dropped ${drop} ${label}.`);
  },
  setSwallowNextWorldTap: (v) => {
    if (get().swallowNextWorldTap === v) return;
    set({ swallowNextWorldTap: v });
  },
  setHudMenuOpen: (v) => {
    if (get().hudMenuOpen === v) return;
    set({ hudMenuOpen: v });
  },
  debugGrantTool: (kind) => {
    const current = get().world;
    if (!current?.life || current.life.gameOver) return;
    const life = current.life;
    const player: Player = {
      ...life.player,
      tools: [...life.player.tools, makeTool(kind)],
    };
    set({ world: { ...current, life: { ...life, player } } });
  },
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
      placedStructureContextMenu: null,
      npcContextMenu: null,
      selectedNpcId: null,
      selectedRegion: null,
      inventoryOpen: false,
      workbenchOpen: false,
    }),
  closeObstacleContextMenu: () => set({ obstacleContextMenu: null }),

  openPlacedStructureContextMenu: (rx, ry, lx, ly, structureId, kind, x, y) =>
    set({
      placedStructureContextMenu: { rx, ry, lx, ly, structureId, kind, x, y },
      obstacleContextMenu: null,
      npcContextMenu: null,
      selectedNpcId: null,
      selectedRegion: null,
      inventoryOpen: false,
      workbenchOpen: false,
    }),
  closePlacedStructureContextMenu: () => set({ placedStructureContextMenu: null }),

  enterBuildMode: () => {
    if (get().view !== "biome") return;
    set({
      buildMode: { active: true, selectedKind: null, selectedTile: null, rotation: 0 },
      inventoryOpen: false,
      workbenchOpen: false,
      pastLivesOpen: false,
      obstacleContextMenu: null,
      placedStructureContextMenu: null,
      npcContextMenu: null,
      selectedNpcId: null,
      selectedRegion: null,
    });
  },
  exitBuildMode: () =>
    set({
      buildMode: { active: false, selectedKind: null, selectedTile: null, rotation: 0 },
    }),
  selectBuildKind: (kind) => {
    const bm = get().buildMode;
    if (!bm.active) return;
    set({ buildMode: { ...bm, selectedKind: kind, selectedTile: null } });
  },
  cycleBuildRotation: () => {
    const bm = get().buildMode;
    if (!bm.active) return;
    const next = ((bm.rotation + 1) % 4) as BuildRotation;
    set({ buildMode: { ...bm, rotation: next } });
  },
  selectBuildTile: (rx, ry, lx, ly) => {
    const bm = get().buildMode;
    if (!bm.active || !bm.selectedKind) return;
    const w = get().world;
    if (!w?.life) return;
    const here = globalToLocal(w.life.player.gx, w.life.player.gy);
    if (here.rx !== rx || here.ry !== ry) return;
    const interior = w.biomeInteriors[regionKey(rx, ry)];
    if (!interior) return;
    if (tileOccupied(interior, lx, ly)) return;
    set({ buildMode: { ...bm, selectedTile: { rx, ry, lx, ly } } });
  },
  confirmPlaceStructure: () => {
    const bm = get().buildMode;
    if (!bm.active || !bm.selectedKind || !bm.selectedTile) return;
    const current = get().world;
    if (!current?.life || current.life.gameOver) return;
    const { rx, ry, lx, ly } = bm.selectedTile;
    const kind = bm.selectedKind;
    let world = ensureInteriorsForRegion(current, rx, ry);
    const interior = world.biomeInteriors[regionKey(rx, ry)];
    if (!interior) return;
    if (tileOccupied(interior, lx, ly)) {
      set({ buildMode: { ...bm, selectedTile: null } });
      return;
    }
    const recipe = RECIPES_BY_ID[kind];
    if (!recipe || recipe.result.kind !== "structure") return;
    if (!affordable(current.life.inventory, recipe)) return;

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
    if (!bestPath) return;

    const player: Player = {
      ...startingPlayer,
      route: bestPath.length === 0 ? null : bestPath,
      stepCooldown: bestPath.length === 0 ? 0 : Math.max(1, startingPlayer.stats.speed),
      pendingAction: {
        kind: "place",
        rx,
        ry,
        lx,
        ly,
        structureKind: kind,
        rotation: bm.rotation,
      },
    };
    const next = withPlayer(world, player);
    if (!next) return;
    set({
      world: next,
      buildMode: { active: false, selectedKind: null, selectedTile: null, rotation: 0 },
    });
  },

  interactWithPlacedStructure: (rx, ry, structureId, action) => {
    const current = get().world;
    if (!current?.life || current.life.gameOver) return;
    let world = ensureInteriorsForRegion(current, rx, ry);
    const interior = world.biomeInteriors[regionKey(rx, ry)];
    if (!interior) return;
    const target = placedStructureById(interior, structureId);
    if (!target) {
      set({ placedStructureContextMenu: null });
      return;
    }
    const { lx, ly } = target;

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
        if (placedStructureAt(interior, tlx, tly) != null) continue;
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
      set({ placedStructureContextMenu: null });
      return;
    }

    const player: Player = {
      ...startingPlayer,
      route: bestPath.length === 0 ? null : bestPath,
      stepCooldown: bestPath.length === 0 ? 0 : Math.max(1, startingPlayer.stats.speed),
      pendingAction:
        action === "deconstruct"
          ? { kind: "deconstruct", rx, ry, lx, ly, structureId }
          : null,
    };
    const next = withPlayer(world, player);
    if (!next) return;
    set({
      world: next,
      placedStructureContextMenu: null,
      obstacleContextMenu: null,
      npcContextMenu: null,
    });
  },

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

  pushStatus: (text) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    const next = [...get().statusMessages, { id, text, addedAt: Date.now() }];
    set({ statusMessages: next.slice(-6) });
  },
  dismissStatus: (id) => {
    set({ statusMessages: get().statusMessages.filter((m) => m.id !== id) });
  },

  collectResourceAt: (rx, ry, lx, ly, resourceId) => {
    const current = get().world;
    if (!current?.life || current.life.gameOver) return;
    const target = localToGlobal(rx, ry, lx, ly);
    let world = ensureInteriorsForRegion(current, rx, ry);
    const startingPlayer = world.life!.player;
    const isObstacle = (tgx: number, tgy: number): boolean => {
      const loc = globalToLocal(tgx, tgy);
      if (loc.rx < 0 || loc.ry < 0 || loc.rx >= MAP_W || loc.ry >= MAP_H) return true;
      if (loc.lx < 0 || loc.ly < 0 || loc.lx >= INTERIOR_W || loc.ly >= INTERIOR_H) return true;
      const interior = world.biomeInteriors[regionKey(loc.rx, loc.ry)];
      if (!interior) {
        const w2 = ensureInteriorsForRegion(world, loc.rx, loc.ry);
        if (w2 !== world) world = w2;
        const fresh = world.biomeInteriors[regionKey(loc.rx, loc.ry)];
        if (!fresh) return true;
        return isLocalObstacle(fresh, loc.lx, loc.ly);
      }
      return isLocalObstacle(interior, loc.lx, loc.ly);
    };
    const path = bfsPredicate(
      isObstacle,
      startingPlayer.gx,
      startingPlayer.gy,
      target.gx,
      target.gy,
      WALK_MAX_RADIUS,
    );
    if (!path) return;
    const player: Player = {
      ...startingPlayer,
      route: path.length === 0 ? null : path,
      stepCooldown: path.length === 0 ? 0 : Math.max(1, startingPlayer.stats.speed),
      pendingAction: { kind: "collect", resourceId },
    };
    const next = withPlayer(world, player);
    if (next) set({ world: next });
  },

  setCameraPanned: (panned) => {
    if (get().cameraPanned === panned) return;
    set({ cameraPanned: panned });
  },

  pickupLootAt: (rx, ry, lx, ly, lootId) => {
    const current = get().world;
    if (!current?.life || current.life.gameOver) return;
    const target = localToGlobal(rx, ry, lx, ly);
    let world = ensureInteriorsForRegion(current, rx, ry);
    const startingPlayer = world.life!.player;
    const isObstacle = (tgx: number, tgy: number): boolean => {
      const loc = globalToLocal(tgx, tgy);
      if (loc.rx < 0 || loc.ry < 0 || loc.rx >= MAP_W || loc.ry >= MAP_H) return true;
      if (loc.lx < 0 || loc.ly < 0 || loc.lx >= INTERIOR_W || loc.ly >= INTERIOR_H) return true;
      const interior = world.biomeInteriors[regionKey(loc.rx, loc.ry)];
      if (!interior) {
        const w2 = ensureInteriorsForRegion(world, loc.rx, loc.ry);
        if (w2 !== world) world = w2;
        const fresh = world.biomeInteriors[regionKey(loc.rx, loc.ry)];
        if (!fresh) return true;
        return isLocalObstacle(fresh, loc.lx, loc.ly);
      }
      return isLocalObstacle(interior, loc.lx, loc.ly);
    };
    const path = bfsPredicate(
      isObstacle,
      startingPlayer.gx,
      startingPlayer.gy,
      target.gx,
      target.gy,
      WALK_MAX_RADIUS,
    );
    if (!path) return;
    const player: Player = {
      ...startingPlayer,
      route: path.length === 0 ? null : path,
      stepCooldown: path.length === 0 ? 0 : Math.max(1, startingPlayer.stats.speed),
      pendingAction: { kind: "pickup", rx, ry, lx, ly, lootId },
    };
    const next = withPlayer(world, player);
    if (next) set({ world: next });
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
