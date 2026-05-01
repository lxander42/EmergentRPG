"use client";

import { create } from "zustand";
import { createWorld, tickWorld, WORLD_VERSION, type World } from "@/lib/sim/world";
import { loadWorld, saveWorld } from "@/lib/save/db";
import { bus } from "@/lib/render/bus";
import type { WorldEvent } from "@/lib/sim/events";

const AUTOSAVE_EVERY_TICKS = 60;

export type SelectedRegion = { rx: number; ry: number };

type GameStore = {
  world: World | null;
  paused: boolean;
  speed: number;
  selectedNpcId: string | null;
  selectedRegion: SelectedRegion | null;
  lastEvent: WorldEvent | null;

  startNew: () => void;
  loadFromDisk: (slot: string) => Promise<void>;
  saveToDisk: (slot: string) => Promise<void>;

  tick: () => void;
  togglePause: () => void;
  setSpeed: (s: number) => void;
  selectNpc: (id: string | null) => void;
  selectRegion: (region: SelectedRegion | null) => void;
};

export const useGameStore = create<GameStore>((set, get) => ({
  world: null,
  paused: false,
  speed: 1,
  selectedNpcId: null,
  selectedRegion: null,
  lastEvent: null,

  startNew: () => {
    set({
      world: createWorld(),
      selectedNpcId: null,
      selectedRegion: null,
      lastEvent: null,
      paused: false,
    });
  },

  loadFromDisk: async (slot) => {
    const loaded = await loadWorld(slot);
    if (loaded && loaded.version === WORLD_VERSION) {
      set({ world: loaded });
    } else {
      // Save predates the current world schema -- start fresh.
      set({ world: createWorld() });
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
}));
