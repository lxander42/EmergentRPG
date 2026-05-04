"use client";

import { Eye, Hammer } from "@phosphor-icons/react/dist/ssr";
import { useEffect, useMemo, useRef, useState } from "react";
import { useGameStore } from "@/lib/state/game-store";
import type { ObstacleKind } from "@/lib/sim/biome-interior";
import { hasTool } from "@/lib/sim/tools";

const MENU_WIDTH = 220;
const MENU_HEIGHT_EST = 200;
const MENU_OFFSET = 16;
const MENU_PADDING = 12;

const OBSTACLE_LABEL: Record<ObstacleKind, string> = {
  tree: "Tree",
  rock: "Rock",
  cactus: "Cactus",
  bush: "Bush",
  workbench: "Workbench",
};

const OBSTACLE_BLURB: Record<ObstacleKind, string> = {
  tree: "Sturdy wood. Needs an axe to chop.",
  rock: "Stone, maybe ore. Needs a pickaxe.",
  cactus: "Spiny. Best to walk around.",
  bush: "Low growth. Nothing to harvest.",
  workbench: "A bench for tools and advanced weapons.",
};

type ActionDef = {
  id: string;
  label: string;
  description?: string;
  primary?: boolean;
  disabled?: boolean;
  icon: "eye" | "hammer";
  onClick: () => void;
};

export default function ObstacleContextMenu() {
  const ctx = useGameStore((s) => s.obstacleContextMenu);
  const close = useGameStore((s) => s.closeObstacleContextMenu);
  const interact = useGameStore((s) => s.interactWithObstacle);
  const player = useGameStore((s) => s.world?.life?.player ?? null);

  const ref = useRef<HTMLDivElement | null>(null);
  const dragOffset = useRef<{ dx: number; dy: number } | null>(null);
  const [drag, setDrag] = useState<{ left: number; top: number } | null>(null);

  const lastKeyRef = useRef<string | null>(null);
  const ctxKey = ctx ? `${ctx.rx}-${ctx.ry}-${ctx.lx}-${ctx.ly}` : null;
  if (ctxKey !== lastKeyRef.current) {
    lastKeyRef.current = ctxKey;
    if (drag !== null) {
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

  if (!ctx || !player || !pos) return null;
  const { rx, ry, lx, ly, kind, remembered } = ctx;
  const label = OBSTACLE_LABEL[kind];
  const blurb = remembered
    ? "Out of sight. You remember it being here."
    : OBSTACLE_BLURB[kind];

  const actions: ActionDef[] = [
    {
      id: "examine",
      label: "Examine",
      icon: "eye",
      onClick: () => close(),
    },
  ];
  if (!remembered && kind === "tree") {
    const have = hasTool(player.tools, "axe");
    actions.push({
      id: "chop",
      label: "Chop",
      description: have ? "drops wood · uses axe" : "needs axe",
      primary: true,
      disabled: !have,
      icon: "hammer",
      onClick: () => {
        if (!have) return;
        interact(rx, ry, lx, ly, "harvest");
      },
    });
  } else if (!remembered && kind === "rock") {
    const have = hasTool(player.tools, "pickaxe");
    actions.push({
      id: "mine",
      label: "Mine",
      description: have ? "drops stone · rare ore" : "needs pickaxe",
      primary: true,
      disabled: !have,
      icon: "hammer",
      onClick: () => {
        if (!have) return;
        interact(rx, ry, lx, ly, "harvest");
      },
    });
  } else if (!remembered && kind === "workbench") {
    actions.push({
      id: "craft",
      label: "Craft",
      description: "open workbench",
      primary: true,
      icon: "hammer",
      onClick: () => interact(rx, ry, lx, ly, "workbench"),
    });
    actions.push({
      id: "deconstruct",
      label: "Deconstruct",
      description: "recover materials",
      icon: "hammer",
      onClick: () => interact(rx, ry, lx, ly, "deconstruct"),
    });
  }

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
      aria-label={`${label} actions`}
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
        <ObstacleSwatch kind={kind} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-[var(--color-fg)]">
            {label}
          </div>
          <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-fg-muted)]">
            r({rx},{ry}) · drag to move
          </div>
        </div>
      </div>
      <div className="my-0.5 h-px bg-[var(--color-border)]" aria-hidden />
      <p className="px-2.5 pb-1 pt-0.5 text-xs leading-snug text-[var(--color-fg-muted)]">
        {blurb}
      </p>
      <div className="my-0.5 h-px bg-[var(--color-border)]" aria-hidden />
      {actions.map((a) => (
        <button
          key={a.id}
          onClick={a.onClick}
          disabled={a.disabled}
          className={`tactile inline-flex items-center gap-2 rounded-xl px-2 py-2 text-left text-sm hover:bg-[var(--color-surface-warm)] disabled:cursor-not-allowed disabled:opacity-50 ${
            a.primary
              ? "text-[var(--color-accent)]"
              : "text-[var(--color-fg)]"
          }`}
        >
          {a.icon === "eye" ? (
            <Eye size={14} weight="duotone" className="text-[var(--color-fg-muted)]" />
          ) : (
            <Hammer size={14} weight="fill" />
          )}
          <span className="min-w-0 flex-1">
            <span className="block leading-tight">{a.label}</span>
            {a.description && (
              <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-wider text-[var(--color-fg-muted)]">
                {a.description}
              </span>
            )}
          </span>
        </button>
      ))}
    </div>
  );
}

function ObstacleSwatch({ kind }: { kind: ObstacleKind }) {
  const color =
    kind === "tree"
      ? "#5d8055"
      : kind === "rock"
        ? "#8a8474"
        : kind === "cactus"
          ? "#7aa05c"
          : kind === "bush"
            ? "#6b9a55"
            : "#d96846";
  return (
    <span
      aria-hidden
      className="h-2.5 w-2.5 shrink-0 rounded-sm border border-[var(--color-border-strong)]"
      style={{ background: color }}
    />
  );
}

function clamp(v: number, lo: number, hi: number): number {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}
