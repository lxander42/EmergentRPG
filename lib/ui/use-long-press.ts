"use client";

import { useCallback, useEffect, useRef } from "react";

type Handlers = {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerLeave: (e: React.PointerEvent) => void;
  onPointerCancel: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
};

// Long-press detector for inventory rows. Fires `onLongPress()` after `ms`
// without moving more than `thresholdPx`. Distinguishes mouse from touch:
// desktop should use right-click instead, so a 2-button mouse press is
// ignored here (the row's own onContextMenu drives drop on desktop). The
// onContextMenu handler in the returned object suppresses the synthetic
// contextmenu that some touch browsers fire after a successful long-press,
// to avoid double-drop.
export function useLongPress(
  onLongPress: () => void,
  opts: { ms?: number; thresholdPx?: number } = {},
): Handlers {
  const ms = opts.ms ?? 500;
  const thresholdPx = opts.thresholdPx ?? 8;
  const timer = useRef<number | null>(null);
  const startPos = useRef<{ x: number; y: number } | null>(null);
  const firedAt = useRef(0);

  const cancel = useCallback(() => {
    if (timer.current != null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    startPos.current = null;
  }, []);

  useEffect(() => () => cancel(), [cancel]);

  return {
    onPointerDown: (e) => {
      if (e.pointerType === "mouse") return;
      cancel();
      startPos.current = { x: e.clientX, y: e.clientY };
      timer.current = window.setTimeout(() => {
        timer.current = null;
        if (!startPos.current) return;
        firedAt.current = Date.now();
        onLongPress();
      }, ms);
    },
    onPointerMove: (e) => {
      if (!startPos.current) return;
      const dx = e.clientX - startPos.current.x;
      const dy = e.clientY - startPos.current.y;
      if (Math.abs(dx) + Math.abs(dy) > thresholdPx) cancel();
    },
    onPointerUp: () => {
      cancel();
    },
    onPointerLeave: () => {
      cancel();
    },
    onPointerCancel: () => {
      cancel();
    },
    onContextMenu: (e) => {
      // Suppress the synthetic contextmenu fired by some touch browsers
      // immediately after a successful long-press; the long-press already
      // ran the action.
      if (Date.now() - firedAt.current < 800) e.preventDefault();
    },
  };
}
