"use client";

import { useState } from "react";
import { Skull, X } from "@phosphor-icons/react/dist/ssr";
import { useGameStore } from "@/lib/state/game-store";
import { FACTIONS } from "@/content/factions";
import ShapeBadge from "@/components/panels/ShapeBadge";
import type { Legacy } from "@/lib/sim/legacy";
import type { GameOverReason } from "@/lib/sim/world";
import { useOutsideClose } from "@/lib/ui/use-outside-close";

const NO_LEGACIES: readonly Legacy[] = [];

export default function PastLivesPanel() {
  const open = useGameStore((s) => s.pastLivesOpen);
  const close = useGameStore((s) => s.closePastLives);
  const legacies = useGameStore((s) => s.world?.legacies ?? NO_LEGACIES);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const ref = useOutsideClose(open, close);

  if (!open) return null;

  const ordered = [...legacies].reverse();

  return (
    <aside
      ref={ref}
      role="dialog"
      aria-label="Past lives"
      className="pointer-events-auto absolute inset-x-2 bottom-2 z-20 max-h-[68dvh] overflow-y-auto rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[0_20px_48px_-20px_rgba(44,40,32,0.25)]"
    >
      <div className="mx-auto max-w-2xl">
        <header className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface-warm)]"
            >
              <Skull size={18} weight="duotone" className="text-[var(--color-fg)]" />
            </span>
            <div>
              <h2 className="text-lg font-medium leading-tight text-[var(--color-fg)]">
                Past lives
              </h2>
              <p className="font-mono text-[11px] uppercase tracking-wider text-[var(--color-fg-muted)]">
                {ordered.length === 0
                  ? "None yet"
                  : `${ordered.length} remembered`}
              </p>
            </div>
          </div>
          <button
            aria-label="Close"
            onClick={close}
            className="tactile inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-warm)] hover:text-[var(--color-fg)]"
          >
            <X size={18} weight="bold" />
          </button>
        </header>

        {ordered.length === 0 ? (
          <p className="text-sm text-[var(--color-fg-muted)]">
            No lives have ended yet. The land is patient.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {ordered.map((legacy) => (
              <LegacyRow
                key={legacy.id}
                legacy={legacy}
                expanded={expandedId === legacy.id}
                onToggle={() =>
                  setExpandedId((cur) => (cur === legacy.id ? null : legacy.id))
                }
              />
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

function LegacyRow({
  legacy,
  expanded,
  onToggle,
}: {
  legacy: Legacy;
  expanded: boolean;
  onToggle: () => void;
}) {
  const faction = FACTIONS.find((f) => f.id === legacy.factionOfOriginId);
  const factionHex = faction
    ? "#" + faction.color.toString(16).padStart(6, "0")
    : "#cccccc";
  const shape = faction?.shape ?? "diamond";
  const cause = describeCause(legacy.cause);
  return (
    <li>
      <button
        onClick={onToggle}
        aria-expanded={expanded}
        className="tactile flex w-full items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-warm)] px-3 py-2 text-left"
      >
        <ShapeBadge shape={shape} color={factionHex} />
        <span className="flex-1 min-w-0">
          <span className="block truncate text-sm font-medium text-[var(--color-fg)]">
            {legacy.name}
          </span>
          <span className="block font-mono text-[10px] uppercase tracking-wider text-[var(--color-fg-muted)]">
            {faction?.name ?? legacy.factionOfOriginId} · {cause}
          </span>
        </span>
        <span className="font-mono text-[11px] tabular-nums text-[var(--color-fg-muted)]">
          {legacy.ticksAlive}t · {legacy.kills}k
        </span>
      </button>
      {expanded && (
        <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-2xl border border-dashed border-[var(--color-border)] px-4 py-3 font-mono text-[11px]">
          <dt className="text-[var(--color-fg-muted)] uppercase tracking-wider">
            Born
          </dt>
          <dd className="tabular-nums text-[var(--color-fg)]">tick {legacy.bornAtTick}</dd>
          <dt className="text-[var(--color-fg-muted)] uppercase tracking-wider">
            Ended
          </dt>
          <dd className="tabular-nums text-[var(--color-fg)]">tick {legacy.endedAtTick}</dd>
          <dt className="text-[var(--color-fg-muted)] uppercase tracking-wider">
            Lived
          </dt>
          <dd className="tabular-nums text-[var(--color-fg)]">{legacy.ticksAlive} ticks</dd>
          <dt className="text-[var(--color-fg-muted)] uppercase tracking-wider">
            Regions
          </dt>
          <dd className="tabular-nums text-[var(--color-fg)]">{legacy.regionsDiscovered} discovered</dd>
          <dt className="text-[var(--color-fg-muted)] uppercase tracking-wider">
            Kills
          </dt>
          <dd className="tabular-nums text-[var(--color-fg)]">{legacy.kills}</dd>
          <dt className="text-[var(--color-fg-muted)] uppercase tracking-wider">
            Cause
          </dt>
          <dd className="text-[var(--color-fg)] normal-case">{cause}</dd>
        </dl>
      )}
    </li>
  );
}

function describeCause(reason: GameOverReason): string {
  if (reason === "starved") return "Starved";
  return `Killed by ${reason.killerName}`;
}
