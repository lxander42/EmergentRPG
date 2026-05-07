"use client";

import { DotsThreeVertical, ForkKnife, Hammer, Knife, Package, X } from "@phosphor-icons/react/dist/ssr";
import { useGameStore } from "@/lib/state/game-store";
import { RESOURCES, type ResourceKind } from "@/content/resources";
import TileChip from "@/components/panels/TileChip";
import { WEAPONS } from "@/content/weapons";
import { TOOLS } from "@/lib/sim/tools";
import { RECIPES, type Recipe } from "@/content/recipes";
import { affordable } from "@/lib/sim/weapons";
import { inventoryCapFromBaskets, inventoryTotal } from "@/lib/sim/inventory";
import { basketCount } from "@/lib/sim/tools";
import { useEffect, useRef } from "react";
import { useOutsideClose } from "@/lib/ui/use-outside-close";
import { useReportPopoverBounds } from "@/lib/ui/use-report-popover-bounds";
import { useLongPress } from "@/lib/ui/use-long-press";
import { mergeRefs } from "@/lib/ui/merge-refs";

export default function InventoryPanel() {
  const open = useGameStore((s) => s.inventoryOpen);
  const close = useGameStore((s) => s.closeInventory);
  const world = useGameStore((s) => s.world);
  const craftRecipe = useGameStore((s) => s.craftRecipe);
  const eatFood = useGameStore((s) => s.eatFood);
  const openInventoryRowMenu = useGameStore((s) => s.openInventoryRowMenu);
  const ref = useOutsideClose(open, close);
  const boundsRef = useReportPopoverBounds(open);

  // Triple-defense capture-phase contextmenu suppressor. We've seen browsers
  // (specifically Chrome on some setups) commit to the native menu before
  // bubble-phase listeners fire, so we attach in the very first capture
  // phase on window AND document AND the panel root. The closure captures
  // the panel element directly to avoid any ref-churn race during
  // re-renders. The handler is intentionally lenient about what counts as
  // "inside the panel" — anything inside the bounding rect of the panel
  // element is suppressed, so the user can't trigger Chrome's menu via a
  // child element that happens to mount/unmount mid-gesture either.
  useEffect(() => {
    if (!open) return;
    const root = ref.current;
    if (!root) return;
    const handler = (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (!target || !root.contains(target)) return;
      if (target.closest("[data-no-drop]")) return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    window.addEventListener("contextmenu", handler, { capture: true });
    document.addEventListener("contextmenu", handler, { capture: true });
    root.addEventListener("contextmenu", handler, { capture: true });
    return () => {
      window.removeEventListener("contextmenu", handler, { capture: true });
      document.removeEventListener("contextmenu", handler, { capture: true });
      root.removeEventListener("contextmenu", handler, { capture: true });
    };
  }, [open, ref]);

  if (!open || !world) return null;

  const inventory = world.life?.inventory ?? {};
  const player = world.life?.player ?? null;
  const gameOver = world.life?.gameOver ?? false;
  const entries = (Object.entries(inventory) as Array<[ResourceKind, number]>).filter(
    ([, n]) => n > 0,
  );
  const cap = player ? inventoryCapFromBaskets(basketCount(player.tools)) : 20;
  const total = inventoryTotal(inventory);
  const handRecipes = RECIPES.filter(
    (r) => r.station === "hand" && r.result.kind !== "structure",
  );

  const showRowMenu = (kind: ResourceKind, count: number, x: number, y: number) => {
    if (gameOver || !player || count <= 0) return;
    openInventoryRowMenu(kind, count, x, y);
  };

  return (
    <aside
      ref={mergeRefs(ref, boundsRef)}
      role="dialog"
      aria-label="Inventory"
      onContextMenu={(e) => {
        if ((e.target as HTMLElement | null)?.closest("[data-no-drop]")) return;
        e.preventDefault();
      }}
      className="pointer-events-auto absolute inset-x-2 bottom-2 z-20 max-h-[68dvh] overflow-y-auto rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[0_20px_48px_-20px_rgba(44,40,32,0.25)] sm:inset-x-auto sm:left-auto sm:right-3 sm:bottom-16 sm:w-[420px] sm:max-h-[78dvh]"
    >
      <div className="mx-auto max-w-2xl">
        <header className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface-warm)]"
            >
              <Package size={18} weight="duotone" className="text-[var(--color-fg)]" />
            </span>
            <div>
              <h2 className="text-lg font-medium leading-tight text-[var(--color-fg)]">
                Inventory
              </h2>
              <p className="font-mono text-[11px] uppercase tracking-wider text-[var(--color-fg-muted)]">
                <span className="tabular-nums">{total}</span>/<span className="tabular-nums">{cap}</span> · what you carry
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

        <section className="border-t border-[var(--color-border)] pt-4">
          <h3 className="font-mono text-[11px] uppercase tracking-wider text-[var(--color-fg-muted)]">
            Materials & food
          </h3>
          {entries.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--color-fg-muted)]">
              You haven&apos;t gathered anything yet. Tap food and material dots in
              the biome to collect them.
            </p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {entries.map(([kind, count]) => (
                <MaterialRow
                  key={kind}
                  kind={kind}
                  count={count}
                  canEat={Boolean(player) && !gameOver}
                  onEat={() => eatFood(kind)}
                  onContextMenuAt={(x, y) => showRowMenu(kind, count, x, y)}
                />
              ))}
            </ul>
          )}
        </section>

        {player && player.weapons.length > 0 && (
          <section className="mt-5 border-t border-[var(--color-border)] pt-4">
            <h3 className="font-mono text-[11px] uppercase tracking-wider text-[var(--color-fg-muted)]">
              Weapons
            </h3>
            <ul className="mt-3 flex flex-col gap-2">
              {player.weapons.map((w, i) => {
                const meta = WEAPONS[w.kind];
                return (
                  <li
                    key={`${w.kind}-${i}`}
                    className="flex items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-warm)] px-3 py-2"
                  >
                    <Knife size={16} weight="fill" className="text-[var(--color-accent)]" />
                    <span className="flex-1 text-sm text-[var(--color-fg)]">
                      {meta.label}
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-wider tabular-nums text-[var(--color-fg-muted)]">
                      +{meta.attack} atk · reach {meta.reach}
                      {meta.ranged ? " · ranged" : ""}
                    </span>
                    <span className="font-mono text-[11px] tabular-nums text-[var(--color-fg-muted)]">
                      {w.usesLeft}/{meta.durability}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {player && player.tools.length > 0 && (
          <section className="mt-5 border-t border-[var(--color-border)] pt-4">
            <h3 className="font-mono text-[11px] uppercase tracking-wider text-[var(--color-fg-muted)]">
              Tools
            </h3>
            <ul className="mt-3 flex flex-col gap-2">
              {player.tools.map((t, i) => {
                const meta = TOOLS[t.kind];
                return (
                  <li
                    key={`${t.kind}-${i}`}
                    className="flex items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-warm)] px-3 py-2"
                  >
                    <span
                      aria-hidden
                      className="h-3.5 w-3.5 shrink-0 rounded-sm border border-[var(--color-border-strong)]"
                      style={{ background: meta.swatch }}
                    />
                    <span className="flex-1 text-sm text-[var(--color-fg)]">
                      {meta.label}
                    </span>
                    <span className="font-mono text-[11px] tabular-nums text-[var(--color-fg-muted)]">
                      {t.usesLeft >= 999 ? "—" : `${t.usesLeft}/${meta.durability}`}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <section className="mt-5 border-t border-[var(--color-border)] pt-4">
          <h3 className="font-mono text-[11px] uppercase tracking-wider text-[var(--color-fg-muted)]">
            Quick craft
          </h3>
          <ul className="mt-3 flex flex-col gap-2">
            {handRecipes.map((recipe) => {
              const can =
                Boolean(player) &&
                !gameOver &&
                affordable(inventory, recipe);
              const stats = describeHandResult(recipe);
              return (
                <li key={recipe.id}>
                  <button
                    onClick={() => craftRecipe(recipe.id)}
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
                        {(Object.entries(recipe.inputs) as Array<[
                          ResourceKind,
                          number,
                        ]>).map(([k, n]) => (
                          <RecipePip
                            key={k}
                            kind={k}
                            need={n}
                            have={inventory[k] ?? 0}
                          />
                        ))}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="mt-5 border-t border-[var(--color-border)] pt-4">
          <h3 className="font-mono text-[11px] uppercase tracking-wider text-[var(--color-fg-muted)]">
            More at the workbench
          </h3>
          <p className="mt-2 text-sm text-[var(--color-fg-muted)]">
            Place a workbench, then tap it to craft tools (axe, pickaxe,
            basket, torch) and advanced weapons (sword, bow).
          </p>
        </section>
      </div>
    </aside>
  );
}

function MaterialRow({
  kind,
  count,
  canEat,
  onEat,
  onContextMenuAt,
}: {
  kind: ResourceKind;
  count: number;
  canEat: boolean;
  onEat: () => void;
  onContextMenuAt: (x: number, y: number) => void;
}) {
  const meta = RESOURCES[kind];
  const longPress = useLongPress((x, y) => onContextMenuAt(x, y));
  const liRef = useRef<HTMLLIElement>(null);
  // Native (non-React-synthetic) contextmenu listener — Safari and a few
  // Chromium configs commit to showing the browser's native menu before
  // React's delegated synthetic handler runs. Direct DOM listeners catch
  // the event in the dispatch's normal phase, where preventDefault still
  // suppresses the browser menu. Skip if a long-press just fired so we
  // don't double-open on touch devices that synthesise contextmenu after
  // a successful long press.
  useEffect(() => {
    const el = liRef.current;
    if (!el) return;
    const handler = (e: Event) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      const target = e.target as HTMLElement | null;
      if (target?.closest("[data-no-drop]")) return;
      if (Date.now() - longPress.firedAt.current < 800) return;
      const me = e as MouseEvent;
      onContextMenuAt(me.clientX, me.clientY);
    };
    el.addEventListener("contextmenu", handler, { capture: true });
    return () => el.removeEventListener("contextmenu", handler, { capture: true });
  }, [onContextMenuAt, longPress.firedAt]);
  return (
    <li
      ref={liRef}
      className="flex items-center gap-2.5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-warm)] px-3 py-2 select-none"
      onPointerDown={longPress.onPointerDown}
      onPointerMove={longPress.onPointerMove}
      onPointerUp={longPress.onPointerUp}
      onPointerLeave={longPress.onPointerLeave}
      onPointerCancel={longPress.onPointerCancel}
    >
      <TileChip name={meta.frame} size={20} rounded="md" />
      <span className="flex-1 text-sm text-[var(--color-fg)]">
        {meta.label}
        {meta.food && (
          <span className="ml-2 font-mono text-[10px] uppercase tracking-wider text-[var(--color-fg-muted)]">
            food · +energy +hp
          </span>
        )}
      </span>
      <span className="font-mono text-[11px] tabular-nums text-[var(--color-fg-muted)]">
        {count}
      </span>
      {meta.food && (
        <button
          data-no-drop
          onClick={(e) => {
            e.stopPropagation();
            onEat();
          }}
          disabled={!canEat}
          className="tactile inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-[var(--color-fg)] disabled:opacity-50"
        >
          <ForkKnife size={12} weight="fill" className="text-[var(--color-accent)]" />
          Eat
        </button>
      )}
      <button
        data-no-drop
        type="button"
        aria-label={`${meta.label} options`}
        title="More options (right-click or long-press also works)"
        onClick={(e) => {
          e.stopPropagation();
          const r = e.currentTarget.getBoundingClientRect();
          onContextMenuAt(r.left, r.bottom);
        }}
        className="tactile inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-warm)] hover:text-[var(--color-fg)]"
      >
        <DotsThreeVertical size={14} weight="bold" />
      </button>
    </li>
  );
}

function describeHandResult(recipe: Recipe): string[] {
  if (recipe.result.kind === "weapon") {
    const meta = WEAPONS[recipe.result.id];
    const out = [`+${meta.attack} atk`, `reach ${meta.reach}`];
    if (meta.ranged) out.push("ranged");
    out.push(`uses ${meta.durability}`);
    return out;
  }
  if (recipe.result.kind === "structure") {
    return ["places nearby", "tap to craft tools"];
  }
  return [];
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
      <TileChip name={RESOURCES[kind].frame} size={12} rounded="sm" />
      {RESOURCES[kind].label} {have}/{need}
    </span>
  );
}

