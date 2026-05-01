"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import HUD from "@/components/hud/HUD";
import NpcPanel from "@/components/panels/NpcPanel";
import RegionPanel from "@/components/panels/RegionPanel";
import RecenterButton from "@/components/RecenterButton";
import EncounterToast from "@/components/EncounterToast";
import { useGameStore } from "@/lib/state/game-store";

const PhaserGame = dynamic(() => import("@/components/PhaserGame"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[100dvh] items-center justify-center text-sm text-[var(--color-fg-muted)]">
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
    <main className="relative h-[100dvh] w-screen overflow-hidden bg-[var(--color-bg)]">
      {/*
        The canvas lives below the HUD strip rather than under it.
        Putting Phaser inside its own DOM rect that already excludes
        the HUD means centerOn(player) naturally lands at the centre
        of what the user can see -- no camera-viewport gymnastics.
      */}
      <div className="no-touch-scroll absolute inset-x-0 bottom-0 top-24">
        <PhaserGame />
      </div>
      <HUD />
      <RecenterButton />
      <NpcPanel />
      <RegionPanel />
      <EncounterToast />
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
