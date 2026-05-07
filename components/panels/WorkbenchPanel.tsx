"use client";

import { Hammer, X } from "@phosphor-icons/react/dist/ssr";
import { useGameStore } from "@/lib/state/game-store";
import { RESOURCES, type ResourceKind } from "@/content/resources";
import { WEAPONS } from "@/content/weapons";
import { TOOLS } from "@/lib/sim/tools";
import { RECIPES, type Recipe } from "@/content/recipes";
import { affordable } from "@/lib/sim/weapons";
import {
  findWorkbenchTile,
  globalToLocal,
  regionKey,
} from "@/lib/sim/biome-interior";
import { chebyshev } from "@/lib/sim/combat";
import { useOutsideClose } from "@/lib/ui/use-outside-close";
import { useReportPopoverBounds } from "@/lib/ui/use-report-popover-bounds";
import { mergeRefs } from "@/lib/ui/merge-refs";

export default function WorkbenchPanel() {
  const open = useGameStore((s) => s.workbenchOpen);
  const close = useGameStore((s) => s.closeWorkbench);
  const world = useGameStore((s) => s.world);
  const craftRecipe = useGameStore((s) => s.craftRecipe);
  const ref = useOutsideClose(open, close);
  const boundsRef = useReportPopoverBounds(open);

  if (!open || !world?.life) return null;

  const recipes = RECIPES.filter((r) => r.station === "workbench");
  const inventory = world.life.inventory;
  const player = world.life.player;
  const gameOver = world.life.gameOver;
  const here = globalToLocal(player.gx, player.gy);
  const interior = world.biomeInteriors[regionKey(here.rx, here.ry)];
  const wb = interior ? findWorkbenchTile(interior) : null;
  const adjacent = wb ? chebyshev(here.lx, here.ly, wb.lx, wb.ly) <= 1 : false;

  return (
    <aside
      ref={mergeRefs(ref, boundsRef)}
      role="dialog"
      aria-label="Workbench"
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
              <Hammer size={18} weight="fill" className="text-[var(--color-bg)]" />
            </span>
            <div>
              <h2 className="text-lg font-medium leading-tight text-[var(--color-fg)]">
                Workbench
              </h2>
              <p className="font-mono text-[11px] uppercase tracking-wider text-[var(--color-fg-muted)]">
                {adjacent ? "Tap a recipe to craft" : "Walk closer to craft"}
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

        <ul className="flex flex-col gap-2">
          {recipes.map((recipe) => (
            <RecipeRow
              key={recipe.id}
              recipe={recipe}
              inventory={inventory}
              adjacent={adjacent}
              gameOver={gameOver}
              onCraft={() => craftRecipe(recipe.id)}
            />
          ))}
        </ul>
      </div>
    </aside>
  );
}

function RecipeRow({
  recipe,
  inventory,
  adjacent,
  gameOver,
  onCraft,
}: {
  recipe: Recipe;
  inventory: Partial<Record<ResourceKind, number>>;
  adjacent: boolean;
  gameOver: boolean;
  onCraft: () => void;
}) {
  const can = adjacent && !gameOver && affordable(inventory, recipe);
  const stats = describeResult(recipe);
  return (
    <li>
      <button
        onClick={onCraft}
        disabled={!can}
        className="tactile flex w-full items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-warm)] px-3 py-2 text-left disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Hammer
          size={16}
          weight={can ? "fill" : "regular"}
          className="shrink-0 text-[var(--color-accent)]"
        />
        <span className="flex-1">
          <span className="block text-sm font-medium text-[var(--color-fg)]">
            {recipe.name}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10px] uppercase tracking-wider text-[var(--color-fg-muted)]">
            {stats.map((s) => (
              <span key={s}>{s}</span>
            ))}
            {recipe.time > 0 && <span>· {recipe.time} ticks</span>}
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

function describeResult(recipe: Recipe): string[] {
  if (recipe.result.kind === "weapon") {
    const meta = WEAPONS[recipe.result.id];
    const out = [`+${meta.attack} atk`, `reach ${meta.reach}`];
    if (meta.ranged) out.push("ranged");
    out.push(`uses ${meta.durability}`);
    return out;
  }
  if (recipe.result.kind === "tool") {
    const meta = TOOLS[recipe.result.id];
    if (recipe.result.id === "basket") return ["+20 inventory cap"];
    if (recipe.result.id === "torch") return ["+3 sight (Phase 6)"];
    return [`uses ${meta.durability}`];
  }
  return ["places nearby"];
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
