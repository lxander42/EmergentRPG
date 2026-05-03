"use client";

import { Eye, Sword } from "@phosphor-icons/react/dist/ssr";
import { useEffect, useMemo, useRef, useState } from "react";
import { useGameStore } from "@/lib/state/game-store";
import { findNpc } from "@/lib/sim/world";

const MENU_WIDTH = 180;
const MENU_HEIGHT_EST = 152;
const MENU_OFFSET = 16;
const MENU_PADDING = 12;

export default function NpcContextMenu() {
  const ctx = useGameStore((s) => s.npcContextMenu);
  const close = useGameStore((s) => s.closeNpcContextMenu);
  const attackNpc = useGameStore((s) => s.attackNpc);
  const selectNpc = useGameStore((s) => s.selectNpc);
  const world = useGameStore((s) => s.world);
  const ref = useRef<HTMLDivElement | null>(null);
  const dragOffset = useRef<{ dx: number; dy: number } | null>(null);
  const [drag, setDrag] = useState<{ left: number; top: number } | null>(null);

  // Reset drag override whenever the menu opens for a different NPC.
  const lastIdRef = useRef<string | null>(null);
  if (ctx?.id !== lastIdRef.current) {
    lastIdRef.current = ctx?.id ?? null;
    if (drag !== null) {
      // Defer the state reset to avoid setState-in-render lint warnings.
      Promise.resolve().then(() => setDrag(null));
    }
  }

  useEffect(() => {
    if (!ctx) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      if (!ref.current) return;
      if (ref.current.contains(e.target as Node)) return;
      close();
    };
    const t = window.setTimeout(() => {
      window.addEventListener("mousedown", handler);
      window.addEventListener("touchstart", handler);
    }, 0);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("mousedown", handler);
      window.removeEventListener("touchstart", handler);
    };
  }, [ctx, close]);

  const pos = useMemo(() => {
    if (!ctx) return null;
    if (drag) return drag;
    const vw = typeof window === "undefined" ? 1024 : window.innerWidth;
    const vh = typeof window === "undefined" ? 768 : window.innerHeight;
    const placeBelow = ctx.y < vh / 2;
    let left = ctx.x + MENU_OFFSET;
    let top = placeBelow ? ctx.y + MENU_OFFSET : ctx.y - MENU_HEIGHT_EST - MENU_OFFSET;
    left = clamp(left, MENU_PADDING, vw - MENU_WIDTH - MENU_PADDING);
    top = clamp(top, MENU_PADDING, vh - MENU_HEIGHT_EST - MENU_PADDING);
    return { left, top };
  }, [ctx, drag]);

  if (!ctx || !world || !pos) return null;
  const npc = findNpc(world, ctx.id);
  if (!npc) return null;

  const playerRep = world.playerReputation[npc.factionId] ?? 0;
  const stance = playerRep < 0 ? "Hostile" : playerRep > 0 ? "Friendly" : "Wary";
  const factionColor = "#" + npc.factionColor.toString(16).padStart(6, "0");

  const onPointerDown = (e: React.PointerEvent) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    dragOffset.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
    (e.target as Element).setPointerCapture?.(e.pointerId);
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
    (e.target as Element).releasePointerCapture?.(e.pointerId);
  };

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={`${npc.name} actions`}
      className="pointer-events-auto absolute z-30 flex flex-col rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-1.5 shadow-[0_16px_40px_-16px_rgba(44,40,32,0.45)]"
      style={{ left: pos.left, top: pos.top, width: MENU_WIDTH }}
    >
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="flex cursor-grab items-center gap-2 px-2 py-1.5 active:cursor-grabbing touch-none select-none"
      >
        <span
          aria-hidden
          className="h-2 w-2 shrink-0 rounded-sm border border-[var(--color-border-strong)]"
          style={{ background: factionColor }}
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-[var(--color-fg)]">
            {npc.name}
          </div>
          <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-fg-muted)]">
            {stance} · drag to move
          </div>
        </div>
      </div>
      <div className="my-0.5 h-px bg-[var(--color-border)]" aria-hidden />
      <button
        onClick={() => {
          selectNpc(ctx.id);
          close();
        }}
        className="tactile inline-flex items-center gap-2 rounded-xl px-2 py-2 text-left text-sm text-[var(--color-fg)] hover:bg-[var(--color-surface-warm)]"
      >
        <Eye size={14} weight="duotone" className="text-[var(--color-fg-muted)]" />
        Examine
      </button>
      {stance !== "Friendly" && (
        <button
          onClick={() => {
            attackNpc(ctx.id);
            close();
          }}
          className="tactile inline-flex items-center gap-2 rounded-xl px-2 py-2 text-left text-sm text-[var(--color-accent)] hover:bg-[var(--color-surface-warm)]"
        >
          <Sword size={14} weight="fill" />
          Attack
        </button>
      )}
    </div>
  );
}

function clamp(v: number, lo: number, hi: number): number {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}
