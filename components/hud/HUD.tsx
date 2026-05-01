"use client";

import Link from "next/link";
import {
  House,
  Pause,
  Play,
  FastForward,
  MapTrifold,
  Lightning,
} from "@phosphor-icons/react/dist/ssr";
import { useGameStore } from "@/lib/state/game-store";
import { RESOURCES, type ResourceKind } from "@/content/home-resources";

const SPEEDS = [1, 2, 4] as const;

export default function HUD() {
  const paused = useGameStore((s) => s.paused);
  const speed = useGameStore((s) => s.speed);
  const ticks = useGameStore((s) => s.world?.ticks ?? 0);
  const togglePause = useGameStore((s) => s.togglePause);
  const setSpeed = useGameStore((s) => s.setSpeed);
  const view = useGameStore((s) => s.view);
  const setView = useGameStore((s) => s.setView);
  const homePending = useGameStore((s) => s.homePending);
  const hasHome = useGameStore((s) => Boolean(s.world?.home));
  const player = useGameStore((s) => s.world?.player ?? null);
  const inventory = useGameStore((s) => s.world?.inventory ?? {});

  return (
    <>
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

          {hasHome && (
            <>
              <span className="mx-1 h-4 w-px bg-[var(--color-border)]" aria-hidden />
              <button
                aria-label={view === "home" ? "Switch to world map" : "Enter home base"}
                onClick={() => setView(view === "home" ? "world" : "home")}
                className="tactile inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--color-fg)] hover:bg-[var(--color-surface-warm)]"
              >
                {view === "home" ? (
                  <MapTrifold size={16} weight="duotone" />
                ) : (
                  <House size={16} weight="duotone" />
                )}
              </button>
            </>
          )}
        </div>
      </header>

      {homePending && view === "world" && (
        <div className="pointer-events-none absolute inset-x-0 top-16 z-10 flex justify-center px-3">
          <div className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-1.5 font-mono text-[11px] uppercase tracking-wider text-[var(--color-fg-muted)] shadow-[0_4px_12px_-6px_rgba(44,40,32,0.18)]">
            Tap a region to claim your home base
          </div>
        </div>
      )}

      {view === "home" && player && (
        <div className="pointer-events-none absolute inset-x-2 top-16 z-10 flex flex-wrap items-center justify-end gap-2">
          <EnergyStrip energy={player.energy} max={player.energyMax} />
          <InventoryStrip inventory={inventory} />
        </div>
      )}
    </>
  );
}

function EnergyStrip({ energy, max }: { energy: number; max: number }) {
  return (
    <div className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1 shadow-[0_4px_12px_-6px_rgba(44,40,32,0.18)]">
      <Lightning size={14} weight="fill" className="text-[var(--color-accent)]" />
      <div className="flex items-center gap-[3px]">
        {Array.from({ length: max }).map((_, i) => (
          <span
            key={i}
            aria-hidden
            className="h-2.5 w-2 rounded-[2px]"
            style={{
              background:
                i < energy ? "var(--color-accent)" : "var(--color-surface-warm)",
              border:
                i < energy
                  ? "1px solid var(--color-accent)"
                  : "1px solid var(--color-border)",
            }}
          />
        ))}
      </div>
      <span className="ml-1 font-mono text-[10px] tabular-nums text-[var(--color-fg-muted)]">
        {energy}/{max}
      </span>
    </div>
  );
}

function InventoryStrip({ inventory }: { inventory: Partial<Record<ResourceKind, number>> }) {
  const entries = (Object.entries(inventory) as Array<[ResourceKind, number]>).filter(
    ([, n]) => n > 0,
  );
  if (entries.length === 0) return null;
  return (
    <div className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1 shadow-[0_4px_12px_-6px_rgba(44,40,32,0.18)]">
      {entries.map(([kind, count]) => (
        <span key={kind} className="inline-flex items-center gap-1">
          <span
            aria-hidden
            className="h-2.5 w-2.5 rounded-sm border border-[var(--color-border-strong)]"
            style={{ background: RESOURCES[kind].swatch }}
          />
          <span className="font-mono text-[10px] tabular-nums text-[var(--color-fg)]">
            {count}
          </span>
        </span>
      ))}
    </div>
  );
}
