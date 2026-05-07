"use client";

import { ArrowClockwise, Check, Hammer, X } from "@phosphor-icons/react/dist/ssr";
import { useMemo } from "react";
import { useGameStore } from "@/lib/state/game-store";
import {
  RECIPES,
  type Recipe,
  type StructureKind,
} from "@/content/recipes";
import { RESOURCES, type ResourceKind } from "@/content/resources";
import { affordable } from "@/lib/sim/weapons";

const STRUCTURE_LABEL: Record<StructureKind, string> = {
  workbench: "Workbench",
  furnace: "Furnace",
  anvil: "Anvil",
  wall_wood: "Wood wall",
  wall_stone: "Stone wall",
  wall_iron: "Iron wall",
  door: "Door",
  chest: "Chest",
  bed: "Bed",
  campfire: "Campfire",
  floor_tile: "Floor tile",
  sign: "Sign",
  fence: "Fence",
};

export default function BuildModePalette() {
  const buildMode = useGameStore((s) => s.buildMode);
  const inventory = useGameStore((s) => s.world?.life?.inventory ?? null);
  const selectKind = useGameStore((s) => s.selectBuildKind);
  const exitBuildMode = useGameStore((s) => s.exitBuildMode);
  const confirmPlace = useGameStore((s) => s.confirmPlaceStructure);
  const cycleRotation = useGameStore((s) => s.cycleBuildRotation);

  const structureRecipes = useMemo<Recipe[]>(
    () => RECIPES.filter((r) => r.result.kind === "structure"),
    [],
  );

  if (!buildMode.active || !inventory) return null;

  const canConfirm = buildMode.selectedKind != null && buildMode.selectedTile != null;

  return (
    <aside
      role="dialog"
      aria-label="Build mode palette"
      className="pointer-events-auto absolute inset-x-2 bottom-2 z-20 mx-auto flex max-w-[640px] flex-col gap-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-2 shadow-[0_16px_40px_-16px_rgba(44,40,32,0.45)] sm:inset-x-auto sm:left-auto sm:right-3 sm:bottom-16 sm:mx-0 sm:w-[480px]"
    >
      <div className="flex items-center justify-between gap-2 px-1.5">
        <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-fg)]">
          <Hammer size={14} weight="fill" className="text-[var(--color-accent)]" />
          Build mode
        </div>
        <button
          type="button"
          aria-label="Exit build mode"
          onClick={exitBuildMode}
          className="tactile inline-flex h-11 w-11 items-center justify-center rounded-full text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-warm)] hover:text-[var(--color-fg)]"
        >
          <X size={16} weight="bold" />
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-0.5 pl-0.5">
        {structureRecipes.map((recipe) => {
          if (recipe.result.kind !== "structure") return null;
          const kind = recipe.result.id;
          const label = STRUCTURE_LABEL[kind];
          const can = affordable(inventory, recipe);
          const selected = buildMode.selectedKind === kind;
          return (
            <button
              key={recipe.id}
              type="button"
              disabled={!can}
              onClick={() => selectKind(selected ? null : kind)}
              aria-pressed={selected}
              title={!can ? `Need ${formatCost(recipe.inputs)}` : undefined}
              className={`tactile flex min-h-[64px] w-44 shrink-0 flex-col items-start justify-between gap-1 rounded-xl border px-3 py-2 text-left text-xs disabled:cursor-not-allowed disabled:opacity-50 ${
                selected
                  ? "border-[var(--color-accent)] bg-[var(--color-surface-warm)] text-[var(--color-fg)]"
                  : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-fg)] hover:bg-[var(--color-surface-warm)]"
              }`}
            >
              <span className="block w-full truncate text-sm font-medium leading-tight">
                {label}
              </span>
              <span className="block w-full truncate font-mono text-[10px] uppercase tracking-wider text-[var(--color-fg-muted)]">
                {formatCost(recipe.inputs)}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-2 px-1.5">
        <p className="min-w-0 flex-1 truncate font-mono text-[10px] uppercase tracking-wider text-[var(--color-fg-muted)]">
          {!buildMode.selectedKind
            ? "Pick a structure"
            : !buildMode.selectedTile
              ? "Tap a tile to place"
              : "Tap confirm to build"}
        </p>
        <button
          type="button"
          aria-label={`Rotate (${buildMode.rotation * 90}°)`}
          disabled={!buildMode.selectedKind}
          onClick={cycleRotation}
          className="tactile inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-fg)] hover:bg-[var(--color-surface-warm)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ArrowClockwise size={16} weight="duotone" />
        </button>
        <button
          type="button"
          aria-label="Confirm placement"
          disabled={!canConfirm}
          onClick={confirmPlace}
          className="tactile inline-flex h-11 shrink-0 items-center gap-1.5 rounded-2xl bg-[var(--color-accent)] px-4 text-sm font-medium text-[var(--color-bg)] shadow-[0_8px_24px_-12px_rgba(217,104,70,0.5)] disabled:cursor-not-allowed disabled:bg-[var(--color-surface-warm)] disabled:text-[var(--color-fg-muted)] disabled:shadow-none"
        >
          <Check size={14} weight="bold" />
          Confirm
        </button>
      </div>
    </aside>
  );
}

function formatCost(inputs: Partial<Record<ResourceKind, number>>): string {
  const parts: string[] = [];
  for (const key of Object.keys(inputs) as ResourceKind[]) {
    const need = inputs[key] ?? 0;
    if (need <= 0) continue;
    parts.push(`${need} ${RESOURCES[key].label.toLowerCase()}`);
  }
  return parts.join(" + ");
}
