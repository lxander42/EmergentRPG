"use client";

import Link from "next/link";
import { House, Pause, Play, FastForward } from "@phosphor-icons/react/dist/ssr";
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
        aria-label="Back to menu"
        className="tactile pointer-events-auto inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[0_4px_12px_-6px_rgba(44,40,32,0.18)]"
      >
        <House size={18} weight="duotone" className="text-[var(--color-fg)]" />
      </Link>

      <div className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] py-1 pl-3.5 pr-1.5 shadow-[0_4px_12px_-6px_rgba(44,40,32,0.18)]">
        <span className="select-none font-mono text-xs tabular-nums text-[var(--color-fg-muted)]">
          {ticks.toString().padStart(4, "0")}
        </span>

        <span className="mx-1 h-4 w-px bg-[var(--color-border)]" aria-hidden />

        <button
          aria-label={paused ? "Resume" : "Pause"}
          aria-pressed={paused}
          onClick={togglePause}
          className="tactile inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--color-fg)] hover:bg-[var(--color-surface-warm)]"
        >
          {paused ? <Play size={16} weight="fill" /> : <Pause size={16} weight="fill" />}
        </button>

        <button
          aria-label={`Speed ${speed}x, tap to cycle`}
          onClick={() => {
            const idx = SPEEDS.indexOf(speed as (typeof SPEEDS)[number]);
            const next = SPEEDS[(idx + 1) % SPEEDS.length] ?? 1;
            setSpeed(next);
          }}
          className="tactile inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-[var(--color-fg)] hover:bg-[var(--color-surface-warm)]"
        >
          <FastForward size={14} weight="fill" />
          <span className="font-mono text-[11px] tabular-nums">{speed}x</span>
        </button>
      </div>
    </header>
  );
}
