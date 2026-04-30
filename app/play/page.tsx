"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import HUD from "@/components/hud/HUD";
import NarratorPanel from "@/components/panels/NarratorPanel";
import NpcPanel from "@/components/panels/NpcPanel";
import { useGameStore } from "@/lib/state/game-store";

const PhaserGame = dynamic(() => import("@/components/PhaserGame"), {
  ssr: false,
  loading: () => (
    <div className="flex h-dvh items-center justify-center text-sm text-[var(--color-fg-muted)]">
      Loading world…
    </div>
  ),
});

function PlayInner() {
  const params = useSearchParams();
  const isNew = params.get("new") === "1";
  const startNew = useGameStore((s) => s.startNew);
  const loadFromDisk = useGameStore((s) => s.loadFromDisk);

  useEffect(() => {
    if (isNew) startNew();
    else loadFromDisk("default");
  }, [isNew, startNew, loadFromDisk]);

  return (
    <main className="relative h-dvh w-screen overflow-hidden bg-[var(--color-bg)]">
      <div className="no-touch-scroll absolute inset-0">
        <PhaserGame />
      </div>
      <HUD />
      <NpcPanel />
      <NarratorPanel />
    </main>
  );
}

export default function PlayPage() {
  return (
    <Suspense fallback={null}>
      <PlayInner />
    </Suspense>
  );
}
