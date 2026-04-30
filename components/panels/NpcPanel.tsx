"use client";

import { X } from "lucide-react";
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

  return (
    <aside className="pointer-events-auto absolute inset-x-0 bottom-0 z-20 max-h-[60dvh] overflow-y-auto rounded-t-2xl border-t border-[var(--color-border)] bg-[var(--color-bg-elevated)]/95 p-4 backdrop-blur-md">
      <div className="mx-auto max-w-2xl">
        <div className="mb-3 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold">{npc.name}</h2>
            <p className="text-xs text-[var(--color-fg-muted)]">
              {npc.factionId} · {npc.goal}
            </p>
          </div>
          <button
            aria-label="Close"
            onClick={() => select(null)}
            className="rounded-md p-1 hover:bg-white/10 active:scale-95"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {npc.traits.map((t) => (
            <span
              key={t}
              className="rounded-full border border-[var(--color-border)] bg-black/30 px-2 py-0.5 text-xs text-[var(--color-fg-muted)]"
            >
              {t}
            </span>
          ))}
        </div>
      </div>
    </aside>
  );
}
