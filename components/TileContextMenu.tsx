"use client";

import { useLayoutEffect, useRef, useState } from "react";
import {
  ArrowSquareOut,
  Footprints,
  Hand,
  Package,
} from "@phosphor-icons/react/dist/ssr";
import { useGameStore } from "@/lib/state/game-store";
import { RESOURCES } from "@/content/resources";
import { useOutsideClose } from "@/lib/ui/use-outside-close";
import { mergeRefs } from "@/lib/ui/merge-refs";
import TileChip from "@/components/panels/TileChip";

const MARGIN = 8;
const MENU_WIDTH = 200;

export default function TileContextMenu() {
  const ctx = useGameStore((s) => s.tileContextMenu);
  if (!ctx) return null;
  return <Inner ctx={ctx} />;
}

function Inner({
  ctx,
}: {
  ctx: NonNullable<ReturnType<typeof useGameStore.getState>["tileContextMenu"]>;
}) {
  const close = useGameStore((s) => s.closeTileContextMenu);
  const pickupLootAt = useGameStore((s) => s.pickupLootAt);
  const collectResourceAt = useGameStore((s) => s.collectResourceAt);
  const walkPlayerTo = useGameStore((s) => s.walkPlayerTo);
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useOutsideClose(true, close);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    let left = ctx.x;
    let top = ctx.y;
    if (left + rect.width + MARGIN > window.innerWidth) left = ctx.x - rect.width;
    if (top + rect.height + MARGIN > window.innerHeight) top = ctx.y - rect.height;
    left = Math.max(MARGIN, Math.min(left, window.innerWidth - rect.width - MARGIN));
    top = Math.max(MARGIN, Math.min(top, window.innerHeight - rect.height - MARGIN));
    setPos({ left, top });
  }, [ctx.x, ctx.y, ctx.kind]);

  const walk = () => {
    walkPlayerTo(ctx.gx, ctx.gy);
    close();
  };

  return (
    <div
      ref={mergeRefs(ref, closeRef)}
      role="menu"
      aria-label={
        ctx.kind === "loot"
          ? "Pile actions"
          : ctx.kind === "resource"
            ? "Resource actions"
            : "Tile actions"
      }
      onContextMenu={(e) => e.preventDefault()}
      className="pointer-events-auto fixed z-40 overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-[0_20px_48px_-20px_rgba(44,40,32,0.45)]"
      style={{
        left: pos?.left ?? ctx.x,
        top: pos?.top ?? ctx.y,
        width: MENU_WIDTH,
        visibility: pos ? "visible" : "hidden",
      }}
    >
      <Header ctx={ctx} />
      {ctx.kind === "loot" && (
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            pickupLootAt(ctx.rx, ctx.ry, ctx.lx, ctx.ly, ctx.lootId);
            close();
          }}
          className="tactile flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--color-fg)] hover:bg-[var(--color-surface-warm)]"
        >
          <Hand size={14} weight="duotone" className="text-[var(--color-accent)]" />
          Pick up
        </button>
      )}
      {ctx.kind === "resource" && (
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            collectResourceAt(ctx.rx, ctx.ry, ctx.lx, ctx.ly, ctx.resourceId);
            close();
          }}
          className="tactile flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--color-fg)] hover:bg-[var(--color-surface-warm)]"
        >
          <Hand size={14} weight="duotone" className="text-[var(--color-accent)]" />
          Gather
        </button>
      )}
      <button
        type="button"
        role="menuitem"
        onClick={walk}
        className="tactile flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--color-fg)] hover:bg-[var(--color-surface-warm)]"
      >
        <Footprints size={14} weight="duotone" />
        Walk here
      </button>
    </div>
  );
}

function Header({
  ctx,
}: {
  ctx: NonNullable<ReturnType<typeof useGameStore.getState>["tileContextMenu"]>;
}) {
  if (ctx.kind === "loot") {
    const summary = ctx.items
      .filter(([, n]) => n > 0)
      .slice(0, 3)
      .map(([k, n]) => `${RESOURCES[k]?.label ?? k} ×${n}`)
      .join(", ");
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-[var(--color-fg-muted)]">
        <Package size={12} weight="duotone" />
        <span className="truncate">{summary || "Pile"}</span>
      </div>
    );
  }
  if (ctx.kind === "resource") {
    const meta = RESOURCES[ctx.resourceKind];
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-[var(--color-fg-muted)]">
        <TileChip name={meta.frame} size={14} rounded="sm" />
        <span className="truncate">{meta.label}</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-[var(--color-fg-muted)]">
      <ArrowSquareOut size={12} weight="duotone" />
      <span>Tile</span>
    </div>
  );
}
