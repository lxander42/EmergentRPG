"use client";

import { useEffect, useRef, useState } from "react";
import { useGameStore } from "@/lib/state/game-store";
import { biomeAt } from "@/lib/sim/biome";
import { BIOMES } from "@/content/biomes";

export default function MarkerNameModal() {
  const pending = useGameStore((s) => s.pendingMarker);
  if (!pending) return null;
  return <MarkerNameModalInner key={`${pending.rx},${pending.ry}`} pending={pending} />;
}

function MarkerNameModalInner({ pending }: { pending: { rx: number; ry: number } }) {
  const cancel = useGameStore((s) => s.cancelMarker);
  const add = useGameStore((s) => s.addMapMarker);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [name, setName] = useState("");

  useEffect(() => {
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, []);

  const biome = biomeAt(pending.rx, pending.ry);
  const meta = BIOMES[biome];

  const submit = () => {
    add(pending.rx, pending.ry, name);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Name this marker"
      className="pointer-events-auto absolute inset-0 z-30 flex items-center justify-center bg-[rgba(44,40,32,0.45)] p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) cancel();
      }}
    >
      <div className="w-full max-w-sm rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[0_24px_64px_-24px_rgba(44,40,32,0.5)]">
        <p className="font-mono text-[11px] uppercase tracking-wider text-[var(--color-fg-muted)]">
          New marker · ({pending.rx}, {pending.ry}) · {meta.title}
        </p>
        <h2 className="mt-1 text-lg font-medium leading-tight text-[var(--color-fg)]">
          What do you call this place?
        </h2>
        <input
          ref={inputRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            else if (e.key === "Escape") cancel();
          }}
          maxLength={32}
          placeholder="e.g. The old grove"
          className="mt-4 w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-warm)] px-3 py-2.5 text-sm text-[var(--color-fg)] outline-none focus:border-[var(--color-accent)]"
        />
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            onClick={cancel}
            className="tactile inline-flex items-center justify-center rounded-full px-3 py-2 text-sm text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-warm)]"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!name.trim()}
            className="tactile inline-flex items-center justify-center rounded-2xl bg-[var(--color-accent)] px-4 py-2.5 text-sm font-medium text-[var(--color-bg)] shadow-[0_8px_24px_-12px_rgba(217,104,70,0.5)] disabled:cursor-not-allowed disabled:bg-[var(--color-surface-warm)] disabled:text-[var(--color-fg-muted)] disabled:shadow-none"
          >
            Place marker
          </button>
        </div>
      </div>
    </div>
  );
}
