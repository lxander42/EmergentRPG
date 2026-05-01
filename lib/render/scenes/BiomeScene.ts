import Phaser from "phaser";
import { useGameStore } from "@/lib/state/game-store";
import {
  globalToLocal,
  INTERIOR_W,
  INTERIOR_H,
  isLocalObstacle,
  regionKey,
  type BiomeInterior,
} from "@/lib/sim/biome-interior";
import { biomeAt, blendNoise, type Biome } from "@/lib/sim/biome";
import { BIOMES } from "@/content/biomes";
import { RESOURCES } from "@/content/resources";
import { FACTIONS } from "@/content/factions";
import { drawFactionShape } from "@/lib/render/shapes";
import type { Npc } from "@/lib/sim/npc";

const CELL = 36;
const PLAYER_SIZE = 22;
const NPC_SIZE = 18;
const RESOURCE_DOT_R = 5;
const BLEND_RADIUS = 2;
const VIEWPORT_PADDING_TILES = 4;
const VISIT_BUCKET_TICKS = 24;

const COLORS = {
  bg: 0xf6f1e8,
  player: 0xd96846,
  selection: 0xd96846,
  routeDot: 0xd96846,
  shadow: 0x2c2820,
};

type VisitorView = {
  body: Phaser.GameObjects.Graphics;
  hit: Phaser.GameObjects.Rectangle;
  cx: number;
  cy: number;
  targetCx: number;
  targetCy: number;
};

export class BiomeScene extends Phaser.Scene {
  private tileLayer!: Phaser.GameObjects.Graphics;
  private resourceLayer!: Phaser.GameObjects.Graphics;
  private routeLayer!: Phaser.GameObjects.Graphics;
  private playerLayer!: Phaser.GameObjects.Graphics;
  private playerShadow!: Phaser.GameObjects.Graphics;
  private selectionRing!: Phaser.GameObjects.Graphics;
  private visitorViews = new Map<string, VisitorView>();

  private playerGx = 0;
  private playerGy = 0;
  private prevPlayerGx = 0;
  private prevPlayerGy = 0;
  private playerTransitionStart = 0;
  private playerCx = 0;
  private playerCy = 0;

  private dragStart: { x: number; y: number } | null = null;
  private pinchInitial: { dist: number; zoom: number } | null = null;
  private pointerDownAt = 0;
  private pointerDownPos = { x: 0, y: 0 };
  private dragMoved = false;
  private tappedVisitorId: string | null = null;

  private accumulator = 0;
  private readonly tickStepMs = 250;

  constructor() {
    super("Biome");
  }

  create() {
    this.cameras.main.setBackgroundColor(COLORS.bg);
    this.tileLayer = this.add.graphics();
    this.resourceLayer = this.add.graphics();
    this.routeLayer = this.add.graphics();
    this.selectionRing = this.add.graphics();
    this.selectionRing.setVisible(false);
    this.playerShadow = this.add.graphics();
    this.playerLayer = this.add.graphics();

    this.cameras.main.setZoom(1);
    this.accumulator = 0;
    this.playerTransitionStart = 0;
    this.visitorViews.clear();

    const player = useGameStore.getState().world?.player;
    if (player) {
      this.playerGx = player.gx;
      this.playerGy = player.gy;
      this.prevPlayerGx = player.gx;
      this.prevPlayerGy = player.gy;
      const center = tileCenter(player.gx, player.gy);
      this.playerCx = center.x;
      this.playerCy = center.y;
      this.cameras.main.centerOn(center.x, center.y);
    }

    this.input.addPointer(2);
    this.input.on("pointerdown", this.onPointerDown, this);
    this.input.on("pointermove", this.onPointerMove, this);
    this.input.on("pointerup", this.onPointerUp, this);
    this.input.on("wheel", this.onWheel, this);
    this.scale.on("resize", this.handleResize, this);
  }

  shutdown() {
    this.scale.off("resize", this.handleResize, this);
    for (const view of this.visitorViews.values()) {
      view.body.destroy();
      view.hit.destroy();
    }
    this.visitorViews.clear();
  }

  update(_time: number, delta: number) {
    const store = useGameStore.getState();
    if (store.view !== "biome") {
      this.scene.start("World");
      return;
    }
    if (!store.paused && !store.world?.gameOver) {
      this.accumulator += delta * store.speed;
      while (this.accumulator >= this.tickStepMs) {
        this.accumulator -= this.tickStepMs;
        store.tick();
      }
    }
    this.renderFrame();
  }

  private renderFrame() {
    const world = useGameStore.getState().world;
    if (!world || !world.player) return;
    const player = world.player;
    const now = this.time.now;

    if (player.gx !== this.playerGx || player.gy !== this.playerGy) {
      this.prevPlayerGx = this.playerGx;
      this.prevPlayerGy = this.playerGy;
      this.playerGx = player.gx;
      this.playerGy = player.gy;
      this.playerTransitionStart = now;
    }

    const stepMs = Math.max(1, player.stats.speed) * this.tickStepMs;
    const t =
      this.playerTransitionStart === 0
        ? 1
        : Math.min(1, (now - this.playerTransitionStart) / stepMs);
    const eased = easeOutCubic(t);
    const fromCenter = tileCenter(this.prevPlayerGx, this.prevPlayerGy);
    const toCenter = tileCenter(this.playerGx, this.playerGy);
    this.playerCx = fromCenter.x + (toCenter.x - fromCenter.x) * eased;
    this.playerCy = fromCenter.y + (toCenter.y - fromCenter.y) * eased;
    if (t >= 1 && this.playerTransitionStart !== 0) this.playerTransitionStart = 0;

    this.cameras.main.centerOn(this.playerCx, this.playerCy);

    this.drawTiles(world);
    this.drawResources(world);
    this.drawRoute(player);
    this.drawPlayer();
    this.drawVisitors(world.npcs, world);
    this.drawSelection();
  }

  private viewport(): { gxMin: number; gyMin: number; gxMax: number; gyMax: number } {
    const cam = this.cameras.main;
    const tlx = cam.scrollX;
    const tly = cam.scrollY;
    const brx = cam.scrollX + cam.width / cam.zoom;
    const bry = cam.scrollY + cam.height / cam.zoom;
    return {
      gxMin: Math.floor(tlx / CELL) - VIEWPORT_PADDING_TILES,
      gyMin: Math.floor(tly / CELL) - VIEWPORT_PADDING_TILES,
      gxMax: Math.ceil(brx / CELL) + VIEWPORT_PADDING_TILES,
      gyMax: Math.ceil(bry / CELL) + VIEWPORT_PADDING_TILES,
    };
  }

  private drawTiles(world: { biomeInteriors: Record<string, BiomeInterior> }) {
    this.tileLayer.clear();
    const v = this.viewport();
    for (let gy = v.gyMin; gy <= v.gyMax; gy++) {
      for (let gx = v.gxMin; gx <= v.gxMax; gx++) {
        const { rx, ry, lx, ly } = globalToLocal(gx, gy);
        const interior = world.biomeInteriors[regionKey(rx, ry)];
        const biome = interior ? interior.biome : biomeAt(rx, ry);
        const color = tileColor(gx, gy, biome);
        const px = gx * CELL;
        const py = gy * CELL;
        this.tileLayer.fillStyle(color, 1);
        this.tileLayer.fillRect(px, py, CELL, CELL);
        if (interior && biome !== "water" && isLocalObstacle(interior, lx, ly)) {
          const obstacleColor = mixToward(color, 0x000000, 0.32);
          this.tileLayer.fillStyle(obstacleColor, 1);
          this.tileLayer.fillRoundedRect(px + 4, py + 4, CELL - 8, CELL - 8, 4);
          this.tileLayer.fillStyle(COLORS.shadow, 0.18);
          this.tileLayer.fillRoundedRect(px + 7, py + 7, CELL - 14, CELL - 14, 3);
        }
      }
    }
  }

  private drawResources(world: { biomeInteriors: Record<string, BiomeInterior> }) {
    this.resourceLayer.clear();
    const v = this.viewport();
    const rxMin = Math.floor(v.gxMin / INTERIOR_W);
    const rxMax = Math.floor(v.gxMax / INTERIOR_W);
    const ryMin = Math.floor(v.gyMin / INTERIOR_H);
    const ryMax = Math.floor(v.gyMax / INTERIOR_H);
    for (let ry = ryMin; ry <= ryMax; ry++) {
      for (let rx = rxMin; rx <= rxMax; rx++) {
        const interior = world.biomeInteriors[regionKey(rx, ry)];
        if (!interior) continue;
        for (const r of interior.resources) {
          const meta = RESOURCES[r.kind];
          const cx = (rx * INTERIOR_W + r.lx) * CELL + CELL / 2;
          const cy = (ry * INTERIOR_H + r.ly) * CELL + CELL / 2;
          const color = hexToInt(meta.swatch);
          const alpha = meta.food ? 1 : 0.45;
          this.resourceLayer.fillStyle(COLORS.shadow, alpha * 0.22);
          this.resourceLayer.fillCircle(cx, cy + 1.5, RESOURCE_DOT_R);
          this.resourceLayer.fillStyle(color, alpha);
          this.resourceLayer.fillCircle(cx, cy, RESOURCE_DOT_R);
          this.resourceLayer.lineStyle(1, 0xffffff, alpha * 0.7);
          this.resourceLayer.strokeCircle(cx, cy, RESOURCE_DOT_R);
        }
      }
    }
  }

  private drawRoute(player: { route: Array<{ gx: number; gy: number }> | null }) {
    this.routeLayer.clear();
    if (!player.route || player.route.length === 0) return;
    const now = this.time.now;
    const pulse = 0.5 + 0.5 * Math.sin(now * 0.005);
    const points: Array<{ x: number; y: number }> = [{ x: this.playerCx, y: this.playerCy }];
    for (const p of player.route) {
      const c = tileCenter(p.gx, p.gy);
      points.push({ x: c.x, y: c.y });
    }
    this.routeLayer.lineStyle(2, COLORS.routeDot, 0.35 + 0.2 * pulse);
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i]!;
      const b = points[i + 1]!;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      this.routeLayer.beginPath();
      this.routeLayer.moveTo(a.x, a.y);
      this.routeLayer.lineTo(mid.x, mid.y);
      this.routeLayer.strokePath();
    }
    const last = points[points.length - 1]!;
    this.routeLayer.fillStyle(COLORS.routeDot, 0.35 + 0.2 * pulse);
    this.routeLayer.fillCircle(last.x, last.y, 4);
  }

  private drawPlayer() {
    this.playerShadow.clear();
    this.playerShadow.fillStyle(COLORS.shadow, 0.18);
    this.playerShadow.fillRoundedRect(
      this.playerCx - PLAYER_SIZE / 2,
      this.playerCy - PLAYER_SIZE / 2 + 2,
      PLAYER_SIZE,
      PLAYER_SIZE,
      6,
    );
    this.playerLayer.clear();
    drawFactionShape(
      this.playerLayer,
      "square",
      COLORS.player,
      this.playerCx,
      this.playerCy,
      PLAYER_SIZE,
      { stroke: 2, strokeColor: 0xfbf6ed },
    );
  }

  private drawVisitors(npcs: Npc[], world: { ticks: number }) {
    const player = useGameStore.getState().world?.player;
    if (!player) return;
    const here = globalToLocal(player.gx, player.gy);
    const visitors = npcs.filter((n) => n.rx === here.rx && n.ry === here.ry);
    const seen = new Set<string>();
    const bucket = Math.floor(world.ticks / VISIT_BUCKET_TICKS);

    for (const npc of visitors) {
      seen.add(npc.id);
      const slot = visitorSlot(npc.id, bucket, here.rx, here.ry, player.gx, player.gy);
      const target = tileCenter(slot.gx, slot.gy);

      let view = this.visitorViews.get(npc.id);
      if (!view) {
        const body = this.add.graphics();
        const hit = this.add.rectangle(
          target.x,
          target.y,
          NPC_SIZE + 16,
          NPC_SIZE + 16,
          0xffffff,
          0,
        );
        hit.setInteractive({ useHandCursor: true });
        hit.on(
          "pointerdown",
          (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
            e.stopPropagation();
            this.tappedVisitorId = npc.id;
            useGameStore.getState().selectNpc(npc.id);
          },
        );
        view = { body, hit, cx: target.x, cy: target.y, targetCx: target.x, targetCy: target.y };
        this.visitorViews.set(npc.id, view);
      }
      view.targetCx = target.x;
      view.targetCy = target.y;
      view.cx += (view.targetCx - view.cx) * 0.08;
      view.cy += (view.targetCy - view.cy) * 0.08;

      const faction = FACTIONS.find((f) => f.id === npc.factionId);
      const shape = faction?.shape ?? "diamond";
      view.body.clear();
      view.body.fillStyle(COLORS.shadow, 0.18);
      view.body.fillCircle(view.cx, view.cy + 2, NPC_SIZE / 2);
      drawFactionShape(view.body, shape, npc.factionColor, view.cx, view.cy, NPC_SIZE, {
        stroke: 1.5,
        strokeColor: 0xfbf6ed,
      });
      view.hit.x = view.cx;
      view.hit.y = view.cy;
    }

    for (const [id, view] of this.visitorViews) {
      if (!seen.has(id)) {
        view.body.destroy();
        view.hit.destroy();
        this.visitorViews.delete(id);
      }
    }
  }

  private drawSelection() {
    const { selectedNpcId } = useGameStore.getState();
    this.selectionRing.clear();
    if (!selectedNpcId) {
      this.selectionRing.setVisible(false);
      return;
    }
    const v = this.visitorViews.get(selectedNpcId);
    if (!v) {
      this.selectionRing.setVisible(false);
      return;
    }
    const half = NPC_SIZE / 2 + 5;
    this.selectionRing.lineStyle(2.5, COLORS.selection, 1);
    this.selectionRing.strokeRoundedRect(v.cx - half, v.cy - half, half * 2, half * 2, 5);
    this.selectionRing.setVisible(true);
  }

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
      const zoom = Phaser.Math.Clamp(this.pinchInitial.zoom * factor, 0.6, 2.5);
      this.cameras.main.setZoom(zoom);
      return;
    }
    if (this.dragStart && pointer.isDown) {
      const dx = pointer.x - this.dragStart.x;
      const dy = pointer.y - this.dragStart.y;
      if (Math.abs(dx) + Math.abs(dy) > 6) this.dragMoved = true;
      this.dragStart = { x: pointer.x, y: pointer.y };
    }
  }

  private onPointerUp(pointer: Phaser.Input.Pointer) {
    const wasVisitorTap = this.tappedVisitorId !== null;
    this.tappedVisitorId = null;
    const dt = this.time.now - this.pointerDownAt;
    const moved = Phaser.Math.Distance.Between(
      this.pointerDownPos.x,
      this.pointerDownPos.y,
      pointer.x,
      pointer.y,
    );

    if (!wasVisitorTap && !this.dragMoved && dt < 350 && moved < 10) {
      const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      const gx = Math.floor(world.x / CELL);
      const gy = Math.floor(world.y / CELL);
      useGameStore.getState().walkPlayerTo(gx, gy);
    }

    this.dragStart = null;
    this.dragMoved = false;
    this.pinchInitial = null;
  }

  private onWheel(_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) {
    const zoom = Phaser.Math.Clamp(this.cameras.main.zoom - dy * 0.001, 0.6, 2.5);
    this.cameras.main.setZoom(zoom);
  }

  private handleResize = (gameSize: Phaser.Structs.Size) => {
    this.cameras.main.setSize(gameSize.width, gameSize.height);
  };
}

function tileCenter(gx: number, gy: number): { x: number; y: number } {
  return { x: gx * CELL + CELL / 2, y: gy * CELL + CELL / 2 };
}

function tileColor(gx: number, gy: number, biome: Biome): number {
  const baseHex = BIOMES[biome].swatch;
  const base = hexToInt(baseHex);
  let blendColor = base;
  let blendWeight = 0;
  for (let dy = -BLEND_RADIUS; dy <= BLEND_RADIUS; dy++) {
    for (let dx = -BLEND_RADIUS; dx <= BLEND_RADIUS; dx++) {
      if (dx === 0 && dy === 0) continue;
      const dist = Math.abs(dx) + Math.abs(dy);
      if (dist > BLEND_RADIUS) continue;
      const nb = biomeAt(gx + dx, gy + dy);
      if (nb === biome) continue;
      const w = (BLEND_RADIUS + 1 - dist) / (BLEND_RADIUS + 1);
      const nbColor = hexToInt(BIOMES[nb].swatch);
      if (blendWeight === 0) {
        blendColor = nbColor;
        blendWeight = w;
      } else {
        blendColor = mixToward(blendColor, nbColor, w / (blendWeight + w));
        blendWeight += w;
      }
    }
  }
  if (blendWeight === 0) {
    return (gx + gy) % 2 === 0 ? base : mixToward(base, 0xffffff, 0.05);
  }
  const noise = blendNoise(gx, gy);
  const t = Math.min(0.5, blendWeight * 0.45 + noise * 0.05);
  return mixToward(base, blendColor, t);
}

function visitorSlot(
  id: string,
  bucket: number,
  rx: number,
  ry: number,
  pgx: number,
  pgy: number,
): { gx: number; gy: number } {
  const seed = hashString(`${id}:${bucket}`);
  const cells = INTERIOR_W * INTERIOR_H;
  for (let i = 0; i < cells; i++) {
    const idx = (seed + i) % cells;
    const lx = idx % INTERIOR_W;
    const ly = (idx - lx) / INTERIOR_W;
    const gx = rx * INTERIOR_W + lx;
    const gy = ry * INTERIOR_H + ly;
    if (gx === pgx && gy === pgy) continue;
    return { gx, gy };
  }
  return { gx: rx * INTERIOR_W, gy: ry * INTERIOR_H };
}

function easeOutCubic(t: number): number {
  const u = 1 - t;
  return 1 - u * u * u;
}

function hexToInt(hex: string): number {
  return parseInt(hex.replace("#", ""), 16);
}

function mixToward(color: number, target: number, t: number): number {
  const r1 = (color >> 16) & 0xff;
  const g1 = (color >> 8) & 0xff;
  const b1 = color & 0xff;
  const r2 = (target >> 16) & 0xff;
  const g2 = (target >> 8) & 0xff;
  const b2 = target & 0xff;
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  return (r << 16) | (g << 8) | b;
}

function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
