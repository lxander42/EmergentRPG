"use client";

import { useGameStore } from "@/lib/state/game-store";
import { FACTIONS } from "@/content/factions";
import ShapeBadge from "@/components/panels/ShapeBadge";

export default function FactionLegend() {
  const view = useGameStore((s) => s.view);
  const npcs = useGameStore((s) => s.world?.npcs ?? null);
  const regionControl = useGameStore((s) => s.world?.regionControl ?? null);

  if (view !== "world" || !npcs || !regionControl) return null;

  const counts = new Map<string, number>();
  for (const id of Object.values(regionControl)) {
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  return (
    <div className="pointer-events-none absolute bottom-3 left-3 z-10">
      <div className="pointer-events-auto inline-flex flex-col gap-1.5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-2 shadow-[0_4px_12px_-6px_rgba(44,40,32,0.18)]">
        <p className="px-1 font-mono text-[10px] uppercase tracking-wider text-[var(--color-fg-muted)]">
          Factions
        </p>
        <ul className="flex flex-col gap-1">
          {FACTIONS.map((f) => {
            const colorHex = "#" + f.color.toString(16).padStart(6, "0");
            const held = counts.get(f.id) ?? 0;
            return (
              <li key={f.id} className="flex items-center gap-2 px-1">
                <ShapeBadge shape={f.shape} color={colorHex} size={6} />
                <div className="flex flex-col leading-tight">
                  <span className="text-[11px] text-[var(--color-fg)]">{f.name}</span>
                  <span className="font-mono text-[10px] tabular-nums text-[var(--color-fg-muted)]">
                    {held} {held === 1 ? "region" : "regions"}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
