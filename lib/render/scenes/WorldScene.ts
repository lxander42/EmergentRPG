import Phaser from "phaser";
import { bus } from "@/lib/render/bus";
import { useGameStore } from "@/lib/state/game-store";

const TILE = 32;
const MAP_W = 48;
const MAP_H = 48;

// Mini Motorways palette: warm cream + soft pastels. Mirrors CSS vars in globals.css.
const COLORS = {
  bg: 0xf6f1e8,
  grid: 0xc4baa6,
  grass: 0xcfd9aa,
  grassAlt: 0xd8e2b3,
  forest: 0x8fa873,
  water: 0xa8c8d8,
  sand: 0xe8d8b0,
  stone: 0xb8b0a0,
  npcStroke: 0xfbf6ed,
  selection: 0xd96846,
};

const NPC_SIZE = Math.round(TILE * 0.55);

export class WorldScene extends Phaser.Scene {
  private tileLayer!: Phaser.GameObjects.Graphics;
  private gridLayer!: Phaser.GameObjects.Graphics;
  private npcLayer!: Phaser.GameObjects.Container;
  private selectionRing!: Phaser.GameObjects.Graphics;
  private dragStart: { x: number; y: number } | null = null;
  private pinchInitial: { dist: number; zoom: number } | null = null;
  private accumulator = 0;
  private readonly tickStepMs = 250;

  constructor() {
    super("World");
  }

  create() {
    this.cameras.main.setBackgroundColor(COLORS.bg);

    this.tileLayer = this.add.graphics();
    this.drawTiles();

    this.gridLayer = this.add.graphics();
    this.drawGrid();

    this.npcLayer = this.add.container(0, 0);
    this.selectionRing = this.add.graphics();
    this.selectionRing.setVisible(false);

    this.cameras.main.setBounds(-200, -200, MAP_W * TILE + 400, MAP_H * TILE + 400);
    this.cameras.main.centerOn((MAP_W * TILE) / 2, (MAP_H * TILE) / 2);
    this.cameras.main.setZoom(1.1);

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
  }

  update(_time: number, delta: number) {
    const store = useGameStore.getState();
    if (store.paused) return;

    this.accumulator += delta * store.speed;
    while (this.accumulator >= this.tickStepMs) {
      this.accumulator -= this.tickStepMs;
      store.tick();
      bus.emit("world:tick", { ticks: useGameStore.getState().world?.ticks ?? 0 });
    }

    this.renderNpcs();
  }

  private drawTiles() {
    this.tileLayer.clear();
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const t = tileAt(x, y);
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
        this.tileLayer.fillStyle(color, 1);
        this.tileLayer.fillRect(x * TILE, y * TILE, TILE, TILE);
      }
    }
  }

  private drawGrid() {
    this.gridLayer.clear();
    this.gridLayer.lineStyle(1, COLORS.grid, 0.45);
    for (let x = 0; x <= MAP_W; x++) {
      this.gridLayer.lineBetween(x * TILE, 0, x * TILE, MAP_H * TILE);
    }
    for (let y = 0; y <= MAP_H; y++) {
      this.gridLayer.lineBetween(0, y * TILE, MAP_W * TILE, y * TILE);
    }
  }

  private renderNpcs() {
    const npcs = useGameStore.getState().world?.npcs ?? [];
    this.npcLayer.removeAll(true);

    for (const npc of npcs) {
      const cx = npc.x * TILE + TILE / 2;
      const cy = npc.y * TILE + TILE / 2;

      // Soft warm shadow first, then the building tile, then a thin cream rim.
      const shadow = this.add.rectangle(cx, cy + 2, NPC_SIZE, NPC_SIZE, 0x2c2820, 0.12);
      shadow.setOrigin(0.5);

      const tile = this.add.rectangle(cx, cy, NPC_SIZE, NPC_SIZE, npc.factionColor);
      tile.setOrigin(0.5);
      tile.setStrokeStyle(2, COLORS.npcStroke, 1);
      tile.setInteractive({ useHandCursor: true });
      tile.on(
        "pointerdown",
        (p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
          e.stopPropagation();
          useGameStore.getState().selectNpc(npc.id);
          bus.emit("npc:selected", { id: npc.id });
          this.drawSelection(cx, cy);
        },
      );

      this.npcLayer.add([shadow, tile]);
    }

    const selectedId = useGameStore.getState().selectedNpcId;
    if (selectedId) {
      const npc = npcs.find((n) => n.id === selectedId);
      if (npc) this.drawSelection(npc.x * TILE + TILE / 2, npc.y * TILE + TILE / 2);
    } else {
      this.selectionRing.setVisible(false);
    }
  }

  private drawSelection(x: number, y: number) {
    const half = NPC_SIZE / 2 + 4;
    this.selectionRing.clear();
    this.selectionRing.lineStyle(2.5, COLORS.selection, 1);
    this.selectionRing.strokeRect(x - half, y - half, half * 2, half * 2);
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
      const zoom = Phaser.Math.Clamp(this.pinchInitial.zoom * factor, 0.5, 4);
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

  private onPointerUp() {
    this.dragStart = null;
    this.pinchInitial = null;
  }

  private onWheel(_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) {
    const zoom = Phaser.Math.Clamp(this.cameras.main.zoom - dy * 0.001, 0.5, 4);
    this.cameras.main.setZoom(zoom);
  }

  private handleResize = (gameSize: Phaser.Structs.Size) => {
    this.cameras.main.setSize(gameSize.width, gameSize.height);
  };
}

function tileAt(x: number, y: number): "grass" | "water" | "sand" | "forest" | "stone" {
  const r = pseudoNoise(x, y);
  if (r < 0.18) return "water";
  if (r < 0.22) return "sand";
  if (r < 0.55) return "grass";
  if (r < 0.85) return "forest";
  return "stone";
}

function pseudoNoise(x: number, y: number): number {
  const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return s - Math.floor(s);
}
