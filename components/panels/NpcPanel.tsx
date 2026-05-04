"use client";

import { Sword, X } from "@phosphor-icons/react/dist/ssr";
import { useGameStore } from "@/lib/state/game-store";
import { findNpc } from "@/lib/sim/world";
import type { Npc } from "@/lib/sim/npc";
import type { Goal } from "@/lib/sim/goal";
import type { Player } from "@/lib/sim/player";
import { FACTIONS } from "@/content/factions";
import { RESOURCES } from "@/content/resources";
import ShapeBadge from "@/components/panels/ShapeBadge";
import { globalToLocal } from "@/lib/sim/biome-interior";
import { pickWeaponForRange, weaponAttackBonus, weaponReach } from "@/lib/sim/weapons";
import { WEAPONS } from "@/content/weapons";

export default function NpcPanel() {
  const selectedId = useGameStore((s) => s.selectedNpcId);
  const world = useGameStore((s) => s.world);
  const attackNpc = useGameStore((s) => s.attackNpc);
  const npc = world && selectedId ? findNpc(world, selectedId) : undefined;

  if (!npc || !world) return null;
  return (
    <NpcPanelInner
      npc={npc}
      npcs={world.npcs}
      player={world.life?.player ?? null}
      playerRep={world.playerReputation[npc.factionId] ?? 0}
      onAttack={() => attackNpc(npc.id)}
    />
  );
}

function NpcPanelInner({
  npc,
  npcs,
  player,
  playerRep,
  onAttack,
}: {
  npc: Npc;
  npcs: Npc[];
  player: Player | null;
  playerRep: number;
  onAttack: () => void;
}) {
  const select = useGameStore((s) => s.selectNpc);
  const factionColorHex = "#" + npc.factionColor.toString(16).padStart(6, "0");
  const shape = FACTIONS.find((f) => f.id === npc.factionId)?.shape ?? "diamond";

  const sentiment: "hostile" | "wary" | "friendly" =
    playerRep < 0 ? "hostile" : playerRep > 0 ? "friendly" : "wary";
  const matchup = computeMatchup(player, npc);

  return (
    <aside
      role="dialog"
      aria-label={`${npc.name} details`}
      className="pointer-events-auto absolute inset-x-2 bottom-2 z-20 max-h-[60dvh] overflow-y-auto rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[0_20px_48px_-20px_rgba(44,40,32,0.25)]"
    >
      <div className="mx-auto max-w-2xl">
        <header className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <ShapeBadge shape={shape} color={factionColorHex} />
            <div>
              <h2 className="text-lg font-medium leading-tight text-[var(--color-fg)]">
                {npc.name}
              </h2>
              <p className="font-mono text-[11px] uppercase tracking-wider text-[var(--color-fg-muted)]">
                {npc.factionId}
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

        <dl className="grid grid-cols-[auto_1fr] items-start gap-x-5 gap-y-3 border-t border-[var(--color-border)] pt-4">
          <dt className="font-mono text-[11px] uppercase tracking-wider text-[var(--color-fg-muted)]">
            Goal
          </dt>
          <dd className="text-sm text-[var(--color-fg)]">{formatGoal(npc.goal, npcs)}</dd>

          <dt className="font-mono text-[11px] uppercase tracking-wider text-[var(--color-fg-muted)]">
            Traits
          </dt>
          <dd className="flex flex-wrap gap-1.5">
            {npc.traits.map((t) => (
              <span
                key={t}
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-warm)] px-2 py-0.5 text-xs text-[var(--color-fg)]"
              >
                {t}
              </span>
            ))}
          </dd>

          <dt className="font-mono text-[11px] uppercase tracking-wider text-[var(--color-fg-muted)]">
            Values
          </dt>
          <dd className="flex flex-wrap gap-1.5">
            {npc.values.map((v) => (
              <span key={v} className="text-xs text-[var(--color-fg-muted)]">
                {v}
              </span>
            ))}
          </dd>

          <dt className="font-mono text-[11px] uppercase tracking-wider text-[var(--color-fg-muted)]">
            Stance
          </dt>
          <dd className="text-sm text-[var(--color-fg)] capitalize">{sentiment}</dd>

          <dt className="font-mono text-[11px] uppercase tracking-wider text-[var(--color-fg-muted)]">
            Combat
          </dt>
          <dd className="text-sm text-[var(--color-fg)]">
            <span className="font-mono tabular-nums">
              atk {npc.combatAttack} · def {npc.combatDefense} · hp {npc.combatHealth}/{npc.combatHealthMax}
            </span>
          </dd>

          {matchup && (
            <>
              <dt className="font-mono text-[11px] uppercase tracking-wider text-[var(--color-fg-muted)]">
                Your hit
              </dt>
              <dd className="text-sm text-[var(--color-fg)]">{matchup}</dd>
            </>
          )}
        </dl>

        {sentiment !== "friendly" && player && (
          <button
            onClick={onAttack}
            className="tactile mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--color-accent)] px-4 py-3 text-sm font-medium text-[var(--color-bg)] shadow-[0_8px_24px_-12px_rgba(217,104,70,0.5)]"
          >
            <Sword size={16} weight="fill" />
            Attack
          </button>
        )}
      </div>
    </aside>
  );
}

function computeMatchup(player: Player | null, npc: Npc): string | null {
  if (!player) return null;
  if (!npc.interior) return "Out of reach";
  const here = globalToLocal(player.gx, player.gy);
  const dist = Math.max(
    Math.abs(here.lx - npc.interior.lx),
    Math.abs(here.ly - npc.interior.ly),
  );
  const weapon = pickWeaponForRange(player.weapons, dist);
  const reach = weapon ? weaponReach(weapon) : player.stats.reach;
  const damage = Math.max(
    1,
    player.stats.attack + weaponAttackBonus(weapon) - npc.combatDefense,
  );
  if (dist > reach) {
    return `${dist} tiles away (need reach ${dist}+)`;
  }
  const weaponName = weapon ? WEAPONS[weapon.kind].label : "bare hands";
  return `~${damage} dmg with ${weaponName}`;
}

function formatGoal(goal: Goal, npcs: Npc[]): string {
  switch (goal.kind) {
    case "wander":
      return "Wandering";
    case "gather": {
      const label = RESOURCES[goal.resourceKind].label.toLowerCase();
      if (goal.phase === "outbound") {
        return `Gathering ${label} at (${goal.targetRegion.rx}, ${goal.targetRegion.ry})`;
      }
      return `Returning home with ${label}`;
    }
    case "patrol":
      return `Patrolling ${goal.regions.length} regions`;
    case "raid": {
      const target = FACTIONS.find((f) => f.id === goal.targetFactionId);
      const name = target?.name ?? goal.targetFactionId;
      return `Raiding ${name} at (${goal.targetRegion.rx}, ${goal.targetRegion.ry})`;
    }
    case "trade": {
      const peer = npcs.find((n) => n.id === goal.peerNpcId);
      return peer ? `Trading with ${peer.name}` : "Seeking a trade partner";
    }
  }
}
