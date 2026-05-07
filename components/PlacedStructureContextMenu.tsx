"use client";

import { Eye, Flame, Hammer } from "@phosphor-icons/react/dist/ssr";
import { useMemo, useRef, useState } from "react";
import { useGameStore } from "@/lib/state/game-store";
import type { StructureKind } from "@/content/recipes";
import { useOutsideClose } from "@/lib/ui/use-outside-close";
import { mergeRefs } from "@/lib/ui/merge-refs";

const MENU_WIDTH = 220;
const MENU_HEIGHT_EST = 180;
const MENU_PADDING = 12;

const STRUCTURE_LABEL: Record<StructureKind, string> = {
  workbench: "Workbench",
  furnace: "Furnace",
  anvil: "Anvil",
  wall_wood: "Wood wall",
  wall_stone: "Stone wall",
  wall_iron: "Iron wall",
  door: "Door",
  chest: "Chest",
  bed: "Bed",
  campfire: "Campfire",
  floor_tile: "Floor tile",
  sign: "Sign",
  fence: "Fence",
};

export default function PlacedStructureContextMenu() {
  const ctx = useGameStore((s) => s.placedStructureContextMenu);
  const close = useGameStore((s) => s.closePlacedStructureContextMenu);
  const interact = useGameStore((s) => s.interactWithPlacedStructure);
  const examineKind = useGameStore((s) => s.examineKind);
  const examined = useGameStore((s) => s.world?.examinedKinds ?? null);
  const pushToast = useGameStore((s) => s.pushToast);

  const ref = useRef<HTMLDivElement | null>(null);
  const closeRef = useOutsideClose(Boolean(ctx), close);
  const dragOffset = useRef<{ dx: number; dy: number } | null>(null);
  const [drag, setDrag] = useState<{ left: number; top: number } | null>(null);

  const lastKeyRef = useRef<string | null>(null);
  const ctxKey = ctx ? `${ctx.rx}-${ctx.ry}-${ctx.structureId}` : null;
  if (ctxKey !== lastKeyRef.current) {
    lastKeyRef.current = ctxKey;
    if (drag !== null) {
      Promise.resolve().then(() => setDrag(null));
    }
  }

  const pos = useMemo(() => {
    if (!ctx) return null;
    if (drag) return drag;
    const vw = typeof window === "undefined" ? 1024 : window.innerWidth;
    // Player-built structures get a stable top-right anchor so actions like
    // deconstruct don't crowd the tap point.
    return {
      left: vw - MENU_WIDTH - MENU_PADDING,
      top: MENU_PADDING + 72,
    };
  }, [ctx, drag]);

  if (!ctx || !pos) return null;
  const { rx, ry, kind, structureId } = ctx;
  const label = STRUCTURE_LABEL[kind];
  const isExamined = Boolean(examined && examined[`structure:${kind}`]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (!ref.current) return;
    if ((e.target as Element).closest("button")) return;
    const rect = ref.current.getBoundingClientRect();
    dragOffset.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragOffset.current) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const left = clamp(
      e.clientX - dragOffset.current.dx,
      MENU_PADDING,
      vw - MENU_WIDTH - MENU_PADDING,
    );
    const top = clamp(
      e.clientY - dragOffset.current.dy,
      MENU_PADDING,
      vh - MENU_HEIGHT_EST - MENU_PADDING,
    );
    setDrag({ left, top });
  };
  const onPointerUp = (e: React.PointerEvent) => {
    dragOffset.current = null;
    (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
  };

  return (
    <div
      ref={mergeRefs(ref, closeRef)}
      role="menu"
      aria-label={`${label} actions`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className="pointer-events-auto absolute z-30 flex touch-none select-none flex-col rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-1.5 shadow-[0_16px_40px_-16px_rgba(44,40,32,0.45)]"
      style={{ left: pos.left, top: pos.top, width: MENU_WIDTH }}
    >
      <div className="flex items-center gap-2 px-2 py-1.5">
        <span
          aria-hidden
          className="h-2.5 w-2.5 shrink-0 rounded-sm border border-[var(--color-border-strong)]"
          style={{ background: "#a97f4f" }}
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-[var(--color-fg)]">
            {label}
          </div>
          <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-fg-muted)]">
            ({rx},{ry})
          </div>
        </div>
      </div>
      <div className="my-0.5 h-px bg-[var(--color-border)]" aria-hidden />
      {isExamined && (
        <>
          <p className="px-2.5 pb-1 pt-0.5 text-xs leading-snug text-[var(--color-fg-muted)]">
            A structure you built. Deconstruct to recover its materials.
          </p>
          <div className="my-0.5 h-px bg-[var(--color-border)]" aria-hidden />
        </>
      )}
      {kind === "furnace" && (
        <button
          type="button"
          onClick={() => {
            pushToast("Smelting will arrive with the smelt loop.");
            close();
          }}
          className="tactile inline-flex items-center gap-2 rounded-xl px-2 py-2 text-left text-sm text-[var(--color-fg)] hover:bg-[var(--color-surface-warm)]"
        >
          <Flame size={14} weight="duotone" className="text-[var(--color-accent)]" />
          <span className="min-w-0 flex-1">
            <span className="block leading-tight">Smelt</span>
            <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-wider text-[var(--color-fg-muted)]">
              coming soon
            </span>
          </span>
        </button>
      )}
      <button
        type="button"
        onClick={() => examineKind(`structure:${kind}`)}
        className="tactile inline-flex items-center gap-2 rounded-xl px-2 py-2 text-left text-sm text-[var(--color-fg)] hover:bg-[var(--color-surface-warm)]"
      >
        <Eye size={14} weight="duotone" className="text-[var(--color-fg-muted)]" />
        <span className="min-w-0 flex-1">
          <span className="block leading-tight">Examine</span>
        </span>
      </button>
      <button
        type="button"
        onClick={() => interact(rx, ry, structureId, "deconstruct")}
        className="tactile inline-flex items-center gap-2 rounded-xl px-2 py-2 text-left text-sm text-[var(--color-accent)] hover:bg-[var(--color-surface-warm)]"
      >
        <Hammer size={14} weight="fill" />
        <span className="min-w-0 flex-1">
          <span className="block leading-tight">Deconstruct</span>
          <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-wider text-[var(--color-fg-muted)]">
            recover full materials
          </span>
        </span>
      </button>
    </div>
  );
}

function clamp(v: number, lo: number, hi: number): number {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}
