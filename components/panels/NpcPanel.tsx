"use client";

import { X } from "@phosphor-icons/react/dist/ssr";
import { useGameStore } from "@/lib/state/game-store";
import { findNpc } from "@/lib/sim/world";
import type { Npc } from "@/lib/sim/npc";

export default function NpcPanel() {
  const selectedId = useGameStore((s) => s.selectedNpcId);
  const world = useGameStore((s) => s.world);
  const npc = world && selectedId ? findNpc(world, selectedId) : undefined;

  if (!npc) return null;
  return <NpcPanelInner npc={npc} />;
}

function NpcPanelInner({ npc }: { npc: Npc }) {
  const select = useGameStore((s) => s.selectNpc);
  const factionColorHex = "#" + npc.factionColor.toString(16).padStart(6, "0");

  return (
    <aside
      role="dialog"
      aria-label={`${npc.name} details`}
      className="pointer-events-auto absolute inset-x-2 bottom-2 z-20 max-h-[60dvh] overflow-y-auto rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[0_20px_48px_-20px_rgba(44,40,32,0.25)]"
    >
      <div className="mx-auto max-w-2xl">
        <header className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className="h-9 w-9 shrink-0 rounded-lg border border-[var(--color-border-strong)]"
              style={{ background: factionColorHex }}
            />
            <div>
              <h2 className="text-lg font-medium leading-tight text-[var(--color-fg)]">
                {npc.name}
              </h2>
              <p className="font-mono text-[11px] uppercase tracking-wider text-[var(--color-fg-muted)]">
                {npc.factionId}
              </p>
            </div>
          </div>
          <button
            aria-label="Close"
            onClick={() => select(null)}
            className="tactile inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-warm)] hover:text-[var(--color-fg)]"
          >
            <X size={18} weight="bold" />
          </button>
        </header>

        <dl className="grid grid-cols-[auto_1fr] items-start gap-x-5 gap-y-3 border-t border-[var(--color-border)] pt-4">
          <dt className="font-mono text-[11px] uppercase tracking-wider text-[var(--color-fg-muted)]">
            Goal
          </dt>
          <dd className="text-sm text-[var(--color-fg)]">{npc.goal}</dd>

          <dt className="font-mono text-[11px] uppercase tracking-wider text-[var(--color-fg-muted)]">
            Traits
          </dt>
          <dd className="flex flex-wrap gap-1.5">
            {npc.traits.map((t) => (
              <span
                key={t}
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-warm)] px-2 py-0.5 text-xs text-[var(--color-fg)]"
              >
                {t}
              </span>
            ))}
          </dd>

          <dt className="font-mono text-[11px] uppercase tracking-wider text-[var(--color-fg-muted)]">
            Values
          </dt>
          <dd className="flex flex-wrap gap-1.5">
            {npc.values.map((v) => (
              <span key={v} className="text-xs text-[var(--color-fg-muted)]">
                {v}
              </span>
            ))}
          </dd>
        </dl>
      </div>
    </aside>
  );
}
