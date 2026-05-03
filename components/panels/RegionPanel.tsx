"use client";

import { Footprints, Hammer, House, X } from "@phosphor-icons/react/dist/ssr";
import { useGameStore, WALK_MAX_RADIUS } from "@/lib/state/game-store";
import { biomeAt } from "@/lib/sim/biome";
import { BIOMES } from "@/content/biomes";
import { FACTIONS } from "@/content/factions";
import {
  BIOME_RESOURCES,
  RESOURCES,
  type ResourceKind,
} from "@/content/resources";
import { globalToLocal, regionCenterGlobal } from "@/lib/sim/biome-interior";
import { WEAPONS, WEAPON_KINDS, type WeaponKind } from "@/content/weapons";
import { affordable } from "@/lib/sim/weapons";

export default function RegionPanel() {
  const region = useGameStore((s) => s.selectedRegion);
  const world = useGameStore((s) => s.world);
  const select = useGameStore((s) => s.selectRegion);
  const selectNpc = useGameStore((s) => s.selectNpc);
  const homePending = useGameStore((s) => s.homePending);
  const claimHome = useGameStore((s) => s.claimHome);
  const travelToRegion = useGameStore((s) => s.travelToRegion);
  const craft = useGameStore((s) => s.craft);

  if (!region || !world) return null;

  const biome = biomeAt(region.rx, region.ry);
  const meta = BIOMES[biome];
  const npcsHere = world.npcs.filter((n) => n.rx === region.rx && n.ry === region.ry);
  const incoming = world.npcs.filter(
    (n) => n.intent && n.intent.rx === region.rx && n.intent.ry === region.ry,
  );
  const canClaim = homePending && meta.passable;
  const foods = BIOME_RESOURCES[biome].food;
  const controllerId = world.regionControl[`${region.rx},${region.ry}`];
  const controller = controllerId ? FACTIONS.find((f) => f.id === controllerId) : undefined;

  const player = world.player;
  const playerRegion = player ? globalToLocal(player.gx, player.gy) : null;
  const isCurrentRegion =
    playerRegion ? playerRegion.rx === region.rx && playerRegion.ry === region.ry : false;
  const center = regionCenterGlobal(region.rx, region.ry);
  const distance = player ? Math.abs(center.gx - player.gx) + Math.abs(center.gy - player.gy) : 0;
  const reachable = player && meta.passable && distance <= WALK_MAX_RADIUS && !isCurrentRegion;
  const showTravel = Boolean(player) && meta.passable && !isCurrentRegion && !world.gameOver;
  const isHomeRegion =
    Boolean(world.home) && world.home!.rx === region.rx && world.home!.ry === region.ry;
  const showCrafting = isHomeRegion && isCurrentRegion && Boolean(player) && !world.gameOver;

  return (
    <aside
      role="dialog"
      aria-label={`${meta.title} region details`}
      className="pointer-events-auto absolute inset-x-2 bottom-2 z-20 max-h-[60dvh] overflow-y-auto rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[0_20px_48px_-20px_rgba(44,40,32,0.25)]"
    >
      <div className="mx-auto max-w-2xl">
        <header className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className="h-9 w-9 shrink-0 rounded-lg border border-[var(--color-border-strong)]"
              style={{ background: meta.swatch }}
            />
            <div>
              <h2 className="text-lg font-medium leading-tight text-[var(--color-fg)]">
                {meta.title}
              </h2>
              <p className="font-mono text-[11px] uppercase tracking-wider text-[var(--color-fg-muted)]">
                ({region.rx}, {region.ry}) · {meta.passable ? "passable" : "impassable"}
              </p>
            </div>
          </div>
          <button
            aria-label="Close"
            onClick={() => select(null)}
            className="tactile inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-warm)] hover:text-[var(--color-fg)]"
          >
            <X size={18} weight="bold" />
          </button>
        </header>

        <p className="border-t border-[var(--color-border)] pt-4 text-sm leading-relaxed text-[var(--color-fg)] max-w-[60ch]">
          {meta.blurb}
        </p>

        {controller && (
          <p className="mt-3 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-[var(--color-fg-muted)]">
            Held by
            <span className="inline-flex items-center gap-1.5 normal-case">
              <span
                aria-hidden
                className="h-2.5 w-2.5 rounded-sm border border-[var(--color-border-strong)]"
                style={{ background: factionHex(controller.color) }}
              />
              <span className="text-[var(--color-fg)]">{controller.name}</span>
            </span>
          </p>
        )}

        {foods.length > 0 && (
          <p className="mt-3 flex flex-wrap items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-[var(--color-fg-muted)]">
            Foods
            {foods.map((kind) => (
              <span key={kind} className="inline-flex items-center gap-1.5 normal-case">
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 rounded-full border border-[var(--color-border-strong)]"
                  style={{ background: RESOURCES[kind].swatch }}
                />
                <span className="text-[var(--color-fg)]">{RESOURCES[kind].label}</span>
              </span>
            ))}
          </p>
        )}

        {canClaim && (
          <button
            onClick={() => claimHome(region.rx, region.ry)}
            className="tactile mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--color-accent)] px-4 py-3 text-sm font-medium text-[var(--color-bg)] shadow-[0_8px_24px_-12px_rgba(217,104,70,0.5)]"
          >
            <House size={16} weight="fill" />
            Claim as home base
          </button>
        )}

        {showTravel && (
          <button
            onClick={() => travelToRegion(region.rx, region.ry)}
            disabled={!reachable}
            className="tactile mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--color-accent)] px-4 py-3 text-sm font-medium text-[var(--color-bg)] shadow-[0_8px_24px_-12px_rgba(217,104,70,0.5)] disabled:cursor-not-allowed disabled:bg-[var(--color-surface-warm)] disabled:text-[var(--color-fg-muted)] disabled:shadow-none"
          >
            <Footprints size={16} weight="fill" />
            {reachable ? "Travel here" : `Too far to walk (${distance} tiles)`}
          </button>
        )}

        {showCrafting && (
          <section className="mt-4 border-t border-[var(--color-border)] pt-4">
            <h3 className="font-mono text-[11px] uppercase tracking-wider text-[var(--color-fg-muted)]">
              Crafting
            </h3>
            <ul className="mt-3 flex flex-col gap-2">
              {WEAPON_KINDS.map((kind) => {
                const meta = WEAPONS[kind];
                const can = affordable(world.inventory, kind);
                const owned =
                  player?.weapons.filter((w) => w.kind === kind).length ?? 0;
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
                          {owned > 0 && (
                            <span className="ml-2 font-mono text-[10px] uppercase tracking-wider text-[var(--color-fg-muted)]">
                              {owned} held
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-[var(--color-fg-muted)]">
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
                              have={world.inventory[k] ?? 0}
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
        )}

        <dl className="mt-4 grid grid-cols-[auto_1fr] items-start gap-x-5 gap-y-3">
          <dt className="font-mono text-[11px] uppercase tracking-wider text-[var(--color-fg-muted)]">
            Here now
          </dt>
          <dd>
            {npcsHere.length === 0 ? (
              <span className="text-sm text-[var(--color-fg-muted)]">No one.</span>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {npcsHere.map((n) => (
                  <li key={n.id}>
                    <button
                      onClick={() => selectNpc(n.id)}
                      className="tactile inline-flex items-center gap-2 rounded-md px-2 py-1 text-sm text-[var(--color-fg)] hover:bg-[var(--color-surface-warm)]"
                    >
                      <span
                        aria-hidden
                        className="h-2.5 w-2.5 rounded-sm"
                        style={{ background: factionHex(n.factionColor) }}
                      />
                      {n.name}
                      <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-fg-muted)]">
                        {factionLabel(n.factionId)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </dd>

          {incoming.length > 0 && (
            <>
              <dt className="font-mono text-[11px] uppercase tracking-wider text-[var(--color-fg-muted)]">
                Heading here
              </dt>
              <dd className="flex flex-wrap gap-1.5">
                {incoming.map((n) => (
                  <span
                    key={n.id}
                    className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-warm)] px-2 py-0.5 text-xs text-[var(--color-fg)]"
                  >
                    <span
                      aria-hidden
                      className="mr-1.5 inline-block h-2 w-2 rounded-sm align-middle"
                      style={{ background: factionHex(n.factionColor) }}
                    />
                    {n.name}
                  </span>
                ))}
              </dd>
            </>
          )}
        </dl>
      </div>
    </aside>
  );
}

function factionHex(color: number): string {
  return "#" + color.toString(16).padStart(6, "0");
}

function factionLabel(id: string): string {
  return FACTIONS.find((f) => f.id === id)?.name ?? id;
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
      {have}/{need}
    </span>
  );
}
