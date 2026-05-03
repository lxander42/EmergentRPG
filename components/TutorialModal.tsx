"use client";

import { useState } from "react";
import {
  ArrowRight,
  Compass,
  Footprints,
  Hammer,
  Heart,
  House,
  Lightning,
  Package,
  Sword,
} from "@phosphor-icons/react/dist/ssr";
import { useGameStore } from "@/lib/state/game-store";

type Page = {
  icon: React.ReactNode;
  title: string;
  body: string;
};

const PAGES: Page[] = [
  {
    icon: <Compass size={28} weight="duotone" className="text-[var(--color-accent)]" />,
    title: "A small living world",
    body:
      "Three factions wander a 32×32 grid of biomes. Their stories happen whether you're watching or not. Your job is to survive, claim a home, and shape the politics around you.",
  },
  {
    icon: <House size={28} weight="duotone" className="text-[var(--color-accent)]" />,
    title: "Claim a home base",
    body:
      "Tap a passable region on the world map to claim it as home. From there you'll forage, craft, and venture out. Pick a region close to forest or stone — you'll need their materials.",
  },
  {
    icon: <Footprints size={28} weight="duotone" className="text-[var(--color-accent)]" />,
    title: "Walk and travel",
    body:
      "Inside a biome, tap a tile to walk to it. Tap a region from the world map and choose Travel here to walk further. The map and biome views toggle from the home button in the top pill.",
  },
  {
    icon: (
      <span className="inline-flex items-center gap-2">
        <Heart size={26} weight="fill" className="text-[var(--color-accent)]" />
        <Lightning size={26} weight="fill" className="text-[var(--color-accent)]" />
      </span>
    ),
    title: "Health and energy",
    body:
      "Walking costs energy. At zero energy you start to starve and lose health. Eat foraged food (berries, grain, herbs, shellfish, tubers) to restore both.",
  },
  {
    icon: <Package size={28} weight="duotone" className="text-[var(--color-accent)]" />,
    title: "Inventory",
    body:
      "Tap the inventory pill in the top right to see what you've gathered, what weapons you carry, and what you can craft.",
  },
  {
    icon: <Hammer size={28} weight="duotone" className="text-[var(--color-accent)]" />,
    title: "Crafting weapons",
    body:
      "Open the inventory and craft a stick, club, or sling. Wood comes from forests, stone from rocky regions, reed from grasslands and beaches. Weapons equip implicitly — your strongest in-range weapon swings.",
  },
  {
    icon: <Sword size={28} weight="duotone" className="text-[var(--color-accent)]" />,
    title: "Combat",
    body:
      "Tap an NPC to inspect them. If you tap Attack, you'll lunge at the next opportunity — but you'll lose reputation with their faction, and they'll fight back. Watch for the small pulsing dot in the health pill: that means a hostile is in your region.",
  },
];

export default function TutorialModal() {
  const open = useGameStore((s) => s.tutorialOpen);
  const close = useGameStore((s) => s.closeTutorial);
  const [page, setPage] = useState(0);

  if (!open) return null;
  const current = PAGES[page]!;
  const last = page === PAGES.length - 1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="How to play"
      className="pointer-events-auto absolute inset-0 z-30 flex items-center justify-center bg-[rgba(44,40,32,0.55)] p-6"
    >
      <div className="flex max-h-[80dvh] w-full max-w-md flex-col rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[0_24px_64px_-24px_rgba(44,40,32,0.5)]">
        <div className="flex items-start gap-3">
          <span aria-hidden className="mt-0.5">
            {current.icon}
          </span>
          <div>
            <p className="font-mono text-[11px] uppercase tracking-wider text-[var(--color-fg-muted)]">
              {page + 1} of {PAGES.length}
            </p>
            <h2 className="mt-1 text-xl font-medium leading-tight text-[var(--color-fg)]">
              {current.title}
            </h2>
          </div>
        </div>

        <p className="mt-4 text-sm leading-relaxed text-[var(--color-fg-muted)] max-w-[60ch]">
          {current.body}
        </p>

        <div className="mt-auto flex items-center justify-between pt-6">
          <button
            onClick={() => {
              setPage(0);
              close();
            }}
            className="tactile inline-flex items-center justify-center rounded-full px-3 py-2 text-sm text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-warm)]"
          >
            Skip
          </button>
          <div className="flex items-center gap-2">
            {page > 0 && (
              <button
                onClick={() => setPage(page - 1)}
                className="tactile inline-flex items-center justify-center rounded-full border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-fg)] hover:bg-[var(--color-surface-warm)]"
              >
                Back
              </button>
            )}
            <button
              onClick={() => {
                if (last) {
                  setPage(0);
                  close();
                } else {
                  setPage(page + 1);
                }
              }}
              className="tactile inline-flex items-center justify-center gap-1 rounded-2xl bg-[var(--color-accent)] px-4 py-2.5 text-sm font-medium text-[var(--color-bg)] shadow-[0_8px_24px_-12px_rgba(217,104,70,0.5)]"
            >
              {last ? "Begin" : "Next"}
              {!last && <ArrowRight size={14} weight="bold" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
