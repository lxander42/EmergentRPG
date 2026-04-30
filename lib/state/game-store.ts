"use client";

import { create } from "zustand";
import { createWorld, tickWorld, type World } from "@/lib/sim/world";
import { loadWorld, saveWorld } from "@/lib/save/db";
import { bus } from "@/lib/render/bus";
import type { WorldEvent } from "@/lib/sim/events";

const AUTOSAVE_EVERY_TICKS = 60;

type GameStore = {
  world: World | null;
  paused: boolean;
  speed: number;
  selectedNpcId: string | null;
  lastEvent: WorldEvent | null;

  startNew: () => void;
  loadFromDisk: (slot: string) => Promise<void>;
  saveToDisk: (slot: string) => Promise<void>;

  tick: () => void;
  togglePause: () => void;
  setSpeed: (s: number) => void;
  selectNpc: (id: string | null) => void;
};

export const useGameStore = create<GameStore>((set, get) => ({
  world: null,
  paused: false,
  speed: 1,
  selectedNpcId: null,
  lastEvent: null,

  startNew: () => {
    set({ world: createWorld(), selectedNpcId: null, lastEvent: null, paused: false });
  },

  loadFromDisk: async (slot) => {
    const loaded = await loadWorld(slot);
    if (loaded) set({ world: loaded });
    else set({ world: createWorld() });
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
    if (event) {
      bus.emit("narration:request", { topic: event.topic, context: event.context });
    }
    if (world.ticks % AUTOSAVE_EVERY_TICKS === 0) {
      void saveWorld("default", world);
    }
  },

  togglePause: () => set({ paused: !get().paused }),
  setSpeed: (s) => set({ speed: s }),
  selectNpc: (id) => {
    set({ selectedNpcId: id });
    if (!id) bus.emit("npc:deselected");
  },
}));
