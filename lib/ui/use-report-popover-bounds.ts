"use client";

import { useEffect, useRef, type RefCallback } from "react";
import { useGameStore } from "@/lib/state/game-store";

// Reports the live top-edge of an open right-side popover (inventory,
// build palette, past-lives, hud menu, workbench) into the store so that
// bottom-anchored UI like StatusLog can position itself just above whatever
// panel is currently showing — measured against the actual rendered height,
// not a fixed shift.
export function useReportPopoverBounds(open: boolean): RefCallback<HTMLElement> {
  const elRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const setBounds = useGameStore.getState().setPopoverBottomPx;
    const update = () => {
      const el = elRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setBounds(Math.max(0, window.innerHeight - rect.top));
    };
    update();
    const obs = new ResizeObserver(update);
    if (elRef.current) obs.observe(elRef.current);
    window.addEventListener("resize", update);
    return () => {
      obs.disconnect();
      window.removeEventListener("resize", update);
      useGameStore.getState().setPopoverBottomPx(0);
    };
  }, [open]);

  return (el) => {
    elRef.current = el;
  };
}
