"use client";

import { useEffect, useRef } from "react";

// Close a panel/menu when the user taps outside its DOM subtree. The
// listener is installed on the next event-loop tick so the same tap that
// opened the surface doesn't immediately close it. Caller attaches the
// returned ref to the surface's root element.
export function useOutsideClose(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      if (!ref.current) return;
      if (ref.current.contains(e.target as Node)) return;
      close();
    };
    const t = window.setTimeout(() => {
      window.addEventListener("mousedown", handler);
      window.addEventListener("touchstart", handler);
    }, 0);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("mousedown", handler);
      window.removeEventListener("touchstart", handler);
    };
  }, [open, close]);
  return ref;
}
