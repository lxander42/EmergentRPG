"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { hasSave } from "@/lib/save/db";

export default function Landing() {
  const [savedSlot, setSavedSlot] = useState<string | null>(null);

  useEffect(() => {
    hasSave("default").then((exists) => setSavedSlot(exists ? "default" : null));
  }, []);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-between px-6 py-10">
      <header className="mt-8 text-center">
        <h1 className="text-4xl font-semibold tracking-tight text-[var(--color-accent-hot)]">
          EmergentRPG
        </h1>
        <p className="mt-3 max-w-sm text-sm text-[var(--color-fg-muted)]">
          A reactive world where story emerges from systems, not scripts.
        </p>
      </header>

      <nav className="flex w-full max-w-xs flex-col gap-3">
        <Link
          href="/play?new=1"
          className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-5 py-4 text-center text-base font-medium hover:border-[var(--color-accent)] active:scale-[0.98]"
        >
          New Game
        </Link>
        <Link
          href="/play"
          aria-disabled={!savedSlot}
          tabIndex={savedSlot ? 0 : -1}
          className={
            "rounded-xl border px-5 py-4 text-center text-base font-medium " +
            (savedSlot
              ? "border-[var(--color-border)] bg-[var(--color-bg-elevated)] hover:border-[var(--color-accent)] active:scale-[0.98]"
              : "pointer-events-none border-[var(--color-border)] bg-transparent text-[var(--color-fg-muted)] opacity-50")
          }
        >
          {savedSlot ? "Continue" : "No save yet"}
        </Link>
      </nav>

      <footer className="text-xs text-[var(--color-fg-muted)]">
        v0.1 · built for mobile · open source
      </footer>
    </main>
  );
}
