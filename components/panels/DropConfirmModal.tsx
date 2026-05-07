"use client";

import { useEffect, useRef, useState } from "react";
import { Trash } from "@phosphor-icons/react/dist/ssr";
import { useGameStore } from "@/lib/state/game-store";
import { RESOURCES, type ResourceKind } from "@/content/resources";
import TileChip from "@/components/panels/TileChip";

export default function DropConfirmModal() {
  const pending = useGameStore((s) => s.pendingDrop);
  if (!pending) return null;
  return (
    <DropConfirmModalInner
      key={`${pending.kind}:${pending.max}`}
      kind={pending.kind}
      max={pending.max}
    />
  );
}

function DropConfirmModalInner({ kind, max }: { kind: ResourceKind; max: number }) {
  const cancel = useGameStore((s) => s.cancelDrop);
  const confirm = useGameStore((s) => s.confirmDrop);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [qty, setQty] = useState(max);
  const meta = RESOURCES[kind];

  useEffect(() => {
    const t = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(t);
  }, []);

  const safeQty = Math.max(1, Math.min(max, Math.floor(qty || 0)));
  const submit = () => confirm(safeQty);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Drop item"
      className="pointer-events-auto absolute inset-0 z-30 flex items-center justify-center bg-[rgba(44,40,32,0.45)] p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) cancel();
      }}
    >
      <div className="w-full max-w-sm rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[0_24px_64px_-24px_rgba(44,40,32,0.5)]">
        <p className="font-mono text-[11px] uppercase tracking-wider text-[var(--color-fg-muted)]">
          Drop · stack of {max}
        </p>
        <h2 className="mt-1 flex items-center gap-2 text-lg font-medium leading-tight text-[var(--color-fg)]">
          <TileChip name={meta.frame} size={20} rounded="md" />
          {meta.label}
        </h2>
        <p className="mt-2 text-sm text-[var(--color-fg-muted)]">
          They will fall to the ground at your feet. You can pick them back up
          unless something else covers the tile.
        </p>
        <label className="mt-4 block">
          <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-fg-muted)]">
            How many
          </span>
          <input
            ref={inputRef}
            type="number"
            min={1}
            max={max}
            step={1}
            inputMode="numeric"
            value={qty}
            onChange={(e) => setQty(Number(e.target.value))}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              else if (e.key === "Escape") cancel();
            }}
            className="mt-1 w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-warm)] px-3 py-2.5 text-sm text-[var(--color-fg)] outline-none focus:border-[var(--color-accent)]"
          />
        </label>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            onClick={cancel}
            className="tactile inline-flex items-center justify-center rounded-full px-3 py-2 text-sm text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-warm)]"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={safeQty <= 0}
            className="tactile inline-flex items-center justify-center gap-1.5 rounded-2xl bg-[var(--color-accent)] px-4 py-2.5 text-sm font-medium text-[var(--color-bg)] shadow-[0_8px_24px_-12px_rgba(217,104,70,0.5)] disabled:cursor-not-allowed disabled:bg-[var(--color-surface-warm)] disabled:text-[var(--color-fg-muted)] disabled:shadow-none"
          >
            <Trash size={14} weight="fill" />
            Drop {safeQty}
          </button>
        </div>
      </div>
    </div>
  );
}
