"use client";

import { useEffect } from "react";
import { Check, X } from "@phosphor-icons/react/dist/ssr";
import { useGameStore } from "@/lib/state/game-store";
import { FACTIONS } from "@/content/factions";
import { RESOURCES } from "@/content/resources";
import ShapeBadge from "@/components/panels/ShapeBadge";

const AUTO_DISMISS_MS = 6000;

export default function EncounterToast() {
  const event = useGameStore((s) => s.lastEvent);
  const accept = useGameStore((s) => s.acceptEncounter);
  const dismiss = useGameStore((s) => s.dismissEncounter);

  const encounter = event?.encounter ?? null;

  useEffect(() => {
    if (!encounter) return;
    const id = window.setTimeout(() => dismiss(), AUTO_DISMISS_MS);
    return () => window.clearTimeout(id);
  }, [encounter, dismiss]);

  if (!event || !encounter) return null;

  const faction = FACTIONS.find((f) => f.id === encounter.factionId);
  const shape = faction?.shape ?? "diamond";
  const colorHex = "#" + encounter.factionColor.toString(16).padStart(6, "0");
  const friendly = encounter.sentiment === "friendly";

  return (
    <div className="pointer-events-none absolute inset-x-0 top-16 z-20 flex justify-center px-3">
      <aside
        role="status"
        aria-live="polite"
        className="pointer-events-auto flex w-full max-w-md flex-col gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[0_20px_48px_-20px_rgba(44,40,32,0.25)]"
      >
        <div className="flex items-start gap-3">
          <ShapeBadge shape={shape} color={colorHex} size={8} />
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-fg-muted)]">
              {friendly ? "Encounter" : "Standoff"}
            </p>
            <p className="mt-0.5 text-sm leading-snug text-[var(--color-fg)]">
              {event.context}
            </p>
            {friendly && encounter.offer && (
              <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-[var(--color-fg-muted)]">
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 rounded-full border border-[var(--color-border-strong)]"
                  style={{ background: RESOURCES[encounter.offer.kind].swatch }}
                />
                +{encounter.offer.amount} {RESOURCES[encounter.offer.kind].label}
              </p>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          {friendly ? (
            <>
              <button
                onClick={dismiss}
                className="tactile inline-flex h-10 items-center gap-1.5 rounded-full border border-[var(--color-border)] px-3 text-sm text-[var(--color-fg)] hover:bg-[var(--color-surface-warm)]"
              >
                <X size={14} weight="bold" />
                Dismiss
              </button>
              <button
                onClick={accept}
                className="tactile inline-flex h-10 items-center gap-1.5 rounded-full bg-[var(--color-accent)] px-3.5 text-sm font-medium text-[var(--color-bg)] shadow-[0_8px_24px_-12px_rgba(217,104,70,0.5)]"
              >
                <Check size={14} weight="bold" />
                Accept
              </button>
            </>
          ) : (
            <button
              onClick={dismiss}
              className="tactile inline-flex h-10 items-center gap-1.5 rounded-full border border-[var(--color-border)] px-3 text-sm text-[var(--color-fg)] hover:bg-[var(--color-surface-warm)]"
            >
              Stand down
            </button>
          )}
        </div>
      </aside>
    </div>
  );
}
