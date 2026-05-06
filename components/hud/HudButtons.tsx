"use client";

import {
  Eye,
  EyeSlash,
  Hammer,
  House,
  MapTrifold,
  Skull,
  TreasureChest,
} from "@phosphor-icons/react/dist/ssr";
import { useGameStore } from "@/lib/state/game-store";
import {
  inventoryCapFromBaskets,
  inventoryTotal,
} from "@/lib/sim/inventory";
import { basketCount } from "@/lib/sim/tools";
import HudMenu from "@/components/hud/HudMenu";

// Bottom-right cluster: map-toggle, build-mode (biome only),
// map-factions (world only), inventory, past-lives, menu. Pause and home
// live inside HudMenu now to keep this row to the essentials. Everything
// here is small enough to fit on a 360px-wide phone.
export default function HudButtons() {
  const view = useGameStore((s) => s.view);
  const setView = useGameStore((s) => s.setView);
  const hasHome = useGameStore((s) => Boolean(s.world?.home));
  const buildModeActive = useGameStore((s) => s.buildMode.active);
  const enterBuildMode = useGameStore((s) => s.enterBuildMode);
  const exitBuildMode = useGameStore((s) => s.exitBuildMode);
  const mapShowFactions = useGameStore((s) => s.mapShowFactions);
  const toggleMapFactions = useGameStore((s) => s.toggleMapFactions);
  const openInventory = useGameStore((s) => s.openInventory);
  const inventoryOpen = useGameStore((s) => s.inventoryOpen);
  const closeInventory = useGameStore((s) => s.closeInventory);
  const openPastLives = useGameStore((s) => s.openPastLives);
  const legacyCount = useGameStore((s) => s.world?.legacies.length ?? 0);
  const inventory = useGameStore((s) => s.world?.life?.inventory ?? null);
  const tools = useGameStore((s) => s.world?.life?.player.tools ?? null);

  const cap = tools ? inventoryCapFromBaskets(basketCount(tools)) : 20;
  const inventoryFull = inventory ? inventoryTotal(inventory) >= cap : false;

  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-end p-3"
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom, 0))" }}
    >
      <div className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] p-1 shadow-[0_4px_12px_-6px_rgba(44,40,32,0.18)]">
        {hasHome && (
          <button
            aria-label={view === "biome" ? "Show world map" : "Return to biome"}
            aria-pressed={view === "world"}
            onClick={() => setView(view === "biome" ? "world" : "biome")}
            className={`tactile inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-[var(--color-surface-warm)] ${
              view === "world" ? "text-[var(--color-accent)]" : "text-[var(--color-fg)]"
            }`}
          >
            {view === "biome" ? (
              <MapTrifold size={18} weight="duotone" />
            ) : (
              <House size={18} weight="duotone" />
            )}
          </button>
        )}

        {hasHome && view === "biome" && (
          <button
            aria-label={buildModeActive ? "Exit build mode" : "Enter build mode"}
            aria-pressed={buildModeActive}
            onClick={buildModeActive ? exitBuildMode : enterBuildMode}
            className={`tactile inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-[var(--color-surface-warm)] ${
              buildModeActive ? "text-[var(--color-accent)]" : "text-[var(--color-fg)]"
            }`}
          >
            <Hammer size={18} weight={buildModeActive ? "fill" : "duotone"} />
          </button>
        )}

        {view === "world" && (
          <button
            aria-label={mapShowFactions ? "Hide faction zones" : "Show faction zones"}
            aria-pressed={mapShowFactions}
            onClick={toggleMapFactions}
            className={`tactile inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-[var(--color-surface-warm)] ${
              mapShowFactions ? "text-[var(--color-fg)]" : "text-[var(--color-fg-muted)]"
            }`}
          >
            {mapShowFactions ? (
              <Eye size={18} weight="duotone" />
            ) : (
              <EyeSlash size={18} weight="duotone" />
            )}
          </button>
        )}

        <button
          aria-label="Open inventory"
          aria-pressed={inventoryOpen}
          onClick={inventoryOpen ? closeInventory : openInventory}
          className="tactile relative inline-flex h-10 w-10 items-center justify-center rounded-full text-[var(--color-fg)] hover:bg-[var(--color-surface-warm)]"
        >
          <TreasureChest size={20} weight="duotone" />
          {inventoryFull && (
            <span
              aria-hidden
              className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-[var(--color-accent)]"
            />
          )}
        </button>

        {legacyCount > 0 && (
          <button
            aria-label="Past lives"
            onClick={openPastLives}
            className="tactile inline-flex h-10 w-10 items-center justify-center rounded-full text-[var(--color-fg)] hover:bg-[var(--color-surface-warm)]"
          >
            <Skull size={18} weight="duotone" />
          </button>
        )}

        <HudMenu />
      </div>
    </div>
  );
}
