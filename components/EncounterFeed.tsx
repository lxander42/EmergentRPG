"use client";

import { CaretRight, Newspaper, X } from "@phosphor-icons/react/dist/ssr";
import { useState } from "react";
import { useGameStore } from "@/lib/state/game-store";
import type { WorldEvent } from "@/lib/sim/events";

const NO_EVENTS: readonly WorldEvent[] = [];

export default function EncounterFeed() {
  const events = useGameStore((s) => s.world?.recentEvents ?? NO_EVENTS);
  const debugMode = useGameStore((s) => s.debugMode);
  const hudMenuOpen = useGameStore((s) => s.hudMenuOpen);
  const [open, setOpen] = useState(false);

  if (!debugMode || events.length === 0) return null;

  const bottomCls = hudMenuOpen ? "bottom-72" : "bottom-20";

  if (!open) {
    const latest = events[0]!;
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="Open encounter feed"
        className={`tactile pointer-events-auto absolute right-2 z-10 inline-flex max-w-[60vw] items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 shadow-[0_4px_12px_-6px_rgba(44,40,32,0.18)] transition-[bottom] duration-200 ${bottomCls}`}
      >
        <Newspaper size={14} weight="duotone" className="shrink-0 text-[var(--color-fg-muted)]" />
        <span className="truncate text-xs text-[var(--color-fg)]">
          {latest.context}
        </span>
        <CaretRight size={12} weight="bold" className="shrink-0 text-[var(--color-fg-muted)]" />
      </button>
    );
  }

  return (
    <aside
      role="log"
      aria-label="Encounter feed"
      className={`pointer-events-auto absolute right-2 z-10 flex w-72 max-w-[80vw] flex-col rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-[0_16px_40px_-16px_rgba(44,40,32,0.45)] transition-[bottom] duration-200 ${bottomCls}`}
    >
      <header className="mb-2 flex items-center justify-between gap-3">
        <span className="font-mono text-[11px] uppercase tracking-wider text-[var(--color-fg-muted)]">
          Recent events
        </span>
        <button
          aria-label="Close feed"
          onClick={() => setOpen(false)}
          className="tactile -my-0.5 -mr-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-warm)] hover:text-[var(--color-fg)]"
        >
          <X size={12} weight="bold" />
        </button>
      </header>
      <ul className="flex max-h-[40vh] flex-col gap-1.5 overflow-y-auto">
        {events.map((e) => (
          <li
            key={e.id}
            className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-warm)] px-2.5 py-1.5"
          >
            <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-fg-muted)]">
              tick {e.tick} · {e.topic}
            </p>
            <p className="mt-0.5 text-xs leading-snug text-[var(--color-fg)]">
              {e.context}
            </p>
          </li>
        ))}
      </ul>
    </aside>
  );
}
