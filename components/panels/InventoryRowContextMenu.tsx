"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ForkKnife, Trash } from "@phosphor-icons/react/dist/ssr";
import { useGameStore } from "@/lib/state/game-store";
import { RESOURCES, type ResourceKind } from "@/content/resources";

const MARGIN = 8;

// Anchored, click-positioned context menu that opens when the user
// right-clicks (desktop) or long-presses (touch) a row in the inventory
// panel. Replaces the immediate-drop / browser-contextmenu fight from
// before — we render our own surface, so no preventDefault timing race
// with the user's browser is in play.
export default function InventoryRowContextMenu() {
  const menu = useGameStore((s) => s.inventoryRowMenu);
  if (!menu) return null;
  return <Inner key={`${menu.kind}:${menu.x}:${menu.y}`} kind={menu.kind} count={menu.count} x={menu.x} y={menu.y} />;
}

function Inner({
  kind,
  count,
  x,
  y,
}: {
  kind: ResourceKind;
  count: number;
  x: number;
  y: number;
}) {
  const close = useGameStore((s) => s.closeInventoryRowMenu);
  const dropInventoryItem = useGameStore((s) => s.dropInventoryItem);
  const requestDropConfirm = useGameStore((s) => s.requestDropConfirm);
  const eatFood = useGameStore((s) => s.eatFood);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const meta = RESOURCES[kind];

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    let left = x;
    let top = y;
    if (left + rect.width + MARGIN > window.innerWidth) {
      left = window.innerWidth - rect.width - MARGIN;
    }
    if (top + rect.height + MARGIN > window.innerHeight) {
      top = window.innerHeight - rect.height - MARGIN;
    }
    if (left < MARGIN) left = MARGIN;
    if (top < MARGIN) top = MARGIN;
    setPos({ left, top });
  }, [x, y]);

  useEffect(() => {
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
  }, [close]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  const dropOne = () => {
    dropInventoryItem(kind, 1);
    close();
  };
  const dropAll = () => {
    if (count >= 5) {
      requestDropConfirm(kind, count);
    } else {
      dropInventoryItem(kind, count);
    }
    close();
  };
  const eat = () => {
    eatFood(kind);
    close();
  };

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={`${meta.label} options`}
      onContextMenu={(e) => e.preventDefault()}
      className="pointer-events-auto fixed z-40 w-48 overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-[0_20px_48px_-20px_rgba(44,40,32,0.45)]"
      style={{
        left: pos?.left ?? x,
        top: pos?.top ?? y,
        visibility: pos ? "visible" : "hidden",
      }}
    >
      <p className="px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-[var(--color-fg-muted)]">
        {meta.label} · {count}
      </p>
      {meta.food && (
        <button
          type="button"
          role="menuitem"
          onClick={eat}
          className="tactile flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--color-fg)] hover:bg-[var(--color-surface-warm)]"
        >
          <ForkKnife size={14} weight="fill" className="text-[var(--color-accent)]" />
          Eat one
        </button>
      )}
      <button
        type="button"
        role="menuitem"
        onClick={dropOne}
        className="tactile flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--color-fg)] hover:bg-[var(--color-surface-warm)]"
      >
        <Trash size={14} weight="duotone" />
        Drop one
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={dropAll}
        disabled={count <= 1}
        className="tactile flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--color-fg)] hover:bg-[var(--color-surface-warm)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Trash size={14} weight="fill" className="text-[var(--color-accent)]" />
        {count >= 5 ? `Drop ${count}…` : `Drop all (${count})`}
      </button>
    </div>
  );
}
