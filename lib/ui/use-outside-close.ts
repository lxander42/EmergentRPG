"use client";

import { useEffect, useRef } from "react";
import { useGameStore } from "@/lib/state/game-store";

// Close a panel/menu when the user taps outside its DOM subtree. The
// listener is installed on the next event-loop tick so the same tap that
// opened the surface doesn't immediately close it. Caller attaches the
// returned ref to the surface's root element. The hook also marks the next
// world tap as "swallow" so Phaser's pointerup handler doesn't double-act
// on the same gesture (e.g. closing inventory then walking the player to
// the empty tile beneath it).
export function useOutsideClose(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    let clearTimer: number | null = null;
    const handler = (e: MouseEvent | TouchEvent) => {
      if (!ref.current) return;
      if (ref.current.contains(e.target as Node)) return;
      useGameStore.getState().setSwallowNextWorldTap(true);
      if (clearTimer != null) window.clearTimeout(clearTimer);
      clearTimer = window.setTimeout(() => {
        useGameStore.getState().setSwallowNextWorldTap(false);
        clearTimer = null;
      }, 400);
      close();
    };
    const t = window.setTimeout(() => {
      window.addEventListener("mousedown", handler);
      window.addEventListener("touchstart", handler);
    }, 0);
    return () => {
      window.clearTimeout(t);
      if (clearTimer != null) window.clearTimeout(clearTimer);
      window.removeEventListener("mousedown", handler);
      window.removeEventListener("touchstart", handler);
    };
  }, [open, close]);
  return ref;
}
