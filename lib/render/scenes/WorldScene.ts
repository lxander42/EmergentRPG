import Phaser from "phaser";
import { bus } from "@/lib/render/bus";
import { useGameStore } from "@/lib/state/game-store";
import { biomeAt } from "@/lib/sim/biome";
import { MAP_W, MAP_H, type MapMarker } from "@/lib/sim/world";
import { FACTIONS } from "@/content/factions";
import { drawFactionShape } from "@/lib/render/shapes";
import { globalToLocal, regionKey } from "@/lib/sim/biome-interior";
import { bitmapAnyDiscovered } from "@/lib/sim/fog";
import type { Npc } from "@/lib/sim/npc";

const REGION = 64;
const PADDING = 6;
const RADIUS = 10;
const INNER = REGION - PADDING * 2;

const STACK_SHAPE_SIZE = 14;
const SOLO_SHAPE_SIZE = 22;
const HOME_GLYPH_SIZE = 18;

const COLORS = {
  bg: 0xf6f1e8,
  grass: 0xcfd9aa,
  grassAlt: 0xd8e2b3,
  forest: 0x8fa873,
  water: 0xa8c8d8,
  sand: 0xe8d8b0,
  stone: 0xb8b0a0,
  // Near-black warm fg colour, matches --color-fg in globals.css.
  outline: 0x2c2820,
  shadow: 0x2c2820,
  selection: 0xd96846,
  player: 0xd96846,
  // matches --color-grid in globals.css.
  grid: 0xc4baa6,
};

// Tracks where each NPC was last drawn so a single global pointerup
// hit-test can resolve which NPC was tapped without spawning a Phaser
// game object per NPC. With 200 NPCs the per-frame cost of 200 hit
// rectangles dominated the world map's CPU budget.
type NpcHitTarget = {
  id: string;
  x: number;
  y: number;
  half: number;
};

export class WorldScene extends Phaser.Scene {
  private tileLayer!: Phaser.GameObjects.Graphics;
  private factionRingLayer!: Phaser.GameObjects.Graphics;
  private telegraphLayer!: Phaser.GameObjects.Graphics;
  private fogOverlay!: Phaser.GameObjects.Graphics;
  private selectionRing!: Phaser.GameObjects.Graphics;
  private homeMarker!: Phaser.GameObjects.Graphics;
  private playerHere!: Phaser.GameObjects.Graphics;
  private playerLabel!: Phaser.GameObjects.Text;
  private npcLayer!: Phaser.GameObjects.Graphics;
  private markerLayer!: Phaser.GameObjects.Graphics;
  private overflowText = new Map<string, Phaser.GameObjects.Text>();
  private markerLabels = new Map<string, Phaser.GameObjects.Text>();
  private npcHits: NpcHitTarget[] = [];
  private markerHits: Array<{ id: string; x: number; y: number; w: number; h: number }> = [];

  private dragStart: { x: number; y: number } | null = null;
  private pinchInitial: { dist: number; zoom: number } | null = null;
  private pointerDownAt = 0;
  private pointerDownPos = { x: 0, y: 0 };
  private dragMoved = false;
  private longPressTimer: Phaser.Time.TimerEvent | null = null;
  private longPressFired = false;

  private accumulator = 0;
  private readonly tickStepMs = 250;
  private lastDrawnTick = -1;
  private dpr = 1;
  // Trail of recent regions the player crossed through, oldest first.
  // Drawn as fading accent dots so the user can see where they came from
  // when watching from the world map.
  private readonly playerTrailMax = 6;
  private playerTrail: Array<{ rx: number; ry: number }> = [];
  private lastPlayerRegion: { rx: number; ry: number } | null = null;

  constructor() {
    super("World");
  }

  create() {
    this.dpr = (this.game.registry.get("dpr") as number) ?? 1;
    this.cameras.main.setBackgroundColor(COLORS.bg);
    this.tileLayer = this.add.graphics();
    this.drawTiles();

    this.factionRingLayer = this.add.graphics();
    this.telegraphLayer = this.add.graphics();
    this.npcLayer = this.add.graphics();
    this.fogOverlay = this.add.graphics();
    this.markerLayer = this.add.graphics();
    this.homeMarker = this.add.graphics();
    this.homeMarker.setVisible(false);
    this.playerHere = this.add.graphics();
    this.playerHere.setVisible(false);
    this.playerLabel = this.add.text(0, 0, "you", {
      fontFamily: "ui-monospace, monospace",
      fontSize: "10px",
      color: "#d96846",
    });
    this.playerLabel.setOrigin(0.5, 0);
    this.playerLabel.setVisible(false);
    this.selectionRing = this.add.graphics();
    this.selectionRing.setVisible(false);

    const worldPx = MAP_W * REGION;
    this.cameras.main.setBounds(-200, -200, worldPx + 400, worldPx + 400);
    // setZoom must happen BEFORE centerOn -- centerOn uses the current zoom
    // to compute scrollX/Y, so doing it the other way puts the camera in
    // the wrong place and the world map looks empty / offset on first paint.
    this.cameras.main.setZoom(0.45 * this.dpr);
    this.cameras.main.centerOn(worldPx / 2, worldPx / 2);
    this.lastDrawnTick = -1;
    this.playerTrail = [];
    this.lastPlayerRegion = null;

    this.input.addPointer(2);
    this.input.on("pointerdown", this.onPointerDown, this);
    this.input.on("pointermove", this.onPointerMove, this);
    this.input.on("pointerup", this.onPointerUp, this);
    this.input.on("wheel", this.onWheel, this);

    bus.on("npc:deselected", this.clearSelection);
    this.scale.on("resize", this.handleResize, this);
    this.game.events.on("dprchange", this.onDprChange, this);
  }

  shutdown() {
    bus.off("npc:deselected", this.clearSelection);
    this.scale.off("resize", this.handleResize, this);
    this.game.events.off("dprchange", this.onDprChange, this);
    for (const t of this.overflowText.values()) t.destroy();
    this.overflowText.clear();
    for (const t of this.markerLabels.values()) t.destroy();
    this.markerLabels.clear();
    this.markerHits = [];
    this.cancelLongPress();
    this.npcHits = [];
  }

  // Player marker animates on time.now so it must redraw every frame, not
  // gated behind world-tick changes. The pulsing happens in renderPlayerHere.

  update(_time: number, delta: number) {
    const store = useGameStore.getState();
    if (store.view === "biome") {
      this.scene.start("Biome");
      return;
    }
    if (!store.paused && !store.world?.life?.gameOver) {
      this.accumulator += delta * store.speed;
      while (this.accumulator >= this.tickStepMs) {
        this.accumulator -= this.tickStepMs;
        store.tick();
        bus.emit("world:tick", { ticks: useGameStore.getState().world?.ticks ?? 0 });
      }
    }

    const world = store.world;
    if (!world) return;

    if (world.ticks !== this.lastDrawnTick) {
      const debug = useGameStore.getState().debugMode;
      if (debug) {
        this.renderNpcs(world.npcs, world.discoveredTiles, world.home != null);
        this.renderTelegraphs(world.npcs, world.discoveredTiles, world.home != null);
      } else {
        this.npcLayer.clear();
        this.telegraphLayer.clear();
        this.npcHits = [];
      }
      const showFactions = useGameStore.getState().mapShowFactions;
      if (showFactions) {
        this.renderFactionRings(
          world.regionControl,
          world.home,
          world.discoveredTiles,
          world.home != null,
        );
      } else {
        this.factionRingLayer.clear();
      }
      this.renderFogOverlay(world.discoveredTiles, world.home != null);
      this.renderMarkers(world.mapMarkers);
      this.lastDrawnTick = world.ticks;
    }
    this.renderHomeMarker();
    this.renderPlayerHere();
    this.renderSelection();
  }

  private renderMarkers(markers: MapMarker[]) {
    this.markerLayer.clear();
    const live = new Set<string>();
    const hits: Array<{ id: string; x: number; y: number; w: number; h: number }> = [];
    for (const m of markers) {
      live.add(m.id);
      const cx = m.rx * REGION + REGION / 2;
      const cy = m.ry * REGION + REGION / 2;
      this.markerLayer.fillStyle(COLORS.outline, 0.85);
      this.markerLayer.fillCircle(cx, cy - 12, 3);
      this.markerLayer.lineStyle(1.5, COLORS.outline, 0.85);
      this.markerLayer.beginPath();
      this.markerLayer.moveTo(cx, cy - 11);
      this.markerLayer.lineTo(cx, cy - 4);
      this.markerLayer.strokePath();
      let label = this.markerLabels.get(m.id);
      if (!label) {
        label = this.add.text(0, 0, m.name, {
          fontFamily: "Outfit, ui-sans-serif, system-ui, sans-serif",
          fontSize: "11px",
          fontStyle: "bold",
          color: "#2c2820",
          backgroundColor: "#fbf6ed",
          padding: { x: 4, y: 1 },
        });
        label.setOrigin(0.5, 1);
        this.markerLabels.set(m.id, label);
      }
      label.setText(m.name);
      label.setPosition(cx, cy - 14);
      const w = label.width;
      const h = label.height;
      hits.push({ id: m.id, x: cx, y: cy - 14 - h / 2, w, h });
    }
    for (const [id, label] of this.markerLabels) {
      if (!live.has(id)) {
        label.destroy();
        this.markerLabels.delete(id);
      }
    }
    this.markerHits = hits;
  }

  private hitMarkerAt(wx: number, wy: number): string | null {
    for (const h of this.markerHits) {
      if (
        wx >= h.x - h.w / 2 &&
        wx <= h.x + h.w / 2 &&
        wy >= h.y - h.h / 2 &&
        wy <= h.y + h.h / 2
      ) {
        return h.id;
      }
    }
    return null;
  }

  private renderFogOverlay(
    discoveredTiles: Record<string, Uint8Array>,
    fogActive: boolean,
  ) {
    this.fogOverlay.clear();
    if (!fogActive) return;
    for (let ry = 0; ry < MAP_H; ry++) {
      for (let rx = 0; rx < MAP_W; rx++) {
        const bitmap = discoveredTiles[regionKey(rx, ry)];
        if (bitmap && bitmapAnyDiscovered(bitmap)) continue;
        const px = rx * REGION + PADDING;
        const py = ry * REGION + PADDING;
        this.fogOverlay.fillStyle(COLORS.grid, 1);
        this.fogOverlay.fillRoundedRect(px, py, INNER, INNER, RADIUS);
      }
    }
  }

  private drawTiles() {
    this.tileLayer.clear();
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const t = biomeAt(x, y);
        const color =
          t === "water"
            ? COLORS.water
            : t === "sand"
              ? COLORS.sand
              : t === "forest"
                ? COLORS.forest
                : t === "stone"
                  ? COLORS.stone
                  : (x + y) % 2 === 0
                    ? COLORS.grass
                    : COLORS.grassAlt;
        const px = x * REGION + PADDING;
        const py = y * REGION + PADDING;
        this.tileLayer.fillStyle(color, 1);
        this.tileLayer.fillRoundedRect(px, py, INNER, INNER, RADIUS);
      }
    }
  }

  private renderFactionRings(
    regionControl: Record<string, string>,
    home: { rx: number; ry: number } | null,
    discoveredTiles: Record<string, Uint8Array>,
    fogActive: boolean,
  ) {
    this.factionRingLayer.clear();
    // Group regions by faction so each faction renders once. Skip the home
    // region (it has its own marker) so the player's tile stays uncluttered.
    const owned = new Map<string, Array<{ rx: number; ry: number }>>();
    for (const key of Object.keys(regionControl)) {
      const factionId = regionControl[key]!;
      const [sx, sy] = key.split(",");
      const rx = Number(sx);
      const ry = Number(sy);
      if (!Number.isFinite(rx) || !Number.isFinite(ry)) continue;
      if (home && home.rx === rx && home.ry === ry) continue;
      if (fogActive) {
        const bitmap = discoveredTiles[regionKey(rx, ry)];
        if (!bitmap || !bitmapAnyDiscovered(bitmap)) continue;
      }
      const arr = owned.get(factionId) ?? [];
      arr.push({ rx, ry });
      owned.set(factionId, arr);
    }
    for (const [factionId, regions] of owned) {
      const faction = FACTIONS.find((f) => f.id === factionId);
      if (!faction) continue;
      const occupied = new Set(regions.map((r) => `${r.rx},${r.ry}`));
      const isOwn = (rx: number, ry: number) => occupied.has(`${rx},${ry}`);

      // Soft underlay so the hatch reads against very light biome tiles.
      this.factionRingLayer.fillStyle(faction.color, 0.10);
      for (const r of regions) {
        const px = r.rx * REGION;
        const py = r.ry * REGION;
        this.factionRingLayer.fillRect(px, py, REGION, REGION);
      }

      // Cross-hatch fill, anchored to a global lattice so adjacent same-
      // faction regions share continuous lines (no seams at region edges).
      this.factionRingLayer.lineStyle(1, faction.color, 0.55);
      const hatchStep = 8;
      for (const r of regions) {
        this.drawHatchInRegion(r.rx, r.ry, hatchStep, +1);
        this.drawHatchInRegion(r.rx, r.ry, hatchStep, -1);
      }

      // Perimeter: only stroke an edge when the neighbouring region isn't
      // the same faction. Adjacent same-faction regions visually merge.
      this.factionRingLayer.lineStyle(2, faction.color, 0.9);
      for (const r of regions) {
        const px = r.rx * REGION;
        const py = r.ry * REGION;
        if (!isOwn(r.rx, r.ry - 1)) {
          this.factionRingLayer.beginPath();
          this.factionRingLayer.moveTo(px, py);
          this.factionRingLayer.lineTo(px + REGION, py);
          this.factionRingLayer.strokePath();
        }
        if (!isOwn(r.rx + 1, r.ry)) {
          this.factionRingLayer.beginPath();
          this.factionRingLayer.moveTo(px + REGION, py);
          this.factionRingLayer.lineTo(px + REGION, py + REGION);
          this.factionRingLayer.strokePath();
        }
        if (!isOwn(r.rx, r.ry + 1)) {
          this.factionRingLayer.beginPath();
          this.factionRingLayer.moveTo(px, py + REGION);
          this.factionRingLayer.lineTo(px + REGION, py + REGION);
          this.factionRingLayer.strokePath();
        }
        if (!isOwn(r.rx - 1, r.ry)) {
          this.factionRingLayer.beginPath();
          this.factionRingLayer.moveTo(px, py);
          this.factionRingLayer.lineTo(px, py + REGION);
          this.factionRingLayer.strokePath();
        }
      }
    }
  }

  // Draw clipped diagonal lines y = slope*x + c within one region rect.
  // c is a multiple of step so adjacent regions in the same faction share
  // the same lattice and the lines look continuous across the seam.
  private drawHatchInRegion(rx: number, ry: number, step: number, slope: 1 | -1) {
    const x0 = rx * REGION;
    const y0 = ry * REGION;
    const x1 = x0 + REGION;
    const y1 = y0 + REGION;
    // y = slope*x + c => c = y - slope*x. Range over rect corners:
    const cs = [
      y0 - slope * x0,
      y0 - slope * x1,
      y1 - slope * x0,
      y1 - slope * x1,
    ];
    const cMin = Math.ceil(Math.min(...cs) / step) * step;
    const cMax = Math.floor(Math.max(...cs) / step) * step;
    for (let c = cMin; c <= cMax; c += step) {
      // Find intersection with rect edges.
      const ys: Array<{ x: number; y: number }> = [];
      // x = x0
      const yAtX0 = slope * x0 + c;
      if (yAtX0 >= y0 && yAtX0 <= y1) ys.push({ x: x0, y: yAtX0 });
      // x = x1
      const yAtX1 = slope * x1 + c;
      if (yAtX1 >= y0 && yAtX1 <= y1) ys.push({ x: x1, y: yAtX1 });
      // y = y0
      const xAtY0 = (y0 - c) / slope;
      if (xAtY0 > x0 && xAtY0 < x1) ys.push({ x: xAtY0, y: y0 });
      // y = y1
      const xAtY1 = (y1 - c) / slope;
      if (xAtY1 > x0 && xAtY1 < x1) ys.push({ x: xAtY1, y: y1 });
      if (ys.length < 2) continue;
      const a = ys[0]!;
      const b = ys[1]!;
      this.factionRingLayer.beginPath();
      this.factionRingLayer.moveTo(a.x, a.y);
      this.factionRingLayer.lineTo(b.x, b.y);
      this.factionRingLayer.strokePath();
    }
  }

  private renderTelegraphs(
    npcs: Npc[],
    discoveredTiles: Record<string, Uint8Array>,
    fogActive: boolean,
  ) {
    this.telegraphLayer.clear();
    for (const n of npcs) {
      if (!n.intent) continue;
      if (fogActive) {
        const bitmap = discoveredTiles[regionKey(n.rx, n.ry)];
        if (!bitmap || !bitmapAnyDiscovered(bitmap)) continue;
      }
      const fromX = n.rx * REGION + REGION / 2;
      const fromY = n.ry * REGION + REGION / 2;
      const toX = n.intent.rx * REGION + REGION / 2;
      const toY = n.intent.ry * REGION + REGION / 2;
      const shape = factionShape(n.factionId);
      drawFactionShape(this.telegraphLayer, shape, n.factionColor, toX, toY, SOLO_SHAPE_SIZE - 4, {
        alpha: 0.32,
      });
      this.telegraphLayer.lineStyle(2, n.factionColor, 0.45);
      const dx = toX - fromX;
      const dy = toY - fromY;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      const margin = SOLO_SHAPE_SIZE * 0.55;
      const sx = fromX + ux * margin;
      const sy = fromY + uy * margin;
      const ex = toX - ux * margin;
      const ey = toY - uy * margin;
      const segLen = 6;
      const gapLen = 5;
      let cur = 0;
      const total = Math.hypot(ex - sx, ey - sy);
      while (cur < total) {
        const a = Math.min(cur + segLen, total);
        const x1 = sx + ux * cur;
        const y1 = sy + uy * cur;
        const x2 = sx + ux * a;
        const y2 = sy + uy * a;
        this.telegraphLayer.beginPath();
        this.telegraphLayer.moveTo(x1, y1);
        this.telegraphLayer.lineTo(x2, y2);
        this.telegraphLayer.strokePath();
        cur = a + gapLen;
      }
    }
  }

  // Buckets NPCs by region tile then renders up to 4 nested faction shapes
  // per tile, with a "+N" overflow label when more occupy a single region.
  // Hit targets are stored as plain objects in npcHits[] -- no per-NPC
  // game object, so 200 NPCs cost ~200 number triples instead of 200 Phaser
  // Rectangles + transforms.
  private renderNpcs(
    npcs: Npc[],
    discoveredTiles: Record<string, Uint8Array>,
    fogActive: boolean,
  ) {
    const buckets = new Map<string, Npc[]>();
    for (const npc of npcs) {
      if (fogActive) {
        const bitmap = discoveredTiles[regionKey(npc.rx, npc.ry)];
        if (!bitmap || !bitmapAnyDiscovered(bitmap)) continue;
      }
      const key = `${npc.rx},${npc.ry}`;
      const list = buckets.get(key);
      if (list) list.push(npc);
      else buckets.set(key, [npc]);
    }

    this.npcLayer.clear();
    const hits: NpcHitTarget[] = [];
    const liveLabelKeys = new Set<string>();

    for (const [, list] of buckets) {
      const head = list[0]!;
      const cx = head.rx * REGION + REGION / 2;
      const cy = head.ry * REGION + REGION / 2;
      liveLabelKeys.add(`${head.rx},${head.ry}`);

      if (list.length === 1) {
        this.npcLayer.fillStyle(COLORS.shadow, 0.18);
        this.npcLayer.fillCircle(cx, cy + 2, SOLO_SHAPE_SIZE / 2);
        const shape = factionShape(head.factionId);
        drawFactionShape(this.npcLayer, shape, head.factionColor, cx, cy, SOLO_SHAPE_SIZE, {
          stroke: 2,
          strokeColor: COLORS.outline,
        });
        hits.push({ id: head.id, x: cx, y: cy, half: SOLO_SHAPE_SIZE / 2 + 6 });
        continue;
      }

      const visible = list.slice(0, 4);
      const offsets = [
        { dx: -SOLO_SHAPE_SIZE * 0.32, dy: -SOLO_SHAPE_SIZE * 0.32 },
        { dx: SOLO_SHAPE_SIZE * 0.32, dy: -SOLO_SHAPE_SIZE * 0.32 },
        { dx: -SOLO_SHAPE_SIZE * 0.32, dy: SOLO_SHAPE_SIZE * 0.32 },
        { dx: SOLO_SHAPE_SIZE * 0.32, dy: SOLO_SHAPE_SIZE * 0.32 },
      ];
      visible.forEach((npc, i) => {
        const off = offsets[i]!;
        const x = cx + off.dx;
        const y = cy + off.dy;
        const shape = factionShape(npc.factionId);
        this.npcLayer.fillStyle(COLORS.shadow, 0.16);
        this.npcLayer.fillCircle(x, y + 1.5, STACK_SHAPE_SIZE / 2);
        drawFactionShape(this.npcLayer, shape, npc.factionColor, x, y, STACK_SHAPE_SIZE, {
          stroke: 1.2,
          strokeColor: COLORS.outline,
        });
        hits.push({ id: npc.id, x, y, half: STACK_SHAPE_SIZE / 2 + 4 });
      });

      const overflow = list.length - visible.length;
      const labelKey = `${head.rx},${head.ry}`;
      if (overflow > 0) {
        let label = this.overflowText.get(labelKey);
        const txt = `+${overflow}`;
        if (!label) {
          label = this.add.text(0, 0, txt, {
            fontFamily: "ui-monospace, monospace",
            fontSize: "10px",
            color: "#7a7368",
          });
          label.setOrigin(1, 1);
          this.overflowText.set(labelKey, label);
        }
        label.setText(txt);
        label.setPosition(
          head.rx * REGION + REGION - PADDING - 4,
          head.ry * REGION + REGION - PADDING - 4,
        );
      } else {
        const label = this.overflowText.get(labelKey);
        if (label) {
          label.destroy();
          this.overflowText.delete(labelKey);
        }
      }
    }

    for (const [key, label] of this.overflowText) {
      if (!liveLabelKeys.has(key)) {
        label.destroy();
        this.overflowText.delete(key);
      }
    }

    this.npcHits = hits;
  }

  private renderHomeMarker() {
    const home = useGameStore.getState().world?.home;
    this.homeMarker.clear();
    if (!home) {
      this.homeMarker.setVisible(false);
      return;
    }
    const px = home.rx * REGION + PADDING;
    const py = home.ry * REGION + PADDING;
    this.homeMarker.lineStyle(3, COLORS.selection, 0.85);
    this.homeMarker.strokeRoundedRect(px, py, INNER, INNER, RADIUS);
    const cx = home.rx * REGION + REGION / 2;
    const cy = home.ry * REGION + REGION / 2;
    this.homeMarker.fillStyle(COLORS.selection, 0.9);
    this.homeMarker.fillTriangle(
      cx,
      cy - HOME_GLYPH_SIZE * 0.7,
      cx - HOME_GLYPH_SIZE * 0.7,
      cy,
      cx + HOME_GLYPH_SIZE * 0.7,
      cy,
    );
    this.homeMarker.fillRect(
      cx - HOME_GLYPH_SIZE * 0.5,
      cy - HOME_GLYPH_SIZE * 0.05,
      HOME_GLYPH_SIZE,
      HOME_GLYPH_SIZE * 0.55,
    );
    this.homeMarker.setVisible(true);
  }

  private renderPlayerHere() {
    const player = useGameStore.getState().world?.life?.player;
    this.playerHere.clear();
    if (!player) {
      this.playerHere.setVisible(false);
      this.playerLabel.setVisible(false);
      return;
    }
    const { rx, ry } = globalToLocal(player.gx, player.gy);
    const cx = rx * REGION + REGION / 2;
    const cy = ry * REGION + REGION / 2;

    // Track region transitions so we can draw a fading breadcrumb trail.
    if (
      !this.lastPlayerRegion ||
      this.lastPlayerRegion.rx !== rx ||
      this.lastPlayerRegion.ry !== ry
    ) {
      if (this.lastPlayerRegion) {
        this.playerTrail.push(this.lastPlayerRegion);
        if (this.playerTrail.length > this.playerTrailMax) {
          this.playerTrail.shift();
        }
      }
      this.lastPlayerRegion = { rx, ry };
    }

    // Trail of recent regions: line from each to the next, plus a dot at
    // each. Fades from the oldest (most transparent) to the newest.
    const trailWithCurrent = [...this.playerTrail, { rx, ry }];
    for (let i = 0; i < trailWithCurrent.length - 1; i++) {
      const a = trailWithCurrent[i]!;
      const b = trailWithCurrent[i + 1]!;
      const ax = a.rx * REGION + REGION / 2;
      const ay = a.ry * REGION + REGION / 2;
      const bx = b.rx * REGION + REGION / 2;
      const by = b.ry * REGION + REGION / 2;
      const alpha = 0.15 + (i / Math.max(1, trailWithCurrent.length - 1)) * 0.4;
      this.playerHere.lineStyle(3, COLORS.selection, alpha);
      this.playerHere.beginPath();
      this.playerHere.moveTo(ax, ay);
      this.playerHere.lineTo(bx, by);
      this.playerHere.strokePath();
    }
    this.playerTrail.forEach((r, i) => {
      const px = r.rx * REGION + REGION / 2;
      const py = r.ry * REGION + REGION / 2;
      const alpha = 0.18 + (i / this.playerTrailMax) * 0.4;
      this.playerHere.fillStyle(COLORS.selection, alpha);
      this.playerHere.fillCircle(px, py, 5);
    });

    // Forward indicator: thin line from the player to the destination
    // region of the current walk so the user can see where they're going
    // without needing to enter the biome view.
    if (player.route && player.route.length > 0) {
      const last = player.route[player.route.length - 1]!;
      const dst = globalToLocal(last.gx, last.gy);
      if (dst.rx !== rx || dst.ry !== ry) {
        const dx = dst.rx * REGION + REGION / 2;
        const dy = dst.ry * REGION + REGION / 2;
        const t = this.time.now * 0.004;
        const pulse = 0.5 + 0.5 * Math.sin(t);
        this.playerHere.lineStyle(2, COLORS.selection, 0.3 + 0.25 * pulse);
        this.playerHere.beginPath();
        this.playerHere.moveTo(cx, cy);
        this.playerHere.lineTo(dx, dy);
        this.playerHere.strokePath();
        this.playerHere.fillStyle(COLORS.selection, 0.4 + 0.3 * pulse);
        this.playerHere.fillCircle(dx, dy, 5);
      }
    }

    // Pulsing accent halo so the player's region is unmissable on a
    // map of 200 NPCs. Two concentric rings, ~1.5s pulse cycle.
    const t = this.time.now * 0.003;
    const pulse = (Math.sin(t) + 1) / 2;
    const haloRadius = 18 + pulse * 10;
    const haloAlpha = 0.5 - pulse * 0.3;
    this.playerHere.lineStyle(3, COLORS.selection, haloAlpha);
    this.playerHere.strokeCircle(cx, cy, haloRadius);
    this.playerHere.lineStyle(2, COLORS.selection, haloAlpha * 0.7);
    this.playerHere.strokeCircle(cx, cy, haloRadius + 6);

    // Player square -- bigger than NPC tokens so it pops at any zoom.
    const playerSize = 24;
    this.playerHere.fillStyle(COLORS.shadow, 0.22);
    this.playerHere.fillRoundedRect(
      cx - playerSize / 2,
      cy - playerSize / 2 + 2,
      playerSize,
      playerSize,
      5,
    );
    const factionColor =
      FACTIONS.find((f) => f.id === player.factionOfOriginId)?.color ?? COLORS.player;
    drawFactionShape(this.playerHere, "square", factionColor, cx, cy, playerSize, {
      stroke: 2,
      strokeColor: COLORS.outline,
    });
    this.playerHere.setVisible(true);

    this.playerLabel.setText(player.name);
    this.playerLabel.setPosition(cx, cy + playerSize / 2 + 2);
    this.playerLabel.setVisible(true);
  }

  private renderSelection() {
    const { selectedNpcId, selectedRegion } = useGameStore.getState();
    this.selectionRing.clear();

    if (selectedNpcId) {
      const hit = this.npcHits.find((h) => h.id === selectedNpcId);
      if (hit) {
        const half = hit.half + 2;
        this.selectionRing.lineStyle(2.5, COLORS.selection, 1);
        this.selectionRing.strokeRoundedRect(hit.x - half, hit.y - half, half * 2, half * 2, 6);
        this.selectionRing.setVisible(true);
        return;
      }
    }

    if (selectedRegion) {
      const px = selectedRegion.rx * REGION + PADDING;
      const py = selectedRegion.ry * REGION + PADDING;
      this.selectionRing.lineStyle(3, COLORS.selection, 1);
      this.selectionRing.strokeRoundedRect(px, py, INNER, INNER, RADIUS);
      this.selectionRing.setVisible(true);
      return;
    }

    this.selectionRing.setVisible(false);
  }

  private clearSelection = () => {
    this.selectionRing.setVisible(false);
  };

  private gameOver(): boolean {
    return useGameStore.getState().world?.life?.gameOver ?? false;
  }

  private onPointerDown(pointer: Phaser.Input.Pointer) {
    if (this.gameOver()) return;
    this.cancelLongPress();
    if (this.input.pointer1.isDown && this.input.pointer2.isDown) {
      const dist = Phaser.Math.Distance.Between(
        this.input.pointer1.x,
        this.input.pointer1.y,
        this.input.pointer2.x,
        this.input.pointer2.y,
      );
      this.pinchInitial = { dist, zoom: this.cameras.main.zoom };
      this.dragStart = null;
      return;
    }
    this.dragStart = { x: pointer.x, y: pointer.y };
    this.dragMoved = false;
    this.pointerDownAt = this.time.now;
    this.pointerDownPos = { x: pointer.x, y: pointer.y };
    this.longPressFired = false;
    const startX = pointer.x;
    const startY = pointer.y;
    this.longPressTimer = this.time.delayedCall(500, () => {
      this.longPressTimer = null;
      if (this.dragMoved) return;
      const wp = this.cameras.main.getWorldPoint(startX, startY);
      const rx = Math.floor(wp.x / REGION);
      const ry = Math.floor(wp.y / REGION);
      if (rx < 0 || ry < 0 || rx >= MAP_W || ry >= MAP_H) return;
      useGameStore.getState().requestMarker(rx, ry);
      this.longPressFired = true;
    });
  }

  private cancelLongPress() {
    if (this.longPressTimer) {
      this.longPressTimer.remove(false);
      this.longPressTimer = null;
    }
  }

  private onPointerMove(pointer: Phaser.Input.Pointer) {
    if (this.gameOver()) return;
    if (this.input.pointer1.isDown && this.input.pointer2.isDown && this.pinchInitial) {
      const dist = Phaser.Math.Distance.Between(
        this.input.pointer1.x,
        this.input.pointer1.y,
        this.input.pointer2.x,
        this.input.pointer2.y,
      );
      const factor = dist / this.pinchInitial.dist;
      const zoom = Phaser.Math.Clamp(this.pinchInitial.zoom * factor, 0.25 * this.dpr, 2.0 * this.dpr);
      this.cameras.main.setZoom(zoom);
      return;
    }
    if (this.dragStart && pointer.isDown) {
      const dx = pointer.x - this.dragStart.x;
      const dy = pointer.y - this.dragStart.y;
      if (Math.abs(dx) + Math.abs(dy) > 6) {
        this.dragMoved = true;
        this.cancelLongPress();
      }
      this.cameras.main.scrollX -= dx / this.cameras.main.zoom;
      this.cameras.main.scrollY -= dy / this.cameras.main.zoom;
      this.dragStart = { x: pointer.x, y: pointer.y };
    }
  }

  private onPointerUp(pointer: Phaser.Input.Pointer) {
    if (this.gameOver()) {
      this.cancelLongPress();
      this.dragStart = null;
      this.dragMoved = false;
      this.longPressFired = false;
      this.pinchInitial = null;
      return;
    }

    const moved = Phaser.Math.Distance.Between(
      this.pointerDownPos.x,
      this.pointerDownPos.y,
      pointer.x,
      pointer.y,
    );

    if (!this.dragMoved && !this.longPressFired && moved < 10) {
      const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      const tappedNpc = this.hitNpcAt(world.x, world.y);
      const tappedMarker = this.hitMarkerAt(world.x, world.y);
      if (tappedMarker) {
        useGameStore.getState().removeMapMarker(tappedMarker);
      } else if (tappedNpc) {
        useGameStore.getState().selectNpc(tappedNpc);
        bus.emit("npc:selected", { id: tappedNpc });
      } else {
        const rx = Math.floor(world.x / REGION);
        const ry = Math.floor(world.y / REGION);
        if (rx >= 0 && rx < MAP_W && ry >= 0 && ry < MAP_H) {
          useGameStore.getState().selectRegion({ rx, ry });
        } else {
          useGameStore.getState().selectNpc(null);
          useGameStore.getState().selectRegion(null);
        }
      }
    }

    this.cancelLongPress();
    this.dragStart = null;
    this.dragMoved = false;
    this.longPressFired = false;
    this.pinchInitial = null;
  }

  private hitNpcAt(wx: number, wy: number): string | null {
    let best: { id: string; d2: number } | null = null;
    for (const h of this.npcHits) {
      const dx = wx - h.x;
      const dy = wy - h.y;
      const d2 = dx * dx + dy * dy;
      const r2 = h.half * h.half;
      if (d2 > r2) continue;
      if (best === null || d2 < best.d2) best = { id: h.id, d2 };
    }
    return best ? best.id : null;
  }

  private onWheel(_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) {
    const zoom = Phaser.Math.Clamp(this.cameras.main.zoom - dy * 0.001, 0.25 * this.dpr, 2.0 * this.dpr);
    this.cameras.main.setZoom(zoom);
  }

  private handleResize = (gameSize: Phaser.Structs.Size) => {
    this.cameras.main.setSize(gameSize.width, gameSize.height);
  };

  private onDprChange = (dpr: number) => {
    const ratio = dpr / this.dpr;
    if (!Number.isFinite(ratio) || ratio === 0) return;
    this.dpr = dpr;
    this.cameras.main.setZoom(this.cameras.main.zoom * ratio);
  };
}

function factionShape(factionId: string): "triangle" | "hex" | "diamond" | "square" {
  const f = FACTIONS.find((x) => x.id === factionId);
  return f?.shape ?? "diamond";
}
