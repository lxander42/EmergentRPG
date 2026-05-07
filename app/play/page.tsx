"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import HUD from "@/components/hud/HUD";
import NpcPanel from "@/components/panels/NpcPanel";
import NpcContextMenu from "@/components/NpcContextMenu";
import ObstacleContextMenu from "@/components/ObstacleContextMenu";
import PlacedStructureContextMenu from "@/components/PlacedStructureContextMenu";
import BuildModePalette from "@/components/BuildModePalette";
import RegionPanel from "@/components/panels/RegionPanel";
import InventoryPanel from "@/components/panels/InventoryPanel";
import DropConfirmModal from "@/components/panels/DropConfirmModal";
import WorkbenchPanel from "@/components/panels/WorkbenchPanel";
import PastLivesPanel from "@/components/PastLivesPanel";
import TutorialModal from "@/components/TutorialModal";
import RecenterButton from "@/components/RecenterButton";
import EncounterFeed from "@/components/EncounterFeed";
import FactionLegend from "@/components/FactionLegend";
import StatusLog from "@/components/StatusLog";
import MarkerNameModal from "@/components/MarkerNameModal";
import DebugOverlay from "@/components/DebugOverlay";
import { useGameStore } from "@/lib/state/game-store";
import { useKeybindings } from "@/lib/ui/use-keybindings";

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
  const debugFromUrl = params.get("debug") === "1";
  const startNew = useGameStore((s) => s.startNew);
  const loadFromDisk = useGameStore((s) => s.loadFromDisk);
  const setDebugMode = useGameStore((s) => s.setDebugMode);

  useEffect(() => {
    if (isNew) startNew();
    else loadFromDisk("default");
  }, [isNew, startNew, loadFromDisk]);

  useEffect(() => {
    if (debugFromUrl) setDebugMode(true);
  }, [debugFromUrl, setDebugMode]);

  useKeybindings();

  return (
    <main className="relative h-[100dvh] w-screen overflow-hidden bg-[var(--color-bg)]">
      {/*
        Phaser fills the entire play area now that the HUD is split into
        absolute corners (identity top-left, action cluster bottom-right)
        rather than a single top strip.
      */}
      <div className="no-touch-scroll absolute inset-0">
        <PhaserGame />
      </div>
      <HUD />
      <RecenterButton />
      <FactionLegend />
      <NpcPanel />
      <NpcContextMenu />
      <ObstacleContextMenu />
      <PlacedStructureContextMenu />
      <BuildModePalette />
      <RegionPanel />
      <InventoryPanel />
      <DropConfirmModal />
      <WorkbenchPanel />
      <PastLivesPanel />
      <EncounterFeed />
      <StatusLog />
      <MarkerNameModal />
      <TutorialModal />
      <DebugOverlay />
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
