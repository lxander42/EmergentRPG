"use client";

import Link from "next/link";
import { Pause, Play, FastForward, Home } from "lucide-react";
import { useGameStore } from "@/lib/state/game-store";

const SPEEDS = [1, 2, 4] as const;

export default function HUD() {
  const paused = useGameStore((s) => s.paused);
  const speed = useGameStore((s) => s.speed);
  const ticks = useGameStore((s) => s.world?.ticks ?? 0);
  const togglePause = useGameStore((s) => s.togglePause);
  const setSpeed = useGameStore((s) => s.setSpeed);

  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between p-3">
      <Link
        href="/"
        className="pointer-events-auto flex items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)]/80 px-3 py-2 text-xs backdrop-blur-sm"
      >
        <Home className="h-4 w-4" />
        Menu
      </Link>

      <div className="pointer-events-auto flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)]/80 px-3 py-2 text-xs backdrop-blur-sm">
        <span className="font-mono tabular-nums text-[var(--color-fg-muted)]">
          t {ticks.toString().padStart(4, "0")}
        </span>
        <button
          aria-label={paused ? "Resume" : "Pause"}
          onClick={togglePause}
          className="rounded-md p-1 hover:bg-white/10 active:scale-95"
        >
          {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
        </button>
        <button
          aria-label="Cycle speed"
          onClick={() => {
            const idx = SPEEDS.indexOf(speed as (typeof SPEEDS)[number]);
            const next = SPEEDS[(idx + 1) % SPEEDS.length] ?? 1;
            setSpeed(next);
          }}
          className="flex items-center gap-1 rounded-md px-1.5 py-1 hover:bg-white/10 active:scale-95"
        >
          <FastForward className="h-4 w-4" />
          <span className="font-mono">{speed}x</span>
        </button>
      </div>
    </header>
  );
}
