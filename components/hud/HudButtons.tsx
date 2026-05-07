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

// Tiny letter badge anchored to the bottom-right of a ribbon button. Hidden
// on mobile because the keybindings are desktop-only (touch users have no
// way to type the letter).
function KeyHint({ letter }: { letter: string }) {
  return (
    <kbd
      aria-hidden
      className="pointer-events-none absolute -bottom-0.5 -right-0.5 hidden h-3.5 w-3.5 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] font-mono text-[8px] font-medium leading-none text-[var(--color-fg-muted)] sm:inline-flex"
    >
      {letter}
    </kbd>
  );
}

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
  const closePastLives = useGameStore((s) => s.closePastLives);
  const pastLivesOpen = useGameStore((s) => s.pastLivesOpen);
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
            aria-keyshortcuts="m"
            aria-pressed={view === "world"}
            onClick={() => setView(view === "biome" ? "world" : "biome")}
            className={`tactile relative inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-[var(--color-surface-warm)] ${
              view === "world" ? "text-[var(--color-accent)]" : "text-[var(--color-fg)]"
            }`}
          >
            {view === "biome" ? (
              <MapTrifold size={18} weight="duotone" />
            ) : (
              <House size={18} weight="duotone" />
            )}
            <KeyHint letter="M" />
          </button>
        )}

        {hasHome && view === "biome" && (
          <button
            aria-label={buildModeActive ? "Exit build mode" : "Enter build mode"}
            aria-keyshortcuts="b"
            aria-pressed={buildModeActive}
            onClick={buildModeActive ? exitBuildMode : enterBuildMode}
            className={`tactile relative inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-[var(--color-surface-warm)] ${
              buildModeActive ? "text-[var(--color-accent)]" : "text-[var(--color-fg)]"
            }`}
          >
            <Hammer size={18} weight={buildModeActive ? "fill" : "duotone"} />
            <KeyHint letter="B" />
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
          aria-label={inventoryOpen ? "Close inventory" : "Open inventory"}
          aria-keyshortcuts="i"
          aria-pressed={inventoryOpen}
          onClick={inventoryOpen ? closeInventory : openInventory}
          className={`tactile relative inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-[var(--color-surface-warm)] ${
            inventoryOpen
              ? "bg-[var(--color-surface-warm)] text-[var(--color-accent)]"
              : "text-[var(--color-fg)]"
          }`}
        >
          <TreasureChest
            size={20}
            weight={inventoryOpen ? "fill" : "duotone"}
          />
          <KeyHint letter="I" />
          {inventoryFull && (
            <span
              aria-hidden
              className="absolute -left-0.5 -top-0.5 h-2 w-2 rounded-full bg-[var(--color-accent)]"
            />
          )}
        </button>

        {legacyCount > 0 && (
          <button
            aria-label={pastLivesOpen ? "Close past lives" : "Past lives"}
            aria-pressed={pastLivesOpen}
            onClick={pastLivesOpen ? closePastLives : openPastLives}
            className={`tactile inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-[var(--color-surface-warm)] ${
              pastLivesOpen
                ? "bg-[var(--color-surface-warm)] text-[var(--color-accent)]"
                : "text-[var(--color-fg)]"
            }`}
          >
            <Skull size={18} weight={pastLivesOpen ? "fill" : "duotone"} />
          </button>
        )}

        <HudMenu />
      </div>
    </div>
  );
}
