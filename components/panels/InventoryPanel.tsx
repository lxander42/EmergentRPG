"use client";

import { ForkKnife, Hammer, Knife, Package, X } from "@phosphor-icons/react/dist/ssr";
import { useGameStore } from "@/lib/state/game-store";
import { RESOURCES, type ResourceKind } from "@/content/resources";
import {
  WEAPONS,
  WEAPON_KINDS,
  type WeaponKind,
} from "@/content/weapons";
import { affordable } from "@/lib/sim/weapons";

export default function InventoryPanel() {
  const open = useGameStore((s) => s.inventoryOpen);
  const close = useGameStore((s) => s.closeInventory);
  const world = useGameStore((s) => s.world);
  const craft = useGameStore((s) => s.craft);
  const eatFood = useGameStore((s) => s.eatFood);

  if (!open || !world) return null;

  const inventory = world.inventory;
  const player = world.player;
  const entries = (Object.entries(inventory) as Array<[ResourceKind, number]>).filter(
    ([, n]) => n > 0,
  );

  return (
    <aside
      role="dialog"
      aria-label="Inventory"
      className="pointer-events-auto absolute inset-x-2 bottom-2 z-20 max-h-[68dvh] overflow-y-auto rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[0_20px_48px_-20px_rgba(44,40,32,0.25)]"
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
                What you carry
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
              {entries.map(([kind, count]) => {
                const meta = RESOURCES[kind];
                return (
                  <li
                    key={kind}
                    className="flex items-center gap-2.5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-warm)] px-3 py-2"
                  >
                    <span
                      aria-hidden
                      className="h-3 w-3 shrink-0 rounded-full border border-[var(--color-border-strong)]"
                      style={{ background: meta.swatch }}
                    />
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
                        onClick={() => eatFood(kind)}
                        disabled={!player || world.gameOver}
                        className="tactile inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-[var(--color-fg)] disabled:opacity-50"
                      >
                        <ForkKnife size={12} weight="fill" className="text-[var(--color-accent)]" />
                        Eat
                      </button>
                    )}
                  </li>
                );
              })}
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

        <section className="mt-5 border-t border-[var(--color-border)] pt-4">
          <h3 className="font-mono text-[11px] uppercase tracking-wider text-[var(--color-fg-muted)]">
            Crafting
          </h3>
          <ul className="mt-3 flex flex-col gap-2">
            {WEAPON_KINDS.map((kind: WeaponKind) => {
              const meta = WEAPONS[kind];
              const can = Boolean(player) && !world.gameOver && affordable(inventory, kind);
              return (
                <li key={kind}>
                  <button
                    onClick={() => craft(kind)}
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
                        {meta.label}
                      </span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10px] uppercase tracking-wider text-[var(--color-fg-muted)]">
                        <span>+{meta.attack} atk</span>
                        <span>reach {meta.reach}</span>
                        {meta.ranged && <span>ranged</span>}
                        <span>· uses {meta.durability}</span>
                      </span>
                      <span className="mt-1 flex flex-wrap gap-1.5">
                        {(Object.entries(meta.recipe) as Array<[
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
            Gear (coming soon)
          </h3>
          <p className="mt-2 text-sm text-[var(--color-fg-muted)]">
            Tools, armour, and trinkets land with the workbench in Phase 4.
          </p>
        </section>
      </div>
    </aside>
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
