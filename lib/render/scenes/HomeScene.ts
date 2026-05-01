import Phaser from "phaser";
import { useGameStore } from "@/lib/state/game-store";
import { HOME_GRID } from "@/lib/sim/home";
import { BIOMES } from "@/content/biomes";
import { RESOURCES } from "@/content/home-resources";
import type { Npc } from "@/lib/sim/npc";

const CELL = 56;
const PADDING = 4;
const RADIUS = 8;
const INNER = CELL - PADDING * 2;

const NPC_SIZE = 22;
const NPC_RADIUS = 5;
const RESOURCE_SIZE = 22;
const RESOURCE_RADIUS = 5;
const PLAYER_SIZE = 28;
const PLAYER_RADIUS = 6;

const VISIT_BUCKET_TICKS = 24;

const COLORS = {
  bg: 0xf6f1e8,
  player: 0xd96846,
  selection: 0xd96846,
  routeDot: 0xd96846,
  npcStroke: 0xfbf6ed,
  obstacleShadow: 0x2c2820,
};

type ResourceView = {
  graphic: Phaser.GameObjects.Graphics;
  hit: Phaser.GameObjects.Rectangle;
  px: number;
  py: number;
};

type VisitorView = {
  body: Phaser.GameObjects.Graphics;
  hit: Phaser.GameObjects.Rectangle;
  targetCx: number;
  targetCy: number;
  cx: number;
  cy: number;
};

export class HomeScene extends Phaser.Scene {
  private tileLayer!: Phaser.GameObjects.Graphics;
  private routeLayer!: Phaser.GameObjects.Graphics;
  private playerLayer!: Phaser.GameObjects.Container;
  private selectionRing!: Phaser.GameObjects.Graphics;
  private playerGraphic!: Phaser.GameObjects.Graphics;
  private playerShadow!: Phaser.GameObjects.Graphics;
  private resourceViews = new Map<string, ResourceView>();
  private visitorViews = new Map<string, VisitorView>();

  private playerPx = 0;
  private playerPy = 0;
  private playerTransitionStart = 0;
  private prevPlayerPx = 0;
  private prevPlayerPy = 0;

  private dragStart: { x: number; y: number } | null = null;
  private pinchInitial: { dist: number; zoom: number } | null = null;
  private pointerDownAt = 0;
  private pointerDownPos = { x: 0, y: 0 };
  private tappedVisitorId: string | null = null;

  private accumulator = 0;
  private readonly tickStepMs = 250;

  constructor() {
    super("Home");
  }

  create() {
    this.cameras.main.setBackgroundColor(COLORS.bg);
    this.tileLayer = this.add.graphics();
    this.routeLayer = this.add.graphics();
    this.selectionRing = this.add.graphics();
    this.selectionRing.setVisible(false);
    this.playerLayer = this.add.container(0, 0);

    this.playerShadow = this.add.graphics();
    this.playerGraphic = this.add.graphics();
    this.playerLayer.add([this.playerShadow, this.playerGraphic]);

    const home = useGameStore.getState().world?.home;
    const player = useGameStore.getState().world?.player;
    if (player) {
      this.playerPx = player.px;
      this.playerPy = player.py;
      this.prevPlayerPx = player.px;
      this.prevPlayerPy = player.py;
    }
    if (home) this.drawTiles();

    const worldPx = HOME_GRID * CELL;
    this.cameras.main.setBounds(-200, -200, worldPx + 400, worldPx + 400);
    this.cameras.main.centerOn(worldPx / 2, worldPx / 2);
    this.cameras.main.setZoom(1);

    this.input.addPointer(2);
    this.input.on("pointerdown", this.onPointerDown, this);
    this.input.on("pointermove", this.onPointerMove, this);
    this.input.on("pointerup", this.onPointerUp, this);
    this.input.on("wheel", this.onWheel, this);

    this.scale.on("resize", this.handleResize, this);
  }

  shutdown() {
    this.scale.off("resize", this.handleResize, this);
    for (const view of this.resourceViews.values()) {
      view.graphic.destroy();
      view.hit.destroy();
    }
    this.resourceViews.clear();
    for (const view of this.visitorViews.values()) {
      view.body.destroy();
      view.hit.destroy();
    }
    this.visitorViews.clear();
  }

  update(_time: number, delta: number) {
    const store = useGameStore.getState();

    if (store.view !== "home") {
      this.scene.start("World");
      return;
    }

    if (!store.paused) {
      this.accumulator += delta * store.speed;
      while (this.accumulator >= this.tickStepMs) {
        this.accumulator -= this.tickStepMs;
        store.tick();
      }
    }

    this.renderHome();
  }

  private drawTiles() {
    this.tileLayer.clear();
    const home = useGameStore.getState().world?.home;
    if (!home) return;
    const meta = BIOMES[home.biome];
    const baseColor = hexToInt(meta.swatch);
    const altColor = mixToward(baseColor, 0xffffff, 0.08);
    const obstacleColor = mixToward(baseColor, 0x000000, 0.32);

    for (let y = 0; y < HOME_GRID; y++) {
      for (let x = 0; x < HOME_GRID; x++) {
        const isObstacle = home.obstacles[y * HOME_GRID + x];
        const color = isObstacle ? obstacleColor : (x + y) % 2 === 0 ? baseColor : altColor;
        const px = x * CELL + PADDING;
        const py = y * CELL + PADDING;
        this.tileLayer.fillStyle(color, 1);
        this.tileLayer.fillRoundedRect(px, py, INNER, INNER, RADIUS);
        if (isObstacle) {
          this.tileLayer.fillStyle(COLORS.obstacleShadow, 0.12);
          this.tileLayer.fillRoundedRect(px + 4, py + 4, INNER - 8, INNER - 8, RADIUS - 2);
        }
      }
    }
  }

  private renderHome() {
    const world = useGameStore.getState().world;
    if (!world || !world.home || !world.player) return;
    const { home, player } = world;
    const now = this.time.now;

    if (player.px !== this.playerPx || player.py !== this.playerPy) {
      this.prevPlayerPx = this.playerPx;
      this.prevPlayerPy = this.playerPy;
      this.playerPx = player.px;
      this.playerPy = player.py;
      this.playerTransitionStart = now;
    }

    const stepMs = Math.max(1, player.stats.speed) * this.tickStepMs;
    const t =
      this.playerTransitionStart === 0
        ? 1
        : Math.min(1, (now - this.playerTransitionStart) / stepMs);
    const eased = easeOutCubic(t);

    const fromX = this.prevPlayerPx * CELL + CELL / 2;
    const fromY = this.prevPlayerPy * CELL + CELL / 2;
    const toX = this.playerPx * CELL + CELL / 2;
    const toY = this.playerPy * CELL + CELL / 2;
    const cx = fromX + (toX - fromX) * eased;
    const cy = fromY + (toY - fromY) * eased;

    this.playerShadow.clear();
    this.playerShadow.fillStyle(COLORS.obstacleShadow, 0.18);
    this.playerShadow.fillRoundedRect(
      cx - PLAYER_SIZE / 2,
      cy - PLAYER_SIZE / 2 + 2,
      PLAYER_SIZE,
      PLAYER_SIZE,
      PLAYER_RADIUS,
    );

    this.playerGraphic.clear();
    this.playerGraphic.fillStyle(COLORS.player, 1);
    this.playerGraphic.fillRoundedRect(
      cx - PLAYER_SIZE / 2,
      cy - PLAYER_SIZE / 2,
      PLAYER_SIZE,
      PLAYER_SIZE,
      PLAYER_RADIUS,
    );
    this.playerGraphic.lineStyle(2, COLORS.npcStroke, 1);
    this.playerGraphic.strokeRoundedRect(
      cx - PLAYER_SIZE / 2,
      cy - PLAYER_SIZE / 2,
      PLAYER_SIZE,
      PLAYER_SIZE,
      PLAYER_RADIUS,
    );

    if (t >= 1 && this.playerTransitionStart !== 0) this.playerTransitionStart = 0;

    this.routeLayer.clear();
    if (player.route && player.route.length > 0) {
      const points: Array<{ x: number; y: number }> = [{ x: cx, y: cy }];
      for (const p of player.route) {
        points.push({ x: p.px * CELL + CELL / 2, y: p.py * CELL + CELL / 2 });
      }
      const pulse = 0.5 + 0.5 * Math.sin(now * 0.005);
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

    const seenResources = new Set<string>();
    for (const r of home.resources) {
      seenResources.add(r.id);
      let view = this.resourceViews.get(r.id);
      const rcx = r.px * CELL + CELL / 2;
      const rcy = r.py * CELL + CELL / 2;
      if (!view) {
        const graphic = this.add.graphics();
        const hit = this.add.rectangle(rcx, rcy, CELL - PADDING * 2, CELL - PADDING * 2, 0xffffff, 0);
        hit.setInteractive({ useHandCursor: true });
        hit.on(
          "pointerdown",
          (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
            e.stopPropagation();
            useGameStore.getState().walkPlayerTo(r.px, r.py);
          },
        );
        view = { graphic, hit, px: r.px, py: r.py };
        this.resourceViews.set(r.id, view);
      }
      const meta = RESOURCES[r.kind];
      const color = hexToInt(meta.swatch);
      const available = r.respawnAt === null;
      view.graphic.clear();
      view.graphic.fillStyle(COLORS.obstacleShadow, available ? 0.18 : 0.08);
      view.graphic.fillRoundedRect(
        rcx - RESOURCE_SIZE / 2,
        rcy - RESOURCE_SIZE / 2 + 2,
        RESOURCE_SIZE,
        RESOURCE_SIZE,
        RESOURCE_RADIUS,
      );
      view.graphic.fillStyle(color, available ? 1 : 0.25);
      view.graphic.fillRoundedRect(
        rcx - RESOURCE_SIZE / 2,
        rcy - RESOURCE_SIZE / 2,
        RESOURCE_SIZE,
        RESOURCE_SIZE,
        RESOURCE_RADIUS,
      );
      view.graphic.lineStyle(1.5, COLORS.npcStroke, available ? 1 : 0.4);
      view.graphic.strokeRoundedRect(
        rcx - RESOURCE_SIZE / 2,
        rcy - RESOURCE_SIZE / 2,
        RESOURCE_SIZE,
        RESOURCE_SIZE,
        RESOURCE_RADIUS,
      );
    }
    for (const [id, view] of this.resourceViews) {
      if (!seenResources.has(id)) {
        view.graphic.destroy();
        view.hit.destroy();
        this.resourceViews.delete(id);
      }
    }

    this.renderVisitors(world.npcs, home);
    this.renderSelection();
  }

  private renderVisitors(npcs: Npc[], home: { rx: number; ry: number }) {
    const world = useGameStore.getState().world;
    if (!world) return;
    const visitors = npcs.filter((n) => n.rx === home.rx && n.ry === home.ry);
    const seen = new Set<string>();
    const bucket = Math.floor(world.ticks / VISIT_BUCKET_TICKS);

    for (const npc of visitors) {
      seen.add(npc.id);
      const slot = visitorSlot(npc.id, bucket, world.home);
      const targetCx = slot.px * CELL + CELL / 2;
      const targetCy = slot.py * CELL + CELL / 2;

      let view = this.visitorViews.get(npc.id);
      if (!view) {
        const body = this.add.graphics();
        const hit = this.add.rectangle(
          targetCx,
          targetCy,
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
        view = { body, hit, targetCx, targetCy, cx: targetCx, cy: targetCy };
        this.visitorViews.set(npc.id, view);
      }

      if (view.targetCx !== targetCx || view.targetCy !== targetCy) {
        view.targetCx = targetCx;
        view.targetCy = targetCy;
      }

      const lerp = 0.08;
      view.cx += (view.targetCx - view.cx) * lerp;
      view.cy += (view.targetCy - view.cy) * lerp;

      view.body.clear();
      view.body.fillStyle(COLORS.obstacleShadow, 0.16);
      view.body.fillRoundedRect(
        view.cx - NPC_SIZE / 2,
        view.cy - NPC_SIZE / 2 + 2,
        NPC_SIZE,
        NPC_SIZE,
        NPC_RADIUS,
      );
      view.body.fillStyle(npc.factionColor, 1);
      view.body.fillRoundedRect(
        view.cx - NPC_SIZE / 2,
        view.cy - NPC_SIZE / 2,
        NPC_SIZE,
        NPC_SIZE,
        NPC_RADIUS,
      );
      view.body.lineStyle(2, COLORS.npcStroke, 1);
      view.body.strokeRoundedRect(
        view.cx - NPC_SIZE / 2,
        view.cy - NPC_SIZE / 2,
        NPC_SIZE,
        NPC_SIZE,
        NPC_RADIUS,
      );
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

  private renderSelection() {
    const { selectedNpcId } = useGameStore.getState();
    this.selectionRing.clear();
    if (selectedNpcId) {
      const v = this.visitorViews.get(selectedNpcId);
      if (v) {
        const half = NPC_SIZE / 2 + 5;
        this.selectionRing.lineStyle(2.5, COLORS.selection, 1);
        this.selectionRing.strokeRoundedRect(
          v.cx - half,
          v.cy - half,
          half * 2,
          half * 2,
          NPC_RADIUS + 2,
        );
        this.selectionRing.setVisible(true);
        return;
      }
    }
    this.selectionRing.setVisible(false);
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
      const zoom = Phaser.Math.Clamp(this.pinchInitial.zoom * factor, 0.5, 2.5);
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
    const wasVisitorTap = this.tappedVisitorId !== null;
    this.tappedVisitorId = null;
    const dt = this.time.now - this.pointerDownAt;
    const moved = Phaser.Math.Distance.Between(
      this.pointerDownPos.x,
      this.pointerDownPos.y,
      pointer.x,
      pointer.y,
    );

    if (!wasVisitorTap && dt < 250 && moved < 8) {
      const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      const tx = Math.floor(world.x / CELL);
      const ty = Math.floor(world.y / CELL);
      if (tx >= 0 && tx < HOME_GRID && ty >= 0 && ty < HOME_GRID) {
        useGameStore.getState().walkPlayerTo(tx, ty);
      } else {
        useGameStore.getState().selectNpc(null);
      }
    }

    this.dragStart = null;
    this.pinchInitial = null;
  }

  private onWheel(_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) {
    const zoom = Phaser.Math.Clamp(this.cameras.main.zoom - dy * 0.001, 0.5, 2.5);
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

// Visiting NPCs land on a deterministic free tile derived from id + tick bucket.
// Avoids the player's tile, obstacles and resource tiles where possible.
function visitorSlot(
  id: string,
  bucket: number,
  home: { obstacles: boolean[]; resources: { px: number; py: number }[] } | null | undefined,
): { px: number; py: number } {
  const seed = hashString(`${id}:${bucket}`);
  const cells = HOME_GRID * HOME_GRID;
  for (let i = 0; i < cells; i++) {
    const idx = (seed + i) % cells;
    const px = idx % HOME_GRID;
    const py = (idx - px) / HOME_GRID;
    if (!home) return { px, py };
    if (home.obstacles[idx]) continue;
    if (home.resources.some((r) => r.px === px && r.py === py)) continue;
    return { px, py };
  }
  return { px: 0, py: 0 };
}

function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
