"use client";

import {
  ForkKnife,
  Heart,
  Skull,
} from "@phosphor-icons/react/dist/ssr";
import { useGameStore } from "@/lib/state/game-store";
import { globalToLocal } from "@/lib/sim/biome-interior";
import type { GameOverReason } from "@/lib/sim/world";
import type { Legacy } from "@/lib/sim/legacy";
import { FACTIONS } from "@/content/factions";
import { findFaction } from "@/lib/sim/faction";
import ShapeBadge from "@/components/panels/ShapeBadge";
import HudButtons from "@/components/hud/HudButtons";

export default function HUD() {
  const player = useGameStore((s) => s.world?.life?.player ?? null);
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
  const openPastLives = useGameStore((s) => s.openPastLives);

  return (
    <>
      {player && (
        <IdentityBadge
          name={player.name}
          factionOfOriginId={player.factionOfOriginId}
          health={player.health}
          healthMax={player.healthMax}
          energy={player.energy}
          energyMax={player.energyMax}
          inCombat={inCombat}
        />
      )}

      <HudButtons />

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

function IdentityBadge({
  name,
  factionOfOriginId,
  health,
  healthMax,
  energy,
  energyMax,
  inCombat,
}: {
  name: string;
  factionOfOriginId: string;
  health: number;
  healthMax: number;
  energy: number;
  energyMax: number;
  inCombat: boolean;
}) {
  const faction = FACTIONS.find((f) => f.id === factionOfOriginId);
  const color = faction
    ? "#" + faction.color.toString(16).padStart(6, "0")
    : "#cccccc";
  const factionName = faction?.name ?? factionOfOriginId;
  const lowHealth = health > 0 && health <= Math.ceil(healthMax / 2);
  const lowEnergy = energy > 0 && energy <= 3;
  const empty = energy === 0;
  return (
    <div className="pointer-events-auto absolute left-2 top-2 z-20 flex flex-col items-start gap-1.5">
      <div
        className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] py-1 pl-1 pr-3 shadow-[0_4px_12px_-6px_rgba(44,40,32,0.18)]"
        title={`${name} · ${factionName}`}
      >
        <span
          aria-hidden
          className="h-6 w-6 shrink-0 rounded-md border border-[var(--color-border-strong)]"
          style={{ background: color }}
        />
        <span className="flex flex-col items-start leading-tight">
          <span className="text-xs font-medium text-[var(--color-fg)]">{name}</span>
          <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--color-fg-muted)]">
            {factionName}
          </span>
        </span>
      </div>
      <div className="ml-1 flex items-center gap-2">
        <span
          aria-label={`Health ${health}/${healthMax}`}
          className="inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-0.5 shadow-[0_2px_8px_-4px_rgba(44,40,32,0.18)]"
        >
          <Heart
            size={11}
            weight="fill"
            className={
              lowHealth
                ? "animate-pulse text-[#b03131]"
                : "text-[#b03131]"
            }
          />
          <span className="font-mono text-[10px] tabular-nums text-[var(--color-fg)]">
            {health}/{healthMax}
          </span>
          {inCombat && (
            <span
              aria-hidden
              className="ml-0.5 h-1.5 w-1.5 rounded-full bg-[#b03131] animate-pulse"
            />
          )}
        </span>
        <span
          aria-label={`Hunger ${energy}/${energyMax}`}
          className="inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-0.5 shadow-[0_2px_8px_-4px_rgba(44,40,32,0.18)]"
        >
          <ForkKnife
            size={11}
            weight="fill"
            className={
              empty
                ? "animate-pulse text-[var(--color-accent)]"
                : lowEnergy
                  ? "text-[var(--color-accent)]"
                  : "text-[var(--color-fg-muted)]"
            }
          />
          <span className="font-mono text-[10px] tabular-nums text-[var(--color-fg)]">
            {energy}/{energyMax}
          </span>
        </span>
      </div>
    </div>
  );
}
