"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, BookmarkSimple } from "@phosphor-icons/react/dist/ssr";
import { hasSave } from "@/lib/save/db";

export default function Landing() {
  const [savedSlot, setSavedSlot] = useState<string | null>(null);

  useEffect(() => {
    hasSave("default").then((exists) => setSavedSlot(exists ? "default" : null));
  }, []);

  return (
    <main className="grid min-h-[100dvh] grid-rows-[1fr_auto] px-6 py-8">
      <section className="flex flex-col justify-center gap-10 pt-6">
        <div className="flex items-center gap-3">
          <Logo />
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">
            v0.1
          </span>
        </div>

        <div className="max-w-md">
          <h1 className="text-[2.75rem] font-medium leading-[1.05] tracking-tight text-[var(--color-fg)]">
            A small world, <br /> running on its own.
          </h1>
          <p className="mt-5 text-base leading-relaxed text-[var(--color-fg-muted)] max-w-[34ch]">
            Walk a tile-grid country of stubborn NPCs and three quietly competing factions. They
            keep moving whether you watch or not.
          </p>
        </div>

        <nav className="flex w-full max-w-sm flex-col gap-3">
          <Link
            href="/play?new=1"
            className="tactile group flex items-center justify-between rounded-2xl bg-[var(--color-fg)] px-5 py-4 text-base font-medium text-[var(--color-bg)] shadow-[0_8px_24px_-12px_rgba(44,40,32,0.35)]"
          >
            <span>New game</span>
            <ArrowRight
              size={20}
              weight="bold"
              className="transition-transform duration-200 group-hover:translate-x-0.5"
            />
          </Link>

          <Link
            href={savedSlot ? "/play" : "#"}
            aria-disabled={!savedSlot}
            tabIndex={savedSlot ? 0 : -1}
            className={
              "tactile flex items-center justify-between rounded-2xl border bg-[var(--color-surface)] px-5 py-4 text-base font-medium " +
              (savedSlot
                ? "border-[var(--color-border)] text-[var(--color-fg)]"
                : "pointer-events-none border-[var(--color-border)] text-[var(--color-fg-muted)] opacity-60")
            }
          >
            <span>{savedSlot ? "Continue" : "No save yet"}</span>
            <BookmarkSimple
              size={20}
              weight={savedSlot ? "fill" : "regular"}
              className={savedSlot ? "text-[var(--color-accent)]" : ""}
            />
          </Link>
        </nav>
      </section>

      <footer className="flex items-center justify-between pt-6 text-xs text-[var(--color-fg-muted)]">
        <span>Built for phones.</span>
        <span className="font-mono tabular-nums">/ open source</span>
      </footer>
    </main>
  );
}

function Logo() {
  // Two-tile glyph: a grid that nods at the world map.
  return (
    <div className="grid h-7 w-7 grid-cols-2 grid-rows-2 gap-[2px]">
      <span className="rounded-[3px] bg-[var(--color-tile-grass)]" />
      <span className="rounded-[3px] bg-[var(--color-tile-forest)]" />
      <span className="rounded-[3px] bg-[var(--color-accent)]" />
      <span className="rounded-[3px] bg-[var(--color-tile-water)]" />
    </div>
  );
}
