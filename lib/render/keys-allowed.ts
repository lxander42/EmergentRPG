import { useGameStore } from "@/lib/state/game-store";

type Snapshot = ReturnType<typeof useGameStore.getState>;

// True when WASD pan / hotkeys should react. Suppressed while the user is
// typing in an input, or while a blocking modal/overlay sits on top of the
// game.
export function keysAllowed(store: Snapshot): boolean {
  if (typeof document !== "undefined") {
    const el = document.activeElement;
    if (el) {
      const tag = el.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return false;
      if ((el as HTMLElement).isContentEditable === true) return false;
    }
  }
  if (store.tutorialOpen) return false;
  if (store.pendingDrop !== null) return false;
  if (store.pendingMarker !== null) return false;
  if (store.world?.life?.gameOver) return false;
  return true;
}
