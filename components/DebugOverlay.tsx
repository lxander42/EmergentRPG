"use client";

import { useMemo, useRef, useState } from "react";
import { Bug, X } from "@phosphor-icons/react/dist/ssr";
import { useGameStore } from "@/lib/state/game-store";
import { globalToLocal } from "@/lib/sim/biome-interior";
import { TOOL_KINDS, TOOLS, type ToolKind } from "@/lib/sim/tools";

const BUBBLE_SIZE = 44;
const PANEL_WIDTH = 280;
const PANEL_MIN_HEIGHT = 220;
const DRAG_THRESHOLD_PX = 4;

export default function DebugOverlay() {
  const debugMode = useGameStore((s) => s.debugMode);
  const minimized = useGameStore((s) => s.debugMinimized);
  const toggleMinimized = useGameStore((s) => s.toggleDebugMinimized);
  const storedPos = useGameStore((s) => s.debugBubblePos);
  const setPos = useGameStore((s) => s.setDebugBubblePos);
  const [pos, setLocalPos] = useState<{ x: number; y: number } | null>(() => {
    if (storedPos) return storedPos;
    if (typeof window === "undefined") return null;
    return { x: 12, y: window.innerHeight - BUBBLE_SIZE - 12 };
  });
  const dragState = useRef<{
    startPointerX: number;
    startPointerY: number;
    startPosX: number;
    startPosY: number;
    moved: boolean;
  } | null>(null);

  if (!debugMode || !pos) return null;

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragState.current = {
      startPointerX: e.clientX,
      startPointerY: e.clientY,
      startPosX: pos.x,
      startPosY: pos.y,
      moved: false,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const ds = dragState.current;
    if (!ds) return;
    const dx = e.clientX - ds.startPointerX;
    const dy = e.clientY - ds.startPointerY;
    if (!ds.moved && Math.abs(dx) + Math.abs(dy) > DRAG_THRESHOLD_PX) {
      ds.moved = true;
    }
    if (!ds.moved) return;
    const nextX = clamp(ds.startPosX + dx, 4, window.innerWidth - BUBBLE_SIZE - 4);
    const nextY = clamp(ds.startPosY + dy, 4, window.innerHeight - BUBBLE_SIZE - 4);
    setLocalPos({ x: nextX, y: nextY });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const ds = dragState.current;
    if (!ds) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    dragState.current = null;
    if (ds.moved) {
      setPos(pos.x, pos.y);
    } else {
      // Treat as a tap → toggle the panel.
      toggleMinimized();
    }
  };

  if (minimized) {
    return (
      <button
        type="button"
        aria-label="Open debug overlay"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => {
          dragState.current = null;
        }}
        className="tactile pointer-events-auto fixed z-30 inline-flex items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-fg)] shadow-[0_4px_12px_-6px_rgba(44,40,32,0.18)]"
        style={{
          left: pos.x,
          top: pos.y,
          width: BUBBLE_SIZE,
          height: BUBBLE_SIZE,
          touchAction: "none",
          cursor: "grab",
        }}
      >
        <Bug size={18} weight="fill" className="text-[var(--color-accent)]" />
      </button>
    );
  }

  // Panel anchored to the bubble's stored position. Place it above-and-right of
  // the bubble, but flip to fit within the viewport.
  const panelStyle: React.CSSProperties = (() => {
    if (typeof window === "undefined") return { left: pos.x, top: pos.y };
    const margin = 8;
    let left = pos.x + BUBBLE_SIZE + margin;
    let top = pos.y - PANEL_MIN_HEIGHT + BUBBLE_SIZE;
    if (left + PANEL_WIDTH + margin > window.innerWidth) {
      left = pos.x - PANEL_WIDTH - margin;
    }
    if (left < margin) left = margin;
    if (top < margin) top = margin;
    if (top + PANEL_MIN_HEIGHT + margin > window.innerHeight) {
      top = window.innerHeight - PANEL_MIN_HEIGHT - margin;
    }
    return { left, top, width: PANEL_WIDTH };
  })();

  return (
    <>
      <button
        type="button"
        aria-label="Move debug bubble"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => {
          dragState.current = null;
        }}
        className="tactile pointer-events-auto fixed z-30 inline-flex items-center justify-center rounded-full border border-[var(--color-accent)] bg-[var(--color-surface)] text-[var(--color-accent)] shadow-[0_4px_12px_-6px_rgba(44,40,32,0.18)]"
        style={{
          left: pos.x,
          top: pos.y,
          width: BUBBLE_SIZE,
          height: BUBBLE_SIZE,
          touchAction: "none",
          cursor: "grab",
        }}
      >
        <Bug size={18} weight="fill" />
      </button>
      <DebugPanel onClose={toggleMinimized} style={panelStyle} />
    </>
  );
}

function DebugPanel({
  onClose,
  style,
}: {
  onClose: () => void;
  style: React.CSSProperties;
}) {
  const world = useGameStore((s) => s.world);
  const grantTool = useGameStore((s) => s.debugGrantTool);

  const factionLines = useMemo(() => {
    if (!world) return [];
    return world.factions.map((f) => ({
      id: f.id,
      pwr: f.power,
      rep: world.playerReputation[f.id] ?? 0,
    }));
  }, [world]);

  if (!world) return null;
  const player = world.life?.player ?? null;
  const here = player ? globalToLocal(player.gx, player.gy) : null;
  const inRegion = here
    ? world.npcs.filter((n) => n.rx === here.rx && n.ry === here.ry).length
    : 0;

  return (
    <aside
      role="status"
      aria-label="Debug stats"
      className="pointer-events-auto fixed z-30 max-h-[70dvh] overflow-y-auto rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 font-mono text-[10px] leading-tight text-[var(--color-fg)] shadow-[0_8px_24px_-12px_rgba(44,40,32,0.45)]"
      style={style}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-[var(--color-fg-muted)] uppercase tracking-wider">Debug</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Minimize debug overlay"
          className="tactile -my-0.5 -mr-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-warm)] hover:text-[var(--color-fg)]"
        >
          <X size={10} weight="bold" />
        </button>
      </div>
      <div className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
        <span className="text-[var(--color-fg-muted)]">npcs</span>
        <span className="tabular-nums">{world.npcs.length}</span>
        <span className="text-[var(--color-fg-muted)]">tick</span>
        <span className="tabular-nums">{world.ticks}</span>
        {player && here && (
          <>
            <span className="text-[var(--color-fg-muted)]">player</span>
            <span className="tabular-nums">
              g({player.gx},{player.gy}) r({here.rx},{here.ry})
            </span>
            <span className="text-[var(--color-fg-muted)]">in-region</span>
            <span className="tabular-nums">{inRegion}</span>
          </>
        )}
      </div>
      <div className="mt-1 border-t border-[var(--color-border)] pt-1">
        {factionLines.map((f) => (
          <div key={f.id} className="flex justify-between gap-4">
            <span className="text-[var(--color-fg-muted)]">{f.id}</span>
            <span className="tabular-nums">
              pwr {f.pwr} · rep {f.rep}
            </span>
          </div>
        ))}
      </div>
      {player && (
        <div className="mt-1 border-t border-[var(--color-border)] pt-1">
          <div className="text-[var(--color-fg-muted)] uppercase tracking-wider mb-1">
            grant tool
          </div>
          <div className="flex flex-wrap gap-1">
            {TOOL_KINDS.map((kind: ToolKind) => (
              <button
                key={kind}
                type="button"
                onClick={() => grantTool(kind)}
                className="tactile rounded-md border border-[var(--color-border)] bg-[var(--color-surface-warm)] px-2 py-0.5 text-[10px] uppercase tracking-wider hover:bg-[var(--color-surface)]"
              >
                {TOOLS[kind].label}
              </button>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
