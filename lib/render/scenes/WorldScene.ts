import Phaser from "phaser";
import { bus } from "@/lib/render/bus";
import { useGameStore } from "@/lib/state/game-store";
import { biomeAt } from "@/lib/sim/biome";
import { MAP_W, MAP_H } from "@/lib/sim/world";

// One region cell = REGION px on a side. PADDING is the bezel between
// neighbouring region tiles -- the cream background shows through.
const REGION = 96;
const PADDING = 8;
const RADIUS = 12;
const INNER = REGION - PADDING * 2;

const NPC_SIZE = 26;
const NPC_RADIUS = 6;
const MOVE_DURATION_MS = 750; // how long the visual transition between regions takes

const COLORS = {
  bg: 0xf6f1e8,
  grass: 0xcfd9aa,
  grassAlt: 0xd8e2b3,
  forest: 0x8fa873,
  water: 0xa8c8d8,
  sand: 0xe8d8b0,
  stone: 0xb8b0a0,
  npcStroke: 0xfbf6ed,
  npcShadow: 0x2c2820,
  selection: 0xd96846,
};

type NpcView = {
  shadow: Phaser.GameObjects.Graphics;
  body: Phaser.GameObjects.Graphics;
  trail: Phaser.GameObjects.Graphics;
  hit: Phaser.GameObjects.Rectangle;
  prevRx: number;
  prevRy: number;
  rx: number;
  ry: number;
  transitionStart: number; // 0 when idle
};

export class WorldScene extends Phaser.Scene {
  private tileLayer!: Phaser.GameObjects.Graphics;
  private selectionRing!: Phaser.GameObjects.Graphics;
  private npcLayer!: Phaser.GameObjects.Container;
  private npcViews = new Map<string, NpcView>();

  private dragStart: { x: number; y: number } | null = null;
  private pinchInitial: { dist: number; zoom: number } | null = null;
  private pointerDownAt = 0;
  private pointerDownPos = { x: 0, y: 0 };

  private accumulator = 0;
  private readonly tickStepMs = 250;

  constructor() {
    super("World");
  }

  create() {
    this.cameras.main.setBackgroundColor(COLORS.bg);

    this.tileLayer = this.add.graphics();
    this.drawTiles();

    this.npcLayer = this.add.container(0, 0);
    this.selectionRing = this.add.graphics();
    this.selectionRing.setVisible(false);

    const worldPx = MAP_W * REGION;
    this.cameras.main.setBounds(-200, -200, worldPx + 400, worldPx + 400);
    this.cameras.main.centerOn(worldPx / 2, worldPx / 2);
    this.cameras.main.setZoom(0.7);

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
    for (const view of this.npcViews.values()) view.body.destroy();
    this.npcViews.clear();
  }

  update(_time: number, delta: number) {
    const store = useGameStore.getState();
    if (!store.paused) {
      this.accumulator += delta * store.speed;
      while (this.accumulator >= this.tickStepMs) {
        this.accumulator -= this.tickStepMs;
        store.tick();
        bus.emit("world:tick", { ticks: useGameStore.getState().world?.ticks ?? 0 });
      }
    }

    this.renderNpcs();
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

  private renderNpcs() {
    const world = useGameStore.getState().world;
    if (!world) return;
    const npcs = world.npcs;
    const now = this.time.now;

    const seen = new Set<string>();

    for (const npc of npcs) {
      seen.add(npc.id);
      let view = this.npcViews.get(npc.id);

      if (!view) {
        view = this.createNpcView(npc.id, npc.factionColor, npc.rx, npc.ry);
        this.npcViews.set(npc.id, view);
      }

      // Detect a region change -- start a fresh transition.
      if (npc.rx !== view.rx || npc.ry !== view.ry) {
        view.prevRx = view.rx;
        view.prevRy = view.ry;
        view.rx = npc.rx;
        view.ry = npc.ry;
        view.transitionStart = now;
      }

      const t = view.transitionStart === 0 ? 1 : Math.min(1, (now - view.transitionStart) / MOVE_DURATION_MS);
      const eased = easeOutCubic(t);

      const fromX = view.prevRx * REGION + REGION / 2;
      const fromY = view.prevRy * REGION + REGION / 2;
      const toX = view.rx * REGION + REGION / 2;
      const toY = view.ry * REGION + REGION / 2;
      const cx = fromX + (toX - fromX) * eased;
      const cy = fromY + (toY - fromY) * eased;

      view.shadow.x = cx;
      view.shadow.y = cy + 2;
      view.body.x = cx;
      view.body.y = cy;
      view.hit.x = cx;
      view.hit.y = cy;

      // Trail: thin coloured line from the previous region centre to the
      // current sprite position. Visible only mid-transition.
      view.trail.clear();
      if (t < 1) {
        const trailAlpha = 0.55 * (1 - t * 0.5);
        view.trail.lineStyle(3, npc.factionColor, trailAlpha);
        view.trail.beginPath();
        view.trail.moveTo(fromX, fromY);
        view.trail.lineTo(cx, cy);
        view.trail.strokePath();
      } else if (view.transitionStart !== 0) {
        // Transition just finished -- stop redrawing the trail next frame.
        view.transitionStart = 0;
      }
    }

    // Drop views for NPCs that disappeared (e.g., after starting a new game).
    for (const [id, view] of this.npcViews) {
      if (!seen.has(id)) {
        view.shadow.destroy();
        view.body.destroy();
        view.trail.destroy();
        view.hit.destroy();
        this.npcViews.delete(id);
      }
    }

    // Selection ring follows the currently selected NPC's interpolated position.
    const selectedId = useGameStore.getState().selectedNpcId;
    if (selectedId) {
      const v = this.npcViews.get(selectedId);
      if (v) this.drawSelection(v.body.x, v.body.y);
      else this.selectionRing.setVisible(false);
    } else {
      this.selectionRing.setVisible(false);
    }
  }

  private createNpcView(id: string, color: number, rx: number, ry: number): NpcView {
    const cx = rx * REGION + REGION / 2;
    const cy = ry * REGION + REGION / 2;

    const trail = this.add.graphics();

    const shadow = this.add.graphics();
    shadow.fillStyle(COLORS.npcShadow, 0.18);
    shadow.fillRoundedRect(-NPC_SIZE / 2, -NPC_SIZE / 2, NPC_SIZE, NPC_SIZE, NPC_RADIUS);
    shadow.x = cx;
    shadow.y = cy + 2;

    const body = this.add.graphics();
    body.fillStyle(color, 1);
    body.fillRoundedRect(-NPC_SIZE / 2, -NPC_SIZE / 2, NPC_SIZE, NPC_SIZE, NPC_RADIUS);
    body.lineStyle(2, COLORS.npcStroke, 1);
    body.strokeRoundedRect(-NPC_SIZE / 2, -NPC_SIZE / 2, NPC_SIZE, NPC_SIZE, NPC_RADIUS);
    body.x = cx;
    body.y = cy;

    // Invisible rect handles input -- bigger than the visual for easier tapping.
    const hit = this.add.rectangle(cx, cy, NPC_SIZE + 16, NPC_SIZE + 16, 0xffffff, 0);
    hit.setInteractive({ useHandCursor: true });
    hit.on(
      "pointerdown",
      (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
        e.stopPropagation();
        useGameStore.getState().selectNpc(id);
        bus.emit("npc:selected", { id });
      },
    );

    this.npcLayer.add([trail, shadow, body, hit]);

    return {
      shadow,
      body,
      trail,
      hit,
      prevRx: rx,
      prevRy: ry,
      rx,
      ry,
      transitionStart: 0,
    };
  }

  private drawSelection(x: number, y: number) {
    const half = NPC_SIZE / 2 + 5;
    this.selectionRing.clear();
    this.selectionRing.lineStyle(2.5, COLORS.selection, 1);
    this.selectionRing.strokeRoundedRect(x - half, y - half, half * 2, half * 2, NPC_RADIUS + 2);
    this.selectionRing.setVisible(true);
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
      const zoom = Phaser.Math.Clamp(this.pinchInitial.zoom * factor, 0.4, 2.5);
      this.cameras.main.setZoom(zoom);
      return;
    }
    if (this.dragStart && pointer.isDown) {
      const dx = pointer.x - this.dragStart.x;
      const dy = pointer.y - this.dragStart.y;
      this.cameras.main.scrollX -= dx / this.cameras.main.zoom;
      this.cameras.main.scrollY -= dy / this.cameras.main.zoom;
      this.dragStart = { x: pointer.x, y: pointer.y };
    }
  }

  private onPointerUp(pointer: Phaser.Input.Pointer) {
    const dt = this.time.now - this.pointerDownAt;
    const moved = Phaser.Math.Distance.Between(
      this.pointerDownPos.x,
      this.pointerDownPos.y,
      pointer.x,
      pointer.y,
    );
    // A tap on empty map (no NPC stopped propagation) deselects.
    if (dt < 250 && moved < 8 && useGameStore.getState().selectedNpcId) {
      useGameStore.getState().selectNpc(null);
    }
    this.dragStart = null;
    this.pinchInitial = null;
  }

  private onWheel(_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) {
    const zoom = Phaser.Math.Clamp(this.cameras.main.zoom - dy * 0.001, 0.4, 2.5);
    this.cameras.main.setZoom(zoom);
  }

  private handleResize = (gameSize: Phaser.Structs.Size) => {
    this.cameras.main.setSize(gameSize.width, gameSize.height);
  };
}

function easeOutCubic(t: number): number {
  const u = 1 - t;
  return 1 - u * u * u;
}
