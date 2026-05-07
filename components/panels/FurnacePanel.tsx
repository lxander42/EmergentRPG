"use client";

import { Flame, X } from "@phosphor-icons/react/dist/ssr";
import { useEffect } from "react";
import { useGameStore } from "@/lib/state/game-store";
import { RESOURCES, type ResourceKind } from "@/content/resources";
import { RECIPES, type Recipe } from "@/content/recipes";
import { affordable } from "@/lib/sim/weapons";
import {
  globalToLocal,
  placedStructureById,
  regionKey,
  type PlacedStructure,
} from "@/lib/sim/biome-interior";
import { chebyshev } from "@/lib/sim/combat";
import { useOutsideClose } from "@/lib/ui/use-outside-close";
import { useReportPopoverBounds } from "@/lib/ui/use-report-popover-bounds";
import { mergeRefs } from "@/lib/ui/merge-refs";

export default function FurnacePanel() {
  const open = useGameStore((s) => s.furnaceOpen);
  const close = useGameStore((s) => s.closeFurnacePanel);
  const world = useGameStore((s) => s.world);
  const startSmelt = useGameStore((s) => s.startSmelt);
  const collectFurnaceOutput = useGameStore((s) => s.collectFurnaceOutput);
  const ref = useOutsideClose(Boolean(open), close);
  const boundsRef = useReportPopoverBounds(Boolean(open));

  const interior =
    open && world
      ? world.biomeInteriors[regionKey(open.rx, open.ry)] ?? null
      : null;
  const target =
    open && interior ? placedStructureById(interior, open.structureId) : null;

  // If the furnace was deconstructed (or the player teleported away in a way
  // that removed the interior), drop the panel.
  useEffect(() => {
    if (!open) return;
    if (!target || target.kind !== "furnace") close();
  }, [open, target, close]);

  if (!open || !world?.life) return null;
  if (!target || target.kind !== "furnace") return null;

  const player = world.life.player;
  const gameOver = world.life.gameOver;
  const here = globalToLocal(player.gx, player.gy);
  const adjacent =
    here.rx === open.rx &&
    here.ry === open.ry &&
    chebyshev(here.lx, here.ly, target.lx, target.ly) <= 1;
  const inventory = world.life.inventory;
  const recipes = RECIPES.filter((r) => r.station === "furnace");
  const inProgress = target.smelt && !target.smelt.ready;
  const ready = target.smelt?.ready === true;
  const heldItems = target.contents?.items
    ? (Object.entries(target.contents.items) as Array<[ResourceKind, number]>)
        .filter(([, n]) => n > 0)
    : [];

  return (
    <aside
      ref={mergeRefs(ref, boundsRef)}
      role="dialog"
      aria-label="Furnace"
      className="pointer-events-auto absolute inset-x-2 bottom-2 z-20 max-h-[68dvh] overflow-y-auto rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[0_20px_48px_-20px_rgba(44,40,32,0.25)] sm:inset-x-auto sm:left-auto sm:right-3 sm:bottom-16 sm:w-[420px] sm:max-h-[78dvh]"
    >
      <div className="mx-auto max-w-2xl">
        <header className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--color-border-strong)]"
              style={{ background: "var(--color-accent)" }}
            >
              <Flame size={18} weight="fill" className="text-[var(--color-bg)]" />
            </span>
            <div>
              <h2 className="text-lg font-medium leading-tight text-[var(--color-fg)]">
                Furnace
              </h2>
              <p className="font-mono text-[11px] uppercase tracking-wider text-[var(--color-fg-muted)]">
                {!adjacent
                  ? "Walk closer to smelt"
                  : inProgress
                    ? "Smelting…"
                    : ready
                      ? "Ready to collect"
                      : "Tap a recipe to smelt"}
              </p>
            </div>
          </div>
          <button
            aria-label="Close"
            onClick={close}
            className="tactile inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-warm)] hover:text-[var(--color-fg)]"
          >
            <X size={18} weight="bold" />
          </button>
        </header>

        {heldItems.length > 0 && (
          <CollectSection
            target={target}
            adjacent={adjacent}
            gameOver={gameOver}
            items={heldItems}
            onCollect={(k) => collectFurnaceOutput(k)}
          />
        )}

        {inProgress && target.smelt && (
          <ProgressBar smelt={target.smelt} />
        )}

        {!inProgress && (
          <ul className="flex flex-col gap-2">
            {recipes.map((recipe) => (
              <SmeltRow
                key={recipe.id}
                recipe={recipe}
                inventory={inventory}
                adjacent={adjacent}
                gameOver={gameOver}
                onSmelt={() => startSmelt(recipe.id)}
              />
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

function CollectSection({
  target,
  adjacent,
  gameOver,
  items,
  onCollect,
}: {
  target: PlacedStructure;
  adjacent: boolean;
  gameOver: boolean;
  items: Array<[ResourceKind, number]>;
  onCollect: (k: ResourceKind) => void;
}) {
  void target;
  return (
    <ul className="mb-3 flex flex-col gap-2">
      {items.map(([kind, count]) => (
        <li key={kind}>
          <button
            type="button"
            onClick={() => onCollect(kind)}
            disabled={!adjacent || gameOver}
            className="tactile flex w-full items-center gap-3 rounded-2xl border border-[var(--color-border-strong)] bg-[var(--color-surface-warm)] px-3 py-3 text-left disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span
              aria-hidden
              className="h-3 w-3 shrink-0 rounded-sm border border-[var(--color-border-strong)]"
              style={{ background: RESOURCES[kind].swatch }}
            />
            <span className="flex-1">
              <span className="block text-sm font-medium text-[var(--color-fg)]">
                Collect {RESOURCES[kind].label} ×{count}
              </span>
              <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-wider text-[var(--color-fg-muted)]">
                ready
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function ProgressBar({
  smelt,
}: {
  smelt: NonNullable<PlacedStructure["smelt"]>;
}) {
  const pct = Math.max(0, Math.min(1, smelt.elapsed / smelt.required));
  const recipe = RECIPES.find((r) => r.id === smelt.recipeId);
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-warm)] px-3 py-3">
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="font-medium text-[var(--color-fg)]">
          {recipe?.name ?? "Smelting"}
        </span>
        <span className="font-mono text-[11px] tabular-nums text-[var(--color-fg-muted)]">
          {smelt.elapsed}/{smelt.required}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full border border-[var(--color-border-strong)] bg-[var(--color-bg)]">
        <div
          className="h-full transition-[width] duration-150"
          style={{
            width: `${pct * 100}%`,
            background: "var(--color-accent)",
          }}
        />
      </div>
    </div>
  );
}

function SmeltRow({
  recipe,
  inventory,
  adjacent,
  gameOver,
  onSmelt,
}: {
  recipe: Recipe;
  inventory: Partial<Record<ResourceKind, number>>;
  adjacent: boolean;
  gameOver: boolean;
  onSmelt: () => void;
}) {
  const can = adjacent && !gameOver && affordable(inventory, recipe);
  const time = recipe.smeltTimeTicks ?? 0;
  return (
    <li>
      <button
        onClick={onSmelt}
        disabled={!can}
        className="tactile flex min-h-[56px] w-full items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-warm)] px-3 py-2 text-left disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Flame
          size={16}
          weight={can ? "fill" : "regular"}
          className="shrink-0 text-[var(--color-accent)]"
        />
        <span className="flex-1">
          <span className="block text-sm font-medium text-[var(--color-fg)]">
            {recipe.name}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10px] uppercase tracking-wider text-[var(--color-fg-muted)]">
            {time > 0 && <span>{time} ticks</span>}
          </span>
          <span className="mt-1 flex flex-wrap gap-1.5">
            {(Object.entries(recipe.inputs) as Array<[ResourceKind, number]>).map(
              ([k, n]) => (
                <RecipePip
                  key={k}
                  kind={k}
                  need={n}
                  have={inventory[k] ?? 0}
                />
              ),
            )}
          </span>
        </span>
      </button>
    </li>
  );
}

function RecipePip({
  kind,
  need,
  have,
}: {
  kind: ResourceKind;
  need: number;
  have: number;
}) {
  const ok = have >= need;
  return (
    <span
      className="inline-flex items-center gap-1 font-mono text-[10px] tabular-nums"
      style={{ color: ok ? "var(--color-fg)" : "var(--color-fg-muted)" }}
    >
      <span
        aria-hidden
        className="h-2 w-2 rounded-full border border-[var(--color-border-strong)]"
        style={{ background: RESOURCES[kind].swatch }}
      />
      {RESOURCES[kind].label} {have}/{need}
    </span>
  );
}
