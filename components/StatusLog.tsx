"use client";

import { useEffect, useRef } from "react";
import { useGameStore } from "@/lib/state/game-store";

const HUNGER_TEXTS: Array<string | null> = [
  null,
  "You feel peckish.",
  "You're getting hungry.",
  "You're hungry — you should eat soon.",
  "Your stomach groans. You're starving.",
];

function hungerStage(energy: number): number {
  if (energy >= 7) return 0;
  if (energy >= 5) return 1;
  if (energy >= 3) return 2;
  if (energy >= 1) return 3;
  return 4;
}

const ENTRY_TTL_MS = 5000;

export default function StatusLog() {
  const messages = useGameStore((s) => s.statusMessages);
  const dismiss = useGameStore((s) => s.dismissStatus);
  const scheduledIds = useRef(new Set<number>());

  useEffect(() => {
    let lastHungerStage = 0;
    let lastEncounterId: string | null = null;
    const unsub = useGameStore.subscribe((state) => {
      const energy = state.world?.life?.player.energy;
      if (energy != null) {
        const stage = hungerStage(energy);
        if (stage > lastHungerStage) {
          const text = HUNGER_TEXTS[stage];
          if (text) state.pushStatus(text);
        }
        lastHungerStage = stage;
      } else {
        lastHungerStage = 0;
      }
      const latestEvent = state.world?.recentEvents[0];
      if (latestEvent && latestEvent.id !== lastEncounterId) {
        lastEncounterId = latestEvent.id;
        state.pushStatus(latestEvent.context);
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    for (const m of messages) {
      if (scheduledIds.current.has(m.id)) continue;
      scheduledIds.current.add(m.id);
      const remaining = Math.max(0, ENTRY_TTL_MS - (Date.now() - m.addedAt));
      window.setTimeout(() => {
        dismiss(m.id);
        scheduledIds.current.delete(m.id);
      }, remaining);
    }
  }, [messages, dismiss]);

  if (messages.length === 0) return null;

  return (
    <div className="pointer-events-none absolute bottom-20 right-2 z-10 flex max-w-[80vw] flex-col items-end gap-1 sm:bottom-12">
      {messages.slice(-4).map((m) => (
        <div
          key={m.id}
          className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs text-[var(--color-fg)] shadow-[0_4px_12px_-6px_rgba(44,40,32,0.18)]"
        >
          {m.text}
        </div>
      ))}
    </div>
  );
}
