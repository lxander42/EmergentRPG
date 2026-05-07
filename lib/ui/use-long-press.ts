"use client";

import { useCallback, useEffect, useRef } from "react";

type Handlers = {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerLeave: (e: React.PointerEvent) => void;
  onPointerCancel: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
};

export type LongPress = Handlers & {
  // Latest "onLongPress fired" timestamp; consumers can read this to dedupe
  // a synthetic contextmenu that some touch browsers fire right after a
  // successful long-press.
  firedAt: React.MutableRefObject<number>;
};

// Long-press detector for inventory rows. Fires `onLongPress()` after `ms`
// without moving more than `thresholdPx`. Mouse pointers are ignored — the
// caller wires a native `contextmenu` listener for desktop right-click
// instead, since React's onContextMenu prop is unreliable across browsers
// (Safari + some Chromium configs let the native menu open before React
// dispatches its synthetic event).
export function useLongPress(
  onLongPress: () => void,
  opts: { ms?: number; thresholdPx?: number } = {},
): LongPress {
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
    firedAt,
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
  };
}
