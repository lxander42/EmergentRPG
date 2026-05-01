"use client";

import { House, X } from "@phosphor-icons/react/dist/ssr";
import { useGameStore } from "@/lib/state/game-store";
import { biomeAt } from "@/lib/sim/biome";
import { BIOMES } from "@/content/biomes";
import { FACTIONS } from "@/content/factions";
import { BIOME_RESOURCES, RESOURCES } from "@/content/resources";

export default function RegionPanel() {
  const region = useGameStore((s) => s.selectedRegion);
  const world = useGameStore((s) => s.world);
  const select = useGameStore((s) => s.selectRegion);
  const selectNpc = useGameStore((s) => s.selectNpc);
  const homePending = useGameStore((s) => s.homePending);
  const claimHome = useGameStore((s) => s.claimHome);

  if (!region || !world) return null;

  const biome = biomeAt(region.rx, region.ry);
  const meta = BIOMES[biome];
  const npcsHere = world.npcs.filter((n) => n.rx === region.rx && n.ry === region.ry);
  const incoming = world.npcs.filter(
    (n) => n.intent && n.intent.rx === region.rx && n.intent.ry === region.ry,
  );
  const canClaim = homePending && meta.passable;
  const foods = BIOME_RESOURCES[biome].food;

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
