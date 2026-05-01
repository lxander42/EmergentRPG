"use client";

import { create } from "zustand";
import { claimHome, createWorld, tickWorld, WORLD_VERSION, type World } from "@/lib/sim/world";
import { loadWorld, saveWorld } from "@/lib/save/db";
import { bus } from "@/lib/render/bus";
import type { WorldEvent } from "@/lib/sim/events";
import type { PendingAction } from "@/lib/sim/player";
import { resourceAt, walkTo } from "@/lib/sim/home";

const AUTOSAVE_EVERY_TICKS = 60;

export type SelectedRegion = { rx: number; ry: number };
export type View = "world" | "home";

type GameStore = {
  world: World | null;
  paused: boolean;
  speed: number;
  selectedNpcId: string | null;
  selectedRegion: SelectedRegion | null;
  lastEvent: WorldEvent | null;
  view: View;
  homePending: boolean;

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
  walkPlayerTo: (px: number, py: number) => void;
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

  startNew: () => {
    set({
      world: createWorld(),
      selectedNpcId: null,
      selectedRegion: null,
      lastEvent: null,
      paused: false,
      view: "world",
      homePending: true,
    });
  },

  loadFromDisk: async (slot) => {
    const loaded = await loadWorld(slot);
    if (loaded && loaded.version === WORLD_VERSION) {
      set({
        world: loaded,
        view: loaded.home ? "home" : "world",
        homePending: !loaded.home,
      });
    } else {
      set({ world: createWorld(), view: "world", homePending: true });
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
    set({ world, lastEvent: event ?? get().lastEvent });
    if (world.ticks % AUTOSAVE_EVERY_TICKS === 0) {
      void saveWorld("default", world);
    }
  },

  togglePause: () => set({ paused: !get().paused }),
  setSpeed: (s) => set({ speed: s }),

  // Selection is mutually exclusive: only one slide-up panel at a time.
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
    const next = claimHome(current, rx, ry);
    if (!next) return;
    set({
      world: next,
      homePending: false,
      view: "home",
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

  walkPlayerTo: (px, py) => {
    const current = get().world;
    if (!current || !current.home || !current.player) return;
    const target = resourceAt(current.home, px, py);
    const action: PendingAction | null =
      target && target.respawnAt === null ? { kind: "collect", resourceId: target.id } : null;
    const player = walkTo(current.home, current.player, px, py, action);
    set({ world: { ...current, player } });
  },
}));
