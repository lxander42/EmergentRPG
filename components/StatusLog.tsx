"use client";

import { useEffect, useRef } from "react";
import { useGameStore } from "@/lib/state/game-store";
import { globalToLocal } from "@/lib/sim/biome-interior";

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
  const popoverOpen = useGameStore(
    (s) =>
      s.hudMenuOpen ||
      s.inventoryOpen ||
      s.pastLivesOpen ||
      s.workbenchOpen ||
      s.buildMode.active,
  );
  const popoverBottom = useGameStore((s) => s.popoverBottomPx);
  const scheduledIds = useRef(new Set<number>());

  useEffect(() => {
    let lastHungerStage = 0;
    let lastEncounterId: string | null = null;
    const unsub = useGameStore.subscribe((state) => {
      const player = state.world?.life?.player;
      if (player == null) {
        lastHungerStage = 0;
      } else {
        const stage = hungerStage(player.energy);
        if (stage > lastHungerStage) {
          lastHungerStage = stage;
          const text = HUNGER_TEXTS[stage];
          if (text) {
            queueMicrotask(() => useGameStore.getState().pushStatus(text));
          }
        } else {
          lastHungerStage = stage;
        }
      }
      const latestEvent = state.world?.recentEvents[0];
      if (latestEvent && latestEvent.id !== lastEncounterId) {
        lastEncounterId = latestEvent.id;
        if (latestEvent.encounter && player) {
          const npc = state.world!.npcs.find(
            (n) => n.id === latestEvent.encounter!.npcId,
          );
          const here = player ? globalToLocal(player.gx, player.gy) : null;
          if (npc && here && npc.rx === here.rx && npc.ry === here.ry) {
            // Toast only — the event is already in statusLog via tick().
            const text = latestEvent.context;
            queueMicrotask(() => useGameStore.getState().pushToast(text));
          }
        }
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

  // popoverBottom is the px distance from viewport bottom to the open
  // panel's top edge; sit a 16px gap above it. While a popover is open but
  // bounds haven't been measured yet (mount frame), keep the static
  // bottom-20 fallback so we never flash low.
  const bottomPx = popoverOpen ? Math.max(80, popoverBottom + 16) : 80;
  return (
    <div
      className="pointer-events-none absolute right-2 z-10 flex max-w-[80vw] flex-col items-end gap-1 transition-[bottom] duration-200"
      style={{ bottom: bottomPx }}
    >
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
