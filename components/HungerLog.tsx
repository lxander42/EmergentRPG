"use client";

import { useEffect, useState } from "react";
import { useGameStore } from "@/lib/state/game-store";

const STAGE_TEXTS: Array<string | null> = [
  null,
  "You feel peckish.",
  "You're getting hungry.",
  "You're hungry — you should eat soon.",
  "Your stomach groans. You're starving.",
];

function stageOf(energy: number): number {
  if (energy >= 7) return 0;
  if (energy >= 5) return 1;
  if (energy >= 3) return 2;
  if (energy >= 1) return 3;
  return 4;
}

type Entry = { id: number; text: string };

let nextId = 0;

export default function HungerLog() {
  const [entries, setEntries] = useState<Entry[]>([]);

  useEffect(() => {
    let lastStage = 0;
    const timers = new Set<number>();
    const unsub = useGameStore.subscribe((state) => {
      const energy = state.world?.life?.player.energy;
      if (energy == null) {
        lastStage = 0;
        return;
      }
      const stage = stageOf(energy);
      if (stage > lastStage) {
        const text = STAGE_TEXTS[stage];
        if (text) {
          const id = ++nextId;
          setEntries((prev) => [...prev, { id, text }]);
          const t = window.setTimeout(() => {
            timers.delete(t);
            setEntries((prev) => prev.filter((e) => e.id !== id));
          }, 5000);
          timers.add(t);
        }
      }
      lastStage = stage;
    });
    return () => {
      unsub();
      for (const t of timers) window.clearTimeout(t);
    };
  }, []);

  if (entries.length === 0) return null;

  return (
    <div className="pointer-events-none absolute bottom-12 right-2 z-10 flex flex-col items-end gap-1">
      {entries.map((e) => (
        <div
          key={e.id}
          className="animate-[fadeIn_120ms_ease-out] rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs text-[var(--color-fg)] shadow-[0_4px_12px_-6px_rgba(44,40,32,0.18)]"
        >
          {e.text}
        </div>
      ))}
    </div>
  );
}
