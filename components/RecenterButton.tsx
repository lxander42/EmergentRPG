"use client";

import { CrosshairSimple } from "@phosphor-icons/react/dist/ssr";
import { useGameStore } from "@/lib/state/game-store";

export default function RecenterButton() {
  const view = useGameStore((s) => s.view);
  const gameOver = useGameStore((s) => s.world?.life?.gameOver ?? false);
  const panned = useGameStore((s) => s.cameraPanned);
  const setCameraPanned = useGameStore((s) => s.setCameraPanned);

  if (view !== "biome" || gameOver || !panned) return null;

  return (
    <button
      aria-label="Recenter on player"
      onClick={() => setCameraPanned(false)}
      className="tactile pointer-events-auto absolute top-2 right-2 z-20 inline-flex h-12 w-12 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-fg)] shadow-[0_8px_20px_-8px_rgba(44,40,32,0.35)]"
    >
      <CrosshairSimple size={22} weight="duotone" />
    </button>
  );
}
