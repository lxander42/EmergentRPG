"use client";

import { X, MessageCircle } from "lucide-react";
import { useRef, useState } from "react";
import { useGameStore } from "@/lib/state/game-store";
import { findNpc, summarizeWorld, type World } from "@/lib/sim/world";
import type { Npc } from "@/lib/sim/npc";

export default function NpcPanel() {
  const selectedId = useGameStore((s) => s.selectedNpcId);
  const world = useGameStore((s) => s.world);
  const npc = world && selectedId ? findNpc(world, selectedId) : undefined;

  if (!npc || !world) return null;
  return <NpcPanelInner key={npc.id} npc={npc} world={world} />;
}

function NpcPanelInner({ npc, world }: { npc: Npc; world: World }) {
  const select = useGameStore((s) => s.selectNpc);
  const [streaming, setStreaming] = useState(false);
  const [dialogue, setDialogue] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  async function talk() {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setDialogue("");
    setStreaming(true);
    try {
      const res = await fetch("/api/npc-dialogue", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          npc: {
            name: npc.name,
            faction: npc.factionId,
            traits: npc.traits,
            values: npc.values,
            goal: npc.goal,
          },
          worldSummary: summarizeWorld(world),
        }),
        signal: ctrl.signal,
      });
      if (!res.body) {
        setDialogue("(no response)");
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        setDialogue((d) => d + decoder.decode(value, { stream: true }));
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setDialogue("(unable to reach narrator)");
      }
    } finally {
      setStreaming(false);
    }
  }

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

        <div className="mb-4 flex flex-wrap gap-1.5">
          {npc.traits.map((t) => (
            <span
              key={t}
              className="rounded-full border border-[var(--color-border)] bg-black/30 px-2 py-0.5 text-xs text-[var(--color-fg-muted)]"
            >
              {t}
            </span>
          ))}
        </div>

        <button
          onClick={talk}
          disabled={streaming}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--color-border)] bg-black/30 px-4 py-3 text-sm font-medium hover:border-[var(--color-accent)] active:scale-[0.99] disabled:opacity-60"
        >
          <MessageCircle className="h-4 w-4" />
          {streaming ? "Listening…" : "Talk"}
        </button>

        {dialogue && (
          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-[var(--color-fg)]">
            {dialogue}
          </p>
        )}
      </div>
    </aside>
  );
}
