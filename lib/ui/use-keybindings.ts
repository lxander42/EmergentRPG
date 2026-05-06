"use client";

import { useEffect } from "react";
import { useGameStore } from "@/lib/state/game-store";

// Desktop keyboard shortcuts. Mounted once in /play. WASD lives inside the
// Phaser scenes (held-key panning is a per-frame render concern); this hook
// only handles discrete UI shortcuts: M (map toggle), I (inventory toggle),
// Esc (close topmost overlay).
export function useKeybindings() {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const editable =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target?.isContentEditable === true;

      const store = useGameStore.getState();

      if (e.key === "Escape") {
        if (closeTopmost(store)) e.preventDefault();
        return;
      }

      if (editable) return;

      const blocking =
        store.tutorialOpen ||
        store.pendingMarker !== null ||
        store.pendingDrop !== null ||
        (store.world?.life?.gameOver ?? false);
      if (blocking) return;

      const k = e.key.toLowerCase();
      if (k === "m") {
        e.preventDefault();
        store.setView(store.view === "biome" ? "world" : "biome");
        return;
      }
      if (k === "i") {
        e.preventDefault();
        if (store.inventoryOpen) store.closeInventory();
        else store.openInventory();
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}

type StoreSnapshot = ReturnType<typeof useGameStore.getState>;

function closeTopmost(store: StoreSnapshot): boolean {
  if (store.pendingDrop) {
    store.cancelDrop();
    return true;
  }
  if (store.pendingMarker) {
    store.cancelMarker();
    return true;
  }
  if (store.tutorialOpen) {
    store.closeTutorial();
    return true;
  }
  if (store.workbenchOpen) {
    store.closeWorkbench();
    return true;
  }
  if (store.inventoryOpen) {
    store.closeInventory();
    return true;
  }
  if (store.pastLivesOpen) {
    store.closePastLives();
    return true;
  }
  if (store.buildMode.active) {
    store.exitBuildMode();
    return true;
  }
  if (store.placedStructureContextMenu) {
    store.closePlacedStructureContextMenu();
    return true;
  }
  if (store.obstacleContextMenu) {
    store.closeObstacleContextMenu();
    return true;
  }
  if (store.npcContextMenu) {
    store.closeNpcContextMenu();
    return true;
  }
  if (store.selectedNpcId) {
    store.selectNpc(null);
    return true;
  }
  if (store.selectedRegion) {
    store.selectRegion(null);
    return true;
  }
  return false;
}
