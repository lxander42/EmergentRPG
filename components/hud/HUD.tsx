"use client";

import Link from "next/link";
import {
  Bug,
  Eye,
  EyeSlash,
  House,
  Pause,
  Play,
  FastForward,
  MapTrifold,
  Lightning,
  Heart,
  Skull,
} from "@phosphor-icons/react/dist/ssr";
import { useGameStore } from "@/lib/state/game-store";
import { RESOURCES, type ResourceKind } from "@/content/resources";
import { globalToLocal } from "@/lib/sim/biome-interior";
import type { GameOverReason } from "@/lib/sim/world";
import type { Legacy } from "@/lib/sim/legacy";
import { FACTIONS } from "@/content/factions";
import { findFaction } from "@/lib/sim/faction";
import ShapeBadge from "@/components/panels/ShapeBadge";
import {
  inventoryCapFromBaskets,
  inventoryTotal,
} from "@/lib/sim/inventory";
import {
  basketCount,
  TOOLS,
  type ToolInstance,
  type ToolKind,
} from "@/lib/sim/tools";

const SPEEDS = [1, 2, 4] as const;

export default function HUD() {
  const paused = useGameStore((s) => s.paused);
  const speed = useGameStore((s) => s.speed);
  const ticks = useGameStore((s) => s.world?.ticks ?? 0);
  const togglePause = useGameStore((s) => s.togglePause);
  const setSpeed = useGameStore((s) => s.setSpeed);
  const view = useGameStore((s) => s.view);
  const setView = useGameStore((s) => s.setView);
  const homePending = useGameStore((s) => s.homePending);
  const hasHome = useGameStore((s) => Boolean(s.world?.home));
  const player = useGameStore((s) => s.world?.life?.player ?? null);
  const inventory = useGameStore((s) => s.world?.life?.inventory ?? {});
  const gameOver = useGameStore((s) => s.world?.life?.gameOver ?? false);
  const gameOverReason = useGameStore((s) => s.world?.life?.gameOverReason ?? null);
  const lastLegacy = useGameStore((s) => {
    const legacies = s.world?.legacies;
    if (!legacies || legacies.length === 0) return null;
    return legacies[legacies.length - 1] ?? null;
  });
  const legacyCount = useGameStore((s) => s.world?.legacies.length ?? 0);
  const inCombat = useGameStore((s) => {
    const w = s.world;
    const p = w?.life?.player;
    if (!w || !p) return false;
    const here = globalToLocal(p.gx, p.gy);
    for (const n of w.npcs) {
      if (n.rx !== here.rx || n.ry !== here.ry) continue;
      if ((w.playerReputation[n.factionId] ?? 0) < 0) return true;
    }
    return false;
  });
  const killerFactionName = useGameStore((s) => {
    const w = s.world;
    const reason = w?.life?.gameOverReason;
    if (!w || !reason || reason === "starved") return null;
    return findFaction(w.factions, reason.factionId)?.name ?? null;
  });
  const resetAfterDeath = useGameStore((s) => s.resetAfterDeath);
  const openInventory = useGameStore((s) => s.openInventory);
  const openPastLives = useGameStore((s) => s.openPastLives);
  const debugMode = useGameStore((s) => s.debugMode);
  const toggleDebug = useGameStore((s) => s.toggleDebug);
  const mapShowFactions = useGameStore((s) => s.mapShowFactions);
  const toggleMapFactions = useGameStore((s) => s.toggleMapFactions);

  return (
    <>
      <header className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between p-3">
        <Link
          href="/"
          aria-label="Back to menu"
          className="tactile pointer-events-auto inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[0_4px_12px_-6px_rgba(44,40,32,0.18)]"
        >
          <House size={18} weight="duotone" className="text-[var(--color-fg)]" />
        </Link>

        <div className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] py-1 pl-3.5 pr-1.5 shadow-[0_4px_12px_-6px_rgba(44,40,32,0.18)]">
          <span className="select-none font-mono text-xs tabular-nums text-[var(--color-fg-muted)]">
            {ticks.toString().padStart(4, "0")}
          </span>

          <span className="mx-1 h-4 w-px bg-[var(--color-border)]" aria-hidden />

          <button
            aria-label={paused ? "Resume" : "Pause"}
            aria-pressed={paused}
            onClick={togglePause}
            className="tactile inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--color-fg)] hover:bg-[var(--color-surface-warm)]"
          >
            {paused ? <Play size={16} weight="fill" /> : <Pause size={16} weight="fill" />}
          </button>

          <button
            aria-label={`Speed ${speed}x, tap to cycle`}
            onClick={() => {
              const idx = SPEEDS.indexOf(speed as (typeof SPEEDS)[number]);
              const next = SPEEDS[(idx + 1) % SPEEDS.length] ?? 1;
              setSpeed(next);
            }}
            className="tactile inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-[var(--color-fg)] hover:bg-[var(--color-surface-warm)]"
          >
            <FastForward size={14} weight="fill" />
            <span className="font-mono text-[11px] tabular-nums">{speed}x</span>
          </button>

          {hasHome && (
            <>
              <span className="mx-1 h-4 w-px bg-[var(--color-border)]" aria-hidden />
              <button
                aria-label={view === "biome" ? "Switch to world map" : "Enter biome"}
                onClick={() => setView(view === "biome" ? "world" : "biome")}
                className="tactile inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--color-fg)] hover:bg-[var(--color-surface-warm)]"
              >
                {view === "biome" ? (
                  <MapTrifold size={16} weight="duotone" />
                ) : (
                  <House size={16} weight="duotone" />
                )}
              </button>
            </>
          )}

          {view === "world" && (
            <>
              <span className="mx-1 h-4 w-px bg-[var(--color-border)]" aria-hidden />
              <button
                aria-label={
                  mapShowFactions ? "Hide faction zones" : "Show faction zones"
                }
                aria-pressed={mapShowFactions}
                onClick={toggleMapFactions}
                className={`tactile inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-[var(--color-surface-warm)] ${
                  mapShowFactions ? "text-[var(--color-fg)]" : "text-[var(--color-fg-muted)]"
                }`}
              >
                {mapShowFactions ? (
                  <Eye size={16} weight="duotone" />
                ) : (
                  <EyeSlash size={16} weight="duotone" />
                )}
              </button>
            </>
          )}

          {legacyCount > 0 && (
            <>
              <span className="mx-1 h-4 w-px bg-[var(--color-border)]" aria-hidden />
              <button
                aria-label="Past lives"
                onClick={openPastLives}
                className="tactile inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--color-fg)] hover:bg-[var(--color-surface-warm)]"
              >
                <Skull size={16} weight="duotone" />
              </button>
            </>
          )}

          <span className="mx-1 h-4 w-px bg-[var(--color-border)]" aria-hidden />
          <button
            aria-label={debugMode ? "Hide debug overlay" : "Show debug overlay"}
            aria-pressed={debugMode}
            onClick={toggleDebug}
            className={`tactile inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-[var(--color-surface-warm)] ${
              debugMode ? "text-[var(--color-accent)]" : "text-[var(--color-fg-muted)]"
            }`}
          >
            <Bug size={16} weight={debugMode ? "fill" : "regular"} />
          </button>
        </div>
      </header>

      {debugMode && <DebugStrip />}

      {homePending && view === "world" && (
        <div className="pointer-events-none absolute inset-x-0 top-16 z-10 flex justify-center px-3">
          <div className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-1.5 font-mono text-[11px] uppercase tracking-wider text-[var(--color-fg-muted)] shadow-[0_4px_12px_-6px_rgba(44,40,32,0.18)]">
            Tap a region to claim your home base
          </div>
        </div>
      )}

      {player && (
        <div className="pointer-events-none absolute inset-x-2 top-16 z-10 flex flex-wrap items-center justify-end gap-2">
          <HealthStrip health={player.health} max={player.healthMax} inCombat={inCombat} />
          <EnergyStrip energy={player.energy} max={player.energyMax} />
          <InventoryStrip
            inventory={inventory}
            tools={player.tools}
            onOpen={openInventory}
          />
        </div>
      )}

      {gameOver && (
        <div className="pointer-events-auto absolute inset-0 z-30 flex items-center justify-center bg-[rgba(44,40,32,0.55)] p-6">
          <div className="max-w-sm rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-center shadow-[0_24px_64px_-24px_rgba(44,40,32,0.5)]">
            <p className="font-mono text-[11px] uppercase tracking-wider text-[var(--color-fg-muted)]">
              The end of one life
            </p>
            <h2 className="mt-2 text-[1.75rem] font-medium tracking-tight leading-[1.05] text-[var(--color-fg)]">
              {gameOverHeadline(gameOverReason)}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-[var(--color-fg-muted)] max-w-[34ch] mx-auto">
              {gameOverBody(gameOverReason, killerFactionName)}
            </p>
            {lastLegacy && <LegacyStats legacy={lastLegacy} />}
            <button
              onClick={resetAfterDeath}
              className="tactile mt-5 inline-flex items-center justify-center rounded-2xl bg-[var(--color-accent)] px-4 py-3 text-sm font-medium text-[var(--color-bg)] shadow-[0_8px_24px_-12px_rgba(217,104,70,0.5)]"
            >
              Begin a new life
            </button>
            {legacyCount > 0 && (
              <button
                onClick={openPastLives}
                className="tactile mt-2 inline-flex items-center justify-center gap-1.5 rounded-2xl px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-warm)] hover:text-[var(--color-fg)]"
              >
                <Skull size={12} weight="duotone" />
                View past lives
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function LegacyStats({ legacy }: { legacy: Legacy }) {
  const faction = FACTIONS.find((f) => f.id === legacy.factionOfOriginId);
  const factionHex = faction
    ? "#" + faction.color.toString(16).padStart(6, "0")
    : "#cccccc";
  const shape = faction?.shape ?? "diamond";
  return (
    <div className="mt-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-warm)] px-4 py-3 text-left">
      <div className="flex items-center gap-2">
        <ShapeBadge shape={shape} color={factionHex} />
        <div>
          <p className="text-sm font-medium text-[var(--color-fg)]">{legacy.name}</p>
          <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-fg-muted)]">
            of {faction?.name ?? legacy.factionOfOriginId}
          </p>
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2 font-mono text-[10px] uppercase tracking-wider text-[var(--color-fg-muted)]">
        <div>
          <dt>Ticks</dt>
          <dd className="mt-0.5 font-mono text-base tabular-nums text-[var(--color-fg)]">
            {legacy.ticksAlive}
          </dd>
        </div>
        <div>
          <dt>Kills</dt>
          <dd className="mt-0.5 font-mono text-base tabular-nums text-[var(--color-fg)]">
            {legacy.kills}
          </dd>
        </div>
        <div>
          <dt>Regions</dt>
          <dd className="mt-0.5 font-mono text-base tabular-nums text-[var(--color-fg)]">
            {legacy.regionsDiscovered}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function gameOverHeadline(reason: GameOverReason | null): string {
  if (!reason || reason === "starved") return "You starved.";
  return `Killed by ${reason.killerName}.`;
}

function gameOverBody(
  reason: GameOverReason | null,
  factionName: string | null,
): string {
  if (!reason || reason === "starved") {
    return "Hunger took the rest. The land remembers; begin a new life.";
  }
  if (factionName) {
    return `A blade of the ${factionName} ended this run. The world remembers; begin a new life.`;
  }
  return "The world remembers; begin a new life.";
}

function DebugStrip() {
  const world = useGameStore((s) => s.world);
  const minimized = useGameStore((s) => s.debugMinimized);
  const toggleMinimized = useGameStore((s) => s.toggleDebugMinimized);
  if (!world) return null;
  const player = world.life?.player ?? null;
  const here = player ? globalToLocal(player.gx, player.gy) : null;
  const inRegion = here
    ? world.npcs.filter((n) => n.rx === here.rx && n.ry === here.ry).length
    : 0;
  const factionLines = world.factions.map((f) => ({
    id: f.id,
    pwr: f.power,
    rep: world.playerReputation[f.id] ?? 0,
  }));

  if (minimized) {
    return (
      <button
        onClick={toggleMinimized}
        aria-label="Expand debug overlay"
        className="tactile pointer-events-auto absolute bottom-2 left-2 z-10 inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-[var(--color-fg)] shadow-[0_4px_12px_-6px_rgba(44,40,32,0.18)]"
      >
        <Bug size={12} weight="fill" className="text-[var(--color-accent)]" />
        Debug · {world.npcs.length} npcs
      </button>
    );
  }

  return (
    <aside
      role="status"
      aria-label="Debug stats"
      className="pointer-events-auto absolute bottom-2 left-2 z-10 max-w-[70vw] rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 font-mono text-[10px] leading-tight text-[var(--color-fg)] shadow-[0_4px_12px_-6px_rgba(44,40,32,0.18)]"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-[var(--color-fg-muted)] uppercase tracking-wider">Debug</span>
        <button
          onClick={toggleMinimized}
          aria-label="Minimize debug overlay"
          className="tactile -my-0.5 -mr-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-warm)] hover:text-[var(--color-fg)]"
        >
          –
        </button>
      </div>
      <div className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
        <span className="text-[var(--color-fg-muted)]">npcs</span>
        <span className="tabular-nums">{world.npcs.length}</span>
        <span className="text-[var(--color-fg-muted)]">tick</span>
        <span className="tabular-nums">{world.ticks}</span>
        {player && here && (
          <>
            <span className="text-[var(--color-fg-muted)]">player</span>
            <span className="tabular-nums">
              g({player.gx},{player.gy}) r({here.rx},{here.ry})
            </span>
            <span className="text-[var(--color-fg-muted)]">in-region</span>
            <span className="tabular-nums">{inRegion}</span>
          </>
        )}
      </div>
      <div className="mt-1 border-t border-[var(--color-border)] pt-1">
        {factionLines.map((f) => (
          <div key={f.id} className="flex justify-between gap-4">
            <span className="text-[var(--color-fg-muted)]">{f.id}</span>
            <span className="tabular-nums">
              pwr {f.pwr} · rep {f.rep}
            </span>
          </div>
        ))}
      </div>
    </aside>
  );
}

function HealthStrip({
  health,
  max,
  inCombat,
}: {
  health: number;
  max: number;
  inCombat: boolean;
}) {
  const low = health > 0 && health <= Math.ceil(max / 2);
  return (
    <div className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1 shadow-[0_4px_12px_-6px_rgba(44,40,32,0.18)]">
      {inCombat && (
        <span
          aria-hidden
          className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)] animate-pulse"
        />
      )}
      <Heart
        size={14}
        weight="fill"
        className={low ? "text-[var(--color-accent)] animate-pulse" : "text-[var(--color-accent)]"}
      />
      <div className="flex items-center gap-[3px]">
        {Array.from({ length: max }).map((_, i) => (
          <span
            key={i}
            aria-hidden
            className="h-2.5 w-2 rounded-[2px]"
            style={{
              background: i < health ? "var(--color-accent)" : "var(--color-surface-warm)",
              border:
                i < health
                  ? "1px solid var(--color-accent)"
                  : "1px solid var(--color-border)",
            }}
          />
        ))}
      </div>
      <span className="ml-1 font-mono text-[10px] tabular-nums text-[var(--color-fg-muted)]">
        {health}/{max}
      </span>
    </div>
  );
}

function EnergyStrip({ energy, max }: { energy: number; max: number }) {
  return (
    <div className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1 shadow-[0_4px_12px_-6px_rgba(44,40,32,0.18)]">
      <Lightning size={14} weight="fill" className="text-[var(--color-accent)]" />
      <div className="flex items-center gap-[3px]">
        {Array.from({ length: max }).map((_, i) => (
          <span
            key={i}
            aria-hidden
            className="h-2.5 w-2 rounded-[2px]"
            style={{
              background: i < energy ? "var(--color-accent)" : "var(--color-surface-warm)",
              border:
                i < energy
                  ? "1px solid var(--color-accent)"
                  : "1px solid var(--color-border)",
            }}
          />
        ))}
      </div>
      <span className="ml-1 font-mono text-[10px] tabular-nums text-[var(--color-fg-muted)]">
        {energy}/{max}
      </span>
    </div>
  );
}

function InventoryStrip({
  inventory,
  tools,
  onOpen,
}: {
  inventory: Partial<Record<ResourceKind, number>>;
  tools: ToolInstance[];
  onOpen: () => void;
}) {
  const entries = (Object.entries(inventory) as Array<[ResourceKind, number]>).filter(
    ([, n]) => n > 0,
  );
  const cap = inventoryCapFromBaskets(basketCount(tools));
  const total = inventoryTotal(inventory);
  const grouped = groupTools(tools);
  return (
    <button
      onClick={onOpen}
      aria-label="Open inventory"
      className="tactile pointer-events-auto inline-flex flex-col items-stretch gap-1 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 shadow-[0_4px_12px_-6px_rgba(44,40,32,0.18)]"
    >
      <span className="inline-flex items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-wider tabular-nums text-[var(--color-fg-muted)]">
          {total}/{cap}
        </span>
        {entries.length === 0 ? (
          <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-fg-muted)]">
            empty
          </span>
        ) : (
          entries.map(([kind, count]) => (
            <span key={kind} className="inline-flex items-center gap-1">
              <span
                aria-hidden
                className="h-2.5 w-2.5 rounded-full border border-[var(--color-border-strong)]"
                style={{ background: RESOURCES[kind].swatch }}
              />
              <span className="font-mono text-[10px] tabular-nums text-[var(--color-fg)]">
                {count}
              </span>
            </span>
          ))
        )}
      </span>
      {grouped.length > 0 && (
        <span className="inline-flex items-center gap-1.5 border-t border-[var(--color-border)] pt-1">
          {grouped.map((g) => (
            <ToolBadge key={g.kind} kind={g.kind} count={g.count} fraction={g.fraction} />
          ))}
        </span>
      )}
    </button>
  );
}

type ToolGroup = { kind: ToolKind; count: number; fraction: number };

function groupTools(tools: ToolInstance[]): ToolGroup[] {
  const map = new Map<ToolKind, { count: number; minFraction: number }>();
  for (const t of tools) {
    const meta = TOOLS[t.kind];
    const fraction = meta.durability > 0 ? Math.max(0, t.usesLeft) / meta.durability : 1;
    const cur = map.get(t.kind);
    if (cur) {
      cur.count += 1;
      if (fraction < cur.minFraction) cur.minFraction = fraction;
    } else {
      map.set(t.kind, { count: 1, minFraction: fraction });
    }
  }
  const out: ToolGroup[] = [];
  for (const [kind, v] of map) {
    out.push({ kind, count: v.count, fraction: v.minFraction });
  }
  return out;
}

function ToolBadge({
  kind,
  count,
  fraction,
}: {
  kind: ToolKind;
  count: number;
  fraction: number;
}) {
  const meta = TOOLS[kind];
  const f = Math.max(0, Math.min(1, fraction));
  const r = 8;
  const c = 2 * Math.PI * r;
  const dash = c * f;
  const showRing = meta.durability < 999;
  return (
    <span
      aria-label={`${meta.label} ×${count}`}
      className="relative inline-flex h-5 w-5 items-center justify-center"
    >
      {showRing && (
        <svg
          viewBox="0 0 20 20"
          className="absolute inset-0"
          aria-hidden
        >
          <circle
            cx="10"
            cy="10"
            r={r}
            fill="none"
            stroke="var(--color-border)"
            strokeWidth="1.5"
          />
          <circle
            cx="10"
            cy="10"
            r={r}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth="1.5"
            strokeDasharray={`${dash} ${c}`}
            strokeLinecap="round"
            transform="rotate(-90 10 10)"
          />
        </svg>
      )}
      <span
        aria-hidden
        className="relative h-3 w-3 rounded-sm border border-[var(--color-border-strong)]"
        style={{ background: meta.swatch }}
      />
      {count > 1 && (
        <span className="absolute -bottom-1 -right-1 inline-flex min-w-3 items-center justify-center rounded-full bg-[var(--color-fg)] px-1 font-mono text-[8px] font-medium leading-none text-[var(--color-bg)]">
          ×{count}
        </span>
      )}
    </span>
  );
}
