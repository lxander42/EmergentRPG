"use client";

import { useEffect, useState } from "react";
import { CrosshairSimple } from "@phosphor-icons/react/dist/ssr";
import { useGameStore } from "@/lib/state/game-store";
import { bus } from "@/lib/render/bus";

export default function RecenterButton() {
  const view = useGameStore((s) => s.view);
  const gameOver = useGameStore((s) => s.world?.life?.gameOver ?? false);
  const [panned, setPanned] = useState(false);

  useEffect(() => {
    const onPanned = (payload: { panned: boolean }) => setPanned(payload.panned);
    bus.on("biome:panned", onPanned);
    return () => bus.off("biome:panned", onPanned);
  }, []);

  if (view !== "biome" || gameOver || !panned) return null;

  return (
    <button
      aria-label="Recenter on player"
      onClick={() => bus.emit("biome:recenter")}
      className="tactile pointer-events-auto absolute bottom-4 right-4 z-20 inline-flex h-12 w-12 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-fg)] shadow-[0_8px_20px_-8px_rgba(44,40,32,0.35)]"
    >
      <CrosshairSimple size={22} weight="duotone" />
    </button>
  );
}
