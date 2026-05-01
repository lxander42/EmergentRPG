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
  npcStroke: 0xfbf6ed,
  shadow: 0x2c2820,
  selection: 0xd96846,
  player: 0xd96846,
};

export class WorldScene extends Phaser.Scene {
  private tileLayer!: Phaser.GameObjects.Graphics;
  private selectionRing!: Phaser.GameObjects.Graphics;
  private homeMarker!: Phaser.GameObjects.Graphics;
  private playerHere!: Phaser.GameObjects.Graphics;
  private npcLayer!: Phaser.GameObjects.Graphics;
  private overflowText = new Map<string, Phaser.GameObjects.Text>();
  private npcHits = new Map<string, Phaser.GameObjects.Rectangle>();

  private dragStart: { x: number; y: number } | null = null;
  private pinchInitial: { dist: number; zoom: number } | null = null;
  private pointerDownAt = 0;
  private pointerDownPos = { x: 0, y: 0 };
  private dragMoved = false;
  private tappedNpcId: string | null = null;

  private accumulator = 0;
  private readonly tickStepMs = 250;

  constructor() {
    super("World");
  }

  create() {
    this.cameras.main.setBackgroundColor(COLORS.bg);
    this.tileLayer = this.add.graphics();
    this.drawTiles();

    this.npcLayer = this.add.graphics();
    this.homeMarker = this.add.graphics();
    this.homeMarker.setVisible(false);
    this.playerHere = this.add.graphics();
    this.playerHere.setVisible(false);
    this.selectionRing = this.add.graphics();
    this.selectionRing.setVisible(false);

    const worldPx = MAP_W * REGION;
    this.cameras.main.setBounds(-200, -200, worldPx + 400, worldPx + 400);
    this.cameras.main.centerOn(worldPx / 2, worldPx / 2);
    this.cameras.main.setZoom(0.45);

    this.input.addPointer(2);
    this.input.on("pointerdown", this.onPointerDown, this);
    this.input.on("pointermove", this.onPointerMove, this);
    this.input.on("pointerup", this.onPointerUp, this);
    this.input.on("wheel", this.onWheel, this);

    bus.on("npc:deselected", this.clearSelection);
    this.scale.on("resize", this.handleResize, this);
  }

  shutdown() {
    bus.off("npc:deselected", this.clearSelection);
    this.scale.off("resize", this.handleResize, this);
    for (const t of this.overflowText.values()) t.destroy();
    this.overflowText.clear();
    for (const r of this.npcHits.values()) r.destroy();
    this.npcHits.clear();
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

    this.renderNpcs();
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

  // Buckets NPCs by region tile then renders up to 4 nested faction shapes
  // per tile, with a "+N" overflow label when more occupy a single region.
  private renderNpcs() {
    const world = useGameStore.getState().world;
    if (!world) return;

    const buckets = new Map<string, Npc[]>();
    for (const npc of world.npcs) {
      const key = `${npc.rx},${npc.ry}`;
      const list = buckets.get(key);
      if (list) list.push(npc);
      else buckets.set(key, [npc]);
    }

    this.npcLayer.clear();
    const seenHits = new Set<string>();

    for (const [, list] of buckets) {
      const head = list[0]!;
      const cx = head.rx * REGION + REGION / 2;
      const cy = head.ry * REGION + REGION / 2;

      if (list.length === 1) {
        this.npcLayer.fillStyle(COLORS.shadow, 0.18);
        this.npcLayer.fillCircle(cx, cy + 2, SOLO_SHAPE_SIZE / 2);
        const shape = factionShape(head.factionId);
        drawFactionShape(this.npcLayer, shape, head.factionColor, cx, cy, SOLO_SHAPE_SIZE, {
          stroke: 2,
          strokeColor: COLORS.npcStroke,
        });
        seenHits.add(head.id);
        this.upsertHit(head.id, cx, cy, SOLO_SHAPE_SIZE + 12);
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
          strokeColor: COLORS.npcStroke,
        });
        seenHits.add(npc.id);
        this.upsertHit(npc.id, x, y, STACK_SHAPE_SIZE + 8);
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
        label.setPosition(head.rx * REGION + REGION - PADDING - 4, head.ry * REGION + REGION - PADDING - 4);
      } else {
        const label = this.overflowText.get(labelKey);
        if (label) {
          label.destroy();
          this.overflowText.delete(labelKey);
        }
      }
    }

    // Tear down rect overflow labels for tiles that no longer have NPCs.
    const liveLabelKeys = new Set<string>();
    for (const [, list] of buckets) {
      const head = list[0]!;
      liveLabelKeys.add(`${head.rx},${head.ry}`);
    }
    for (const [key, label] of this.overflowText) {
      if (!liveLabelKeys.has(key)) {
        label.destroy();
        this.overflowText.delete(key);
      }
    }

    // Tear down any hits for NPCs that vanished.
    for (const [id, hit] of this.npcHits) {
      if (!seenHits.has(id)) {
        hit.destroy();
        this.npcHits.delete(id);
      }
    }
  }

  private upsertHit(id: string, cx: number, cy: number, size: number) {
    let hit = this.npcHits.get(id);
    if (!hit) {
      hit = this.add.rectangle(cx, cy, size, size, 0xffffff, 0);
      hit.setInteractive({ useHandCursor: true });
      hit.on(
        "pointerdown",
        (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
          e.stopPropagation();
          this.tappedNpcId = id;
          useGameStore.getState().selectNpc(id);
          bus.emit("npc:selected", { id });
        },
      );
      this.npcHits.set(id, hit);
    } else {
      hit.x = cx;
      hit.y = cy;
      hit.setSize(size, size);
    }
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
      strokeColor: COLORS.npcStroke,
    });
    this.playerHere.setVisible(true);
  }

  private renderSelection() {
    const { selectedNpcId, selectedRegion } = useGameStore.getState();
    this.selectionRing.clear();

    if (selectedNpcId) {
      const hit = this.npcHits.get(selectedNpcId);
      if (hit) {
        const half = (hit.width as number) / 2 + 2;
        this.selectionRing.lineStyle(2.5, COLORS.selection, 1);
        this.selectionRing.strokeRoundedRect(
          (hit.x as number) - half,
          (hit.y as number) - half,
          half * 2,
          half * 2,
          6,
        );
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

  private onPointerDown(pointer: Phaser.Input.Pointer) {
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
    if (this.input.pointer1.isDown && this.input.pointer2.isDown && this.pinchInitial) {
      const dist = Phaser.Math.Distance.Between(
        this.input.pointer1.x,
        this.input.pointer1.y,
        this.input.pointer2.x,
        this.input.pointer2.y,
      );
      const factor = dist / this.pinchInitial.dist;
      const zoom = Phaser.Math.Clamp(this.pinchInitial.zoom * factor, 0.25, 2.0);
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
    const wasNpcTap = this.tappedNpcId !== null;
    this.tappedNpcId = null;

    const dt = this.time.now - this.pointerDownAt;
    const moved = Phaser.Math.Distance.Between(
      this.pointerDownPos.x,
      this.pointerDownPos.y,
      pointer.x,
      pointer.y,
    );

    if (!wasNpcTap && !this.dragMoved && dt < 350 && moved < 10) {
      const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      const rx = Math.floor(world.x / REGION);
      const ry = Math.floor(world.y / REGION);
      if (rx >= 0 && rx < MAP_W && ry >= 0 && ry < MAP_H) {
        useGameStore.getState().selectRegion({ rx, ry });
      } else {
        useGameStore.getState().selectNpc(null);
        useGameStore.getState().selectRegion(null);
      }
    }

    this.dragStart = null;
    this.dragMoved = false;
    this.pinchInitial = null;
  }

  private onWheel(_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) {
    const zoom = Phaser.Math.Clamp(this.cameras.main.zoom - dy * 0.001, 0.25, 2.0);
    this.cameras.main.setZoom(zoom);
  }

  private handleResize = (gameSize: Phaser.Structs.Size) => {
    this.cameras.main.setSize(gameSize.width, gameSize.height);
  };
}

function factionShape(factionId: string): "triangle" | "hex" | "diamond" | "square" {
  const f = FACTIONS.find((x) => x.id === factionId);
  return f?.shape ?? "diamond";
}
