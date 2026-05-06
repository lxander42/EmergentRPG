"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Bug,
  House,
  Info,
  List,
  Pause,
  Play,
  X,
} from "@phosphor-icons/react/dist/ssr";
import { useGameStore } from "@/lib/state/game-store";
import { useOutsideClose } from "@/lib/ui/use-outside-close";

export default function HudMenu() {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const ref = useOutsideClose(open, close);
  const paused = useGameStore((s) => s.paused);
  const togglePause = useGameStore((s) => s.togglePause);
  const debugMode = useGameStore((s) => s.debugMode);
  const toggleDebug = useGameStore((s) => s.toggleDebug);
  const openTutorial = useGameStore((s) => s.openTutorial);

  return (
    <div className="relative" ref={ref}>
      <button
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="tactile inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-fg)] shadow-[0_4px_12px_-6px_rgba(44,40,32,0.18)]"
      >
        {open ? <X size={18} weight="bold" /> : <List size={18} weight="bold" />}
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Game menu"
          className="absolute bottom-12 right-0 z-30 w-56 overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-[0_20px_48px_-20px_rgba(44,40,32,0.35)]"
        >
          <button
            role="menuitem"
            onClick={() => {
              togglePause();
              close();
            }}
            className="tactile flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--color-fg)] hover:bg-[var(--color-surface-warm)]"
          >
            {paused ? <Play size={14} weight="fill" /> : <Pause size={14} weight="fill" />}
            {paused ? "Resume" : "Pause"}
          </button>
          <button
            role="menuitem"
            onClick={() => {
              openTutorial();
              close();
            }}
            className="tactile flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--color-fg)] hover:bg-[var(--color-surface-warm)]"
          >
            <Info size={14} weight="duotone" />
            How to play
          </button>
          <button
            role="menuitem"
            onClick={() => {
              toggleDebug();
              close();
            }}
            className="tactile flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--color-fg)] hover:bg-[var(--color-surface-warm)]"
          >
            <Bug
              size={14}
              weight={debugMode ? "fill" : "regular"}
              className={debugMode ? "text-[var(--color-accent)]" : undefined}
            />
            {debugMode ? "Hide debug overlay" : "Show debug overlay"}
          </button>
          <div className="my-1 border-t border-[var(--color-border)]" />
          <Link
            role="menuitem"
            href="/"
            onClick={close}
            className="tactile flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--color-fg)] hover:bg-[var(--color-surface-warm)]"
          >
            <House size={14} weight="duotone" />
            Return to main menu
          </Link>
        </div>
      )}
    </div>
  );
}
