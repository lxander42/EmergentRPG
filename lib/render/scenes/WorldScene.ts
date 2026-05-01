import Phaser from "phaser";
import { bus } from "@/lib/render/bus";
import { useGameStore } from "@/lib/state/game-store";
import { biomeAt } from "@/lib/sim/biome";
import { MAP_W, MAP_H } from "@/lib/sim/world";
import { FACTIONS } from "@/content/factions";
import { drawFactionShape } from "@/lib/render/shapes";
import { globalToLocal } from "@/lib/sim/biome-interior";
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
  private telegraphLayer!: Phaser.GameObjects.Graphics;
  private selectionRing!: Phaser.GameObjects.Graphics;
  private homeMarker!: Phaser.GameObjects.Graphics;
  private playerHere!: Phaser.GameObjects.Graphics;
  private npcLayer!: Phaser.GameObjects.Graphics;
  private overflowText = new Map<string, Phaser.GameObjects.Text>();
  private npcHits: NpcHitTarget[] = [];

  private dragStart: { x: number; y: number } | null = null;
  private pinchInitial: { dist: number; zoom: number } | null = null;
  private pointerDownAt = 0;
  private pointerDownPos = { x: 0, y: 0 };
  private dragMoved = false;

  private accumulator = 0;
  private readonly tickStepMs = 250;
  private lastDrawnTick = -1;
  private dpr = 1;

  constructor() {
    super("World");
  }

  create() {
    this.dpr = (this.game.registry.get("dpr") as number) ?? 1;
    this.cameras.main.setBackgroundColor(COLORS.bg);
    this.tileLayer = this.add.graphics();
    this.drawTiles();

    this.telegraphLayer = this.add.graphics();
    this.npcLayer = this.add.graphics();
    this.homeMarker = this.add.graphics();
    this.homeMarker.setVisible(false);
    this.playerHere = this.add.graphics();
    this.playerHere.setVisible(false);
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
    this.npcHits = [];
  }

  update(_time: number, delta: number) {
    const store = useGameStore.getState();
    if (store.view === "biome") {
      this.scene.start("Biome");
      return;
    }
    if (!store.paused && !store.world?.gameOver) {
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
      this.renderNpcs(world.npcs);
      this.renderTelegraphs(world.npcs);
      this.lastDrawnTick = world.ticks;
    }
    this.renderHomeMarker();
    this.renderPlayerHere();
    this.renderSelection();
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

  private renderTelegraphs(npcs: Npc[]) {
    this.telegraphLayer.clear();
    for (const n of npcs) {
      if (!n.intent) continue;
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
  private renderNpcs(npcs: Npc[]) {
    const buckets = new Map<string, Npc[]>();
    for (const npc of npcs) {
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
    const player = useGameStore.getState().world?.player;
    this.playerHere.clear();
    if (!player) {
      this.playerHere.setVisible(false);
      return;
    }
    const { rx, ry } = globalToLocal(player.gx, player.gy);
    const cx = rx * REGION + REGION / 2;
    const cy = ry * REGION + REGION / 2;
    drawFactionShape(this.playerHere, "square", COLORS.player, cx, cy, 18, {
      stroke: 2,
      strokeColor: COLORS.outline,
    });
    this.playerHere.setVisible(true);
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
    return useGameStore.getState().world?.gameOver ?? false;
  }

  private onPointerDown(pointer: Phaser.Input.Pointer) {
    if (this.gameOver()) return;
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
      if (Math.abs(dx) + Math.abs(dy) > 6) this.dragMoved = true;
      this.cameras.main.scrollX -= dx / this.cameras.main.zoom;
      this.cameras.main.scrollY -= dy / this.cameras.main.zoom;
      this.dragStart = { x: pointer.x, y: pointer.y };
    }
  }

  private onPointerUp(pointer: Phaser.Input.Pointer) {
    if (this.gameOver()) {
      this.dragStart = null;
      this.dragMoved = false;
      this.pinchInitial = null;
      return;
    }

    const dt = this.time.now - this.pointerDownAt;
    const moved = Phaser.Math.Distance.Between(
      this.pointerDownPos.x,
      this.pointerDownPos.y,
      pointer.x,
      pointer.y,
    );

    if (!this.dragMoved && dt < 350 && moved < 10) {
      const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      const tappedNpc = this.hitNpcAt(world.x, world.y);
      if (tappedNpc) {
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

    this.dragStart = null;
    this.dragMoved = false;
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
