import Phaser from "phaser";
import { useGameStore } from "@/lib/state/game-store";
import {
  globalToLocal,
  INTERIOR_W,
  INTERIOR_H,
  obstacleKindAt,
  regionKey,
  resourceAtLocal,
  isLocalObstacle,
  type BiomeInterior,
  type ObstacleKind,
} from "@/lib/sim/biome-interior";
import { biomeAt, blendNoise, type Biome } from "@/lib/sim/biome";
import { BIOMES } from "@/content/biomes";
import { RESOURCES, type ResourceKind } from "@/content/resources";
import { FACTIONS } from "@/content/factions";
import { drawFactionShape } from "@/lib/render/shapes";
import { bus } from "@/lib/render/bus";
import type { Npc } from "@/lib/sim/npc";
import { effectivePerception, isBitmapTileDiscovered } from "@/lib/sim/fog";
import type { Player } from "@/lib/sim/player";

const CELL = 36;
const PLAYER_SIZE = 22;
const NPC_SIZE = 18;
const RESOURCE_SIZE = 10;
const BLEND_RADIUS = 1;
// Padding tiles beyond the camera viewport. Generous so the cream
// background never shows along an edge if the camera happens to overshoot
// the tile rect by a frame or two during pan/zoom transitions.
const VIEWPORT_PADDING_TILES = 10;
const VISIT_BUCKET_TICKS = 24;
const PAN_THRESHOLD_PX = 6;

const COLORS = {
  bg: 0xf6f1e8,
  player: 0xd96846,
  selection: 0xd96846,
  routeDot: 0xd96846,
  shadow: 0x2c2820,
  // Near-black warm fg colour, matches --color-fg in globals.css.
  outline: 0x2c2820,
  forestTree: 0x4f6a3e,
  forestTrunk: 0x6e5238,
  rock: 0x8a8378,
  rockShade: 0x67625a,
  bush: 0x86a06d,
  cactus: 0x7e9b6a,
  workbench: 0xd96846,
  workbenchLeg: 0x7a3d28,
};

type VisitorView = {
  body: Phaser.GameObjects.Graphics;
  cx: number;
  cy: number;
  targetCx: number;
  targetCy: number;
  flashUntil: number;
  fading: boolean;
};

type VisitorHit = { id: string; x: number; y: number; half: number };

type FogContext = {
  px: number;
  py: number;
  perception: number;
  r2: number;
  discoveredTiles: Record<string, Uint8Array>;
  simplified: boolean;
};

export class BiomeScene extends Phaser.Scene {
  private tileLayer!: Phaser.GameObjects.Graphics;
  private resourceLayer!: Phaser.GameObjects.Graphics;
  private fogLayer!: Phaser.GameObjects.Graphics;
  private routeLayer!: Phaser.GameObjects.Graphics;
  private playerLayer!: Phaser.GameObjects.Graphics;
  private playerShadow!: Phaser.GameObjects.Graphics;
  private selectionRing!: Phaser.GameObjects.Graphics;
  private visitorViews = new Map<string, VisitorView>();
  private visitorHits: VisitorHit[] = [];
  private prevNpcHealth = new Map<string, number>();
  private prevPlayerHealth = -1;
  private seenPickupIds = new Set<string>();
  private projectileLayer!: Phaser.GameObjects.Graphics;

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

  // Google-Maps style pan: once the user drags, the camera holds its
  // absolute scroll position and the player can walk out of view.
  // A floating recenter button (rendered in React) snaps it back.
  private cameraPanned = false;

  private accumulator = 0;
  private readonly tickStepMs = 250;
  private dpr = 1;
  private tileColorCache = new Map<string, number>();
  private longPressTimer: Phaser.Time.TimerEvent | null = null;
  private peekText: Phaser.GameObjects.Text | null = null;

  constructor() {
    super("Biome");
  }

  create() {
    this.dpr = (this.game.registry.get("dpr") as number) ?? 1;
    this.cameras.main.setBackgroundColor(COLORS.bg);
    this.tileLayer = this.add.graphics();
    this.resourceLayer = this.add.graphics();
    this.fogLayer = this.add.graphics();
    this.routeLayer = this.add.graphics();
    this.selectionRing = this.add.graphics();
    this.selectionRing.setVisible(false);
    this.playerShadow = this.add.graphics();
    this.playerLayer = this.add.graphics();
    this.projectileLayer = this.add.graphics();

    // setZoom must precede centerOn -- centerOn uses the current zoom to
    // derive scrollX/Y, otherwise the camera lands somewhere far off.
    this.cameras.main.setZoom(this.dpr);
    this.accumulator = 0;
    this.playerTransitionStart = 0;
    this.tileColorCache.clear();
    this.cameraPanned = false;
    this.visitorViews.clear();
    this.visitorHits = [];
    bus.emit("biome:panned", { panned: false });

    const player = useGameStore.getState().world?.life?.player;
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
    this.game.events.on("dprchange", this.onDprChange, this);
    bus.on("biome:recenter", this.onRecenterRequest);
  }

  shutdown() {
    this.scale.off("resize", this.handleResize, this);
    this.game.events.off("dprchange", this.onDprChange, this);
    bus.off("biome:recenter", this.onRecenterRequest);
    bus.emit("biome:panned", { panned: false });
    for (const view of this.visitorViews.values()) view.body.destroy();
    this.visitorViews.clear();
    this.visitorHits = [];
    this.tileColorCache.clear();
    this.cancelLongPress();
    if (this.peekText) {
      this.peekText.destroy();
      this.peekText = null;
    }
  }

  update(_time: number, delta: number) {
    const store = useGameStore.getState();
    if (store.view !== "biome") {
      this.scene.start("World");
      return;
    }
    if (!store.paused && !store.world?.life?.gameOver) {
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
    if (!world || !world.life) return;
    const player = world.life.player;
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

    // Camera is pinned to the player by default; once the user drags it
    // sticks where they put it until the recenter button is tapped.
    if (!this.cameraPanned) {
      this.cameras.main.centerOn(this.playerCx, this.playerCy);
    }

    const fog = this.computeFog(player, world);
    this.drawTiles(world, fog);
    this.drawResources(world, fog);
    this.drawLoot(world, fog);
    this.drawFog(fog);
    this.drawRoute(player);
    this.drawPlayer();
    this.drawVisitors(world.npcs, world, fog);
    this.detectHits(world.npcs, player.health);
    this.spawnPickupTexts(world.life.recentPickups);
    this.drawProjectiles(world.life.recentProjectiles, world.ticks);
    this.drawSelection();
  }

  private computeFog(
    player: Player,
    world: { discoveredTiles: Record<string, Uint8Array> },
  ): FogContext {
    const perception = effectivePerception(player);
    return {
      px: player.gx,
      py: player.gy,
      perception,
      r2: perception * perception,
      discoveredTiles: world.discoveredTiles,
      simplified: this.cameras.main.zoom < 0.7 * this.dpr,
    };
  }

  private tileVisibility(
    fog: FogContext,
    gx: number,
    gy: number,
    bitmap: Uint8Array | undefined,
    lx: number,
    ly: number,
  ): "visible" | "discovered" | "unknown" {
    const dx = gx - fog.px;
    const dy = gy - fog.py;
    if (dx * dx + dy * dy <= fog.r2) return "visible";
    if (bitmap && isBitmapTileDiscovered(bitmap, lx, ly)) return "discovered";
    return "unknown";
  }

  private drawProjectiles(
    projectiles: { id: string; tick: number; fromGx: number; fromGy: number; toGx: number; toGy: number; color: number }[],
    nowTick: number,
  ) {
    this.projectileLayer.clear();
    for (const p of projectiles) {
      const age = nowTick - p.tick;
      if (age < 0 || age > 4) continue;
      const alpha = Math.max(0.1, 1 - age / 4);
      const fromCenter = tileCenter(p.fromGx, p.fromGy);
      const toCenter = tileCenter(p.toGx, p.toGy);
      const dx = toCenter.x - fromCenter.x;
      const dy = toCenter.y - fromCenter.y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      const margin = PLAYER_SIZE * 0.55;
      const sx = fromCenter.x + ux * margin;
      const sy = fromCenter.y + uy * margin;
      const ex = toCenter.x - ux * margin;
      const ey = toCenter.y - uy * margin;
      const total = Math.hypot(ex - sx, ey - sy);
      this.projectileLayer.lineStyle(2, p.color, alpha);
      const segLen = 5;
      const gapLen = 4;
      let cur = 0;
      while (cur < total) {
        const a = Math.min(cur + segLen, total);
        this.projectileLayer.beginPath();
        this.projectileLayer.moveTo(sx + ux * cur, sy + uy * cur);
        this.projectileLayer.lineTo(sx + ux * a, sy + uy * a);
        this.projectileLayer.strokePath();
        cur = a + gapLen;
      }
    }
  }

  private spawnPickupTexts(pickups: { id: string; kind: ResourceKind; amount: number }[]) {
    for (const p of pickups) {
      if (this.seenPickupIds.has(p.id)) continue;
      this.seenPickupIds.add(p.id);
      const meta = RESOURCES[p.kind];
      const text = this.add.text(
        this.playerCx,
        this.playerCy - 14,
        `+${p.amount} ${meta.label}`,
        {
          fontFamily: "Outfit, ui-sans-serif, system-ui, sans-serif",
          fontSize: "20px",
          fontStyle: "bold",
          color: "#2c2820",
        },
      );
      text.setOrigin(0.5, 1);
      text.setDepth(11);
      this.tweens.add({
        targets: text,
        y: this.playerCy - 44,
        alpha: { from: 1, to: 0 },
        duration: 1400,
        ease: "Cubic.easeOut",
        onComplete: () => text.destroy(),
      });
    }
    // Garbage-collect ids that are no longer in the ring buffer.
    if (this.seenPickupIds.size > 64) {
      const live = new Set(pickups.map((p) => p.id));
      for (const id of this.seenPickupIds) if (!live.has(id)) this.seenPickupIds.delete(id);
    }
  }

  private drawLoot(
    world: { biomeInteriors: Record<string, BiomeInterior> },
    fog: FogContext,
  ) {
    const v = this.viewport();
    const rxMin = Math.floor(v.gxMin / INTERIOR_W);
    const rxMax = Math.floor(v.gxMax / INTERIOR_W);
    const ryMin = Math.floor(v.gyMin / INTERIOR_H);
    const ryMax = Math.floor(v.gyMax / INTERIOR_H);
    for (let ry = ryMin; ry <= ryMax; ry++) {
      for (let rx = rxMin; rx <= rxMax; rx++) {
        const interior = world.biomeInteriors[regionKey(rx, ry)];
        if (!interior) continue;
        for (const pile of interior.loot) {
          const gx = rx * INTERIOR_W + pile.lx;
          const gy = ry * INTERIOR_H + pile.ly;
          const dx = gx - fog.px;
          const dy = gy - fog.py;
          if (dx * dx + dy * dy > fog.r2) continue;
          const cx = gx * CELL + CELL / 2;
          const cy = gy * CELL + CELL / 2;
          this.resourceLayer.fillStyle(COLORS.shadow, 0.18);
          this.resourceLayer.fillEllipse(cx, cy + 6, 12, 3);
          this.resourceLayer.fillStyle(0xc0a878, 0.95);
          this.resourceLayer.fillRoundedRect(cx - 6, cy - 4, 12, 8, 2);
          this.resourceLayer.lineStyle(1, COLORS.shadow, 0.5);
          this.resourceLayer.strokeRoundedRect(cx - 6, cy - 4, 12, 8, 2);
        }
      }
    }
  }

  private detectHits(npcs: Npc[], playerHealth: number) {
    if (this.prevPlayerHealth >= 0 && playerHealth < this.prevPlayerHealth) {
      const damage = this.prevPlayerHealth - playerHealth;
      this.spawnDamageText(this.playerCx, this.playerCy - 10, damage);
    }
    this.prevPlayerHealth = playerHealth;

    const seenIds = new Set<string>();
    for (const npc of npcs) {
      seenIds.add(npc.id);
      const prev = this.prevNpcHealth.get(npc.id);
      if (prev !== undefined && npc.combatHealth < prev) {
        const damage = prev - npc.combatHealth;
        const view = this.visitorViews.get(npc.id);
        if (view) {
          this.spawnDamageText(view.cx, view.cy - 10, damage);
          view.flashUntil = this.time.now + 180;
        }
      }
      this.prevNpcHealth.set(npc.id, npc.combatHealth);
    }
    for (const id of this.prevNpcHealth.keys()) {
      if (!seenIds.has(id)) this.prevNpcHealth.delete(id);
    }
  }

  private spawnDamageText(x: number, y: number, damage: number) {
    const text = this.add.text(x, y, `-${damage}`, {
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      fontSize: "12px",
      color: "#d96846",
    });
    text.setOrigin(0.5, 1);
    text.setDepth(10);
    this.tweens.add({
      targets: text,
      y: y - 18,
      alpha: { from: 1, to: 0 },
      duration: 600,
      ease: "Cubic.easeOut",
      onComplete: () => text.destroy(),
    });
  }

  // Viewport in tile coords. Anchored on the camera's midpoint
  // (cam.scrollX + cam.width/2) rather than scroll directly because
  // Phaser's centerOn sets scroll = target - cam.width/2 in CANVAS px,
  // not in world units; the actual rendered worldView is centred on
  // (scroll + cam.width/2). Computing extents from that midpoint gives
  // a tile rect that's symmetric around the player at every zoom.
  private viewport(): { gxMin: number; gyMin: number; gxMax: number; gyMax: number } {
    const cam = this.cameras.main;
    const midX = cam.scrollX + cam.width * 0.5;
    const midY = cam.scrollY + cam.height * 0.5;
    const halfTilesW = Math.ceil(cam.width / cam.zoom / (2 * CELL)) + VIEWPORT_PADDING_TILES;
    const halfTilesH = Math.ceil(cam.height / cam.zoom / (2 * CELL)) + VIEWPORT_PADDING_TILES;
    const cgx = Math.round(midX / CELL);
    const cgy = Math.round(midY / CELL);
    return {
      gxMin: cgx - halfTilesW,
      gyMin: cgy - halfTilesH,
      gxMax: cgx + halfTilesW,
      gyMax: cgy + halfTilesH,
    };
  }

  private drawTiles(
    world: {
      biomeInteriors: Record<string, BiomeInterior>;
      discoveredTiles: Record<string, Uint8Array>;
    },
    fog: FogContext,
  ) {
    this.tileLayer.clear();
    const v = this.viewport();
    for (let gy = v.gyMin; gy <= v.gyMax; gy++) {
      for (let gx = v.gxMin; gx <= v.gxMax; gx++) {
        const { rx, ry, lx, ly } = globalToLocal(gx, gy);
        const bitmap = world.discoveredTiles[regionKey(rx, ry)];
        const state = this.tileVisibility(fog, gx, gy, bitmap, lx, ly);
        if (state === "unknown") continue;
        const interior = world.biomeInteriors[regionKey(rx, ry)];
        const biome = interior ? interior.biome : biomeAt(rx, ry);
        const color = this.cachedTileColor(gx, gy, biome);
        const px = gx * CELL;
        const py = gy * CELL;
        this.tileLayer.fillStyle(color, 1);
        this.tileLayer.fillRect(px, py, CELL, CELL);
        if (interior && biome !== "water") {
          const kind = obstacleKindAt(interior, lx, ly);
          if (kind) this.drawObstacle(kind, gx, gy);
        }
      }
    }
  }

  private drawFog(fog: FogContext) {
    this.fogLayer.clear();
    if (fog.simplified) return;
    const v = this.viewport();
    const FADE_BAND = 3;
    const inner = Math.max(0, fog.perception - FADE_BAND);
    const inner2 = inner * inner;
    const outer = fog.perception;
    const ramp = Math.max(1, outer - inner);
    for (let gy = v.gyMin; gy <= v.gyMax; gy++) {
      for (let gx = v.gxMin; gx <= v.gxMax; gx++) {
        const dx = gx - fog.px;
        const dy = gy - fog.py;
        const d2 = dx * dx + dy * dy;
        let alpha: number;
        if (d2 <= inner2) {
          continue;
        } else if (d2 <= fog.r2) {
          const d = Math.sqrt(d2);
          const t = (d - inner) / ramp;
          alpha = t * 0.55;
        } else {
          const { rx, ry, lx, ly } = globalToLocal(gx, gy);
          const bitmap = fog.discoveredTiles[regionKey(rx, ry)];
          if (!bitmap || !isBitmapTileDiscovered(bitmap, lx, ly)) continue;
          alpha = 0.55;
        }
        this.fogLayer.fillStyle(COLORS.bg, alpha);
        this.fogLayer.fillRect(gx * CELL, gy * CELL, CELL, CELL);
      }
    }
  }

  private cachedTileColor(gx: number, gy: number, biome: Biome): number {
    const key = `${gx},${gy}`;
    const cached = this.tileColorCache.get(key);
    if (cached !== undefined) return cached;
    const color = computeTileColor(gx, gy, biome);
    this.tileColorCache.set(key, color);
    return color;
  }

  private drawObstacle(kind: ObstacleKind, gx: number, gy: number) {
    const cx = gx * CELL + CELL / 2;
    const cy = gy * CELL + CELL / 2;
    switch (kind) {
      case "tree":
        // Small brown trunk + green canopy triangle.
        this.tileLayer.fillStyle(COLORS.forestTrunk, 1);
        this.tileLayer.fillRect(cx - 2, cy + 4, 4, 8);
        this.tileLayer.fillStyle(COLORS.forestTree, 1);
        this.tileLayer.fillTriangle(cx, cy - 13, cx - 11, cy + 6, cx + 11, cy + 6);
        this.tileLayer.fillStyle(COLORS.shadow, 0.18);
        this.tileLayer.fillEllipse(cx, cy + 13, 18, 4);
        break;
      case "rock": {
        // Irregular pentagon with a darker shade slice.
        this.tileLayer.fillStyle(COLORS.rock, 1);
        fillPolygon(this.tileLayer, [
          [cx - 11, cy + 6],
          [cx - 8, cy - 6],
          [cx + 2, cy - 11],
          [cx + 11, cy - 4],
          [cx + 8, cy + 9],
        ]);
        this.tileLayer.fillStyle(COLORS.rockShade, 1);
        fillPolygon(this.tileLayer, [
          [cx - 11, cy + 6],
          [cx - 8, cy - 6],
          [cx, cy + 4],
          [cx + 2, cy + 9],
        ]);
        break;
      }
      case "cactus":
        // Vertical bar with one offshoot.
        this.tileLayer.fillStyle(COLORS.cactus, 1);
        this.tileLayer.fillRoundedRect(cx - 3, cy - 12, 6, 24, 2);
        this.tileLayer.fillRoundedRect(cx + 3, cy - 4, 7, 5, 2);
        this.tileLayer.fillRoundedRect(cx + 8, cy - 10, 4, 7, 2);
        this.tileLayer.fillStyle(COLORS.shadow, 0.18);
        this.tileLayer.fillEllipse(cx + 1, cy + 13, 14, 4);
        break;
      case "bush":
        // 3 overlapping circles.
        this.tileLayer.fillStyle(COLORS.shadow, 0.18);
        this.tileLayer.fillEllipse(cx, cy + 9, 16, 4);
        this.tileLayer.fillStyle(COLORS.bush, 1);
        this.tileLayer.fillCircle(cx - 5, cy + 1, 6);
        this.tileLayer.fillCircle(cx + 5, cy + 1, 6);
        this.tileLayer.fillCircle(cx, cy - 4, 7);
        break;
      case "workbench":
        // Coral-accent rounded bench top with two stubby legs.
        this.tileLayer.fillStyle(COLORS.shadow, 0.18);
        this.tileLayer.fillEllipse(cx, cy + 11, 20, 4);
        this.tileLayer.fillStyle(COLORS.workbenchLeg, 1);
        this.tileLayer.fillRect(cx - 8, cy + 4, 3, 6);
        this.tileLayer.fillRect(cx + 5, cy + 4, 3, 6);
        this.tileLayer.fillStyle(COLORS.workbench, 1);
        this.tileLayer.fillRoundedRect(cx - 11, cy - 5, 22, 10, 2);
        this.tileLayer.fillStyle(COLORS.workbenchLeg, 1);
        this.tileLayer.fillRect(cx - 9, cy - 1, 18, 1.5);
        break;
    }
  }

  private drawResources(
    world: { biomeInteriors: Record<string, BiomeInterior> },
    fog: FogContext,
  ) {
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
          const gx = rx * INTERIOR_W + r.lx;
          const gy = ry * INTERIOR_H + r.ly;
          const dx = gx - fog.px;
          const dy = gy - fog.py;
          if (dx * dx + dy * dy > fog.r2) continue;
          const cx = gx * CELL + CELL / 2;
          const cy = gy * CELL + CELL / 2;
          this.drawResourceIcon(r.kind, cx, cy);
        }
      }
    }
  }

  private drawResourceIcon(kind: ResourceKind, cx: number, cy: number) {
    const meta = RESOURCES[kind];
    const color = hexToInt(meta.swatch);
    const r = RESOURCE_SIZE / 2;

    this.resourceLayer.fillStyle(COLORS.shadow, 0.18);
    this.resourceLayer.fillEllipse(cx, cy + r + 1, RESOURCE_SIZE + 2, 3);

    switch (kind) {
      case "berry": {
        this.resourceLayer.fillStyle(color, 1);
        this.resourceLayer.fillCircle(cx - 3, cy + 1, 3);
        this.resourceLayer.fillCircle(cx + 3, cy + 1, 3);
        this.resourceLayer.fillCircle(cx, cy - 3, 3);
        this.resourceLayer.fillStyle(0xffffff, 0.5);
        this.resourceLayer.fillCircle(cx - 4, cy, 0.8);
        this.resourceLayer.fillCircle(cx + 2, cy, 0.8);
        break;
      }
      case "herb": {
        this.resourceLayer.fillStyle(color, 1);
        this.resourceLayer.fillTriangle(cx, cy + 4, cx - 6, cy - 1, cx - 1, cy - 5);
        this.resourceLayer.fillTriangle(cx, cy + 4, cx + 6, cy - 1, cx + 1, cy - 5);
        this.resourceLayer.lineStyle(1, COLORS.shadow, 0.4);
        this.resourceLayer.beginPath();
        this.resourceLayer.moveTo(cx, cy + 4);
        this.resourceLayer.lineTo(cx, cy - 4);
        this.resourceLayer.strokePath();
        break;
      }
      case "grain": {
        this.resourceLayer.lineStyle(1.4, COLORS.shadow, 0.55);
        for (const ox of [-3, 0, 3]) {
          this.resourceLayer.beginPath();
          this.resourceLayer.moveTo(cx + ox, cy + 5);
          this.resourceLayer.lineTo(cx + ox, cy - 4);
          this.resourceLayer.strokePath();
        }
        this.resourceLayer.fillStyle(color, 1);
        for (const ox of [-3, 0, 3]) {
          this.resourceLayer.fillEllipse(cx + ox, cy - 5, 3, 5);
        }
        break;
      }
      case "shellfish": {
        this.resourceLayer.fillStyle(color, 1);
        this.resourceLayer.slice(cx, cy + 1, r + 1, Math.PI, 0, true);
        this.resourceLayer.fillPath();
        this.resourceLayer.lineStyle(1, COLORS.shadow, 0.45);
        for (let i = 0; i < 4; i++) {
          const a = Math.PI + (Math.PI / 4) * (i + 0.5);
          this.resourceLayer.beginPath();
          this.resourceLayer.moveTo(cx, cy + 1);
          this.resourceLayer.lineTo(cx + Math.cos(a) * (r + 1), cy + 1 + Math.sin(a) * (r + 1));
          this.resourceLayer.strokePath();
        }
        break;
      }
      case "tubers": {
        this.resourceLayer.fillStyle(color, 1);
        this.resourceLayer.fillEllipse(cx - 2, cy + 1, 6, 8);
        this.resourceLayer.fillEllipse(cx + 3, cy - 1, 5, 7);
        this.resourceLayer.fillStyle(COLORS.shadow, 0.4);
        this.resourceLayer.fillCircle(cx - 2, cy, 0.8);
        this.resourceLayer.fillCircle(cx + 3, cy - 2, 0.8);
        break;
      }
      case "wood": {
        this.resourceLayer.fillStyle(color, 0.85);
        this.resourceLayer.fillRoundedRect(cx - 6, cy - 3, 12, 6, 2);
        this.resourceLayer.lineStyle(1, COLORS.shadow, 0.5);
        this.resourceLayer.strokeCircle(cx - 6, cy, 3);
        this.resourceLayer.strokeCircle(cx + 6, cy, 3);
        break;
      }
      case "reed": {
        this.resourceLayer.lineStyle(1.6, color, 0.85);
        for (const ox of [-3, 0, 3]) {
          this.resourceLayer.beginPath();
          this.resourceLayer.moveTo(cx + ox, cy + 5);
          this.resourceLayer.lineTo(cx + ox, cy - 5);
          this.resourceLayer.strokePath();
        }
        break;
      }
      case "stone": {
        this.resourceLayer.fillStyle(color, 0.85);
        fillPolygon(this.resourceLayer, [
          [cx - 5, cy + 2],
          [cx - 3, cy - 4],
          [cx + 3, cy - 4],
          [cx + 5, cy + 1],
          [cx + 1, cy + 4],
        ]);
        this.resourceLayer.fillStyle(COLORS.shadow, 0.18);
        this.resourceLayer.fillEllipse(cx, cy + 4, 8, 2);
        break;
      }
      case "ore": {
        this.resourceLayer.fillStyle(color, 0.85);
        fillPolygon(this.resourceLayer, [
          [cx, cy - 5],
          [cx + 5, cy],
          [cx, cy + 5],
          [cx - 5, cy],
        ]);
        this.resourceLayer.fillStyle(0xffffff, 0.4);
        this.resourceLayer.fillTriangle(cx - 1, cy - 4, cx - 4, cy - 1, cx - 1, cy - 1);
        break;
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
    const player = useGameStore.getState().world?.life?.player;
    const factionColor =
      FACTIONS.find((f) => f.id === player?.factionOfOriginId)?.color ?? COLORS.player;
    drawFactionShape(
      this.playerLayer,
      "square",
      factionColor,
      this.playerCx,
      this.playerCy,
      PLAYER_SIZE,
      { stroke: 2, strokeColor: COLORS.outline },
    );
  }

  private drawVisitors(npcs: Npc[], world: { ticks: number }, fog: FogContext) {
    const player = useGameStore.getState().world?.life?.player;
    if (!player) return;
    const here = globalToLocal(player.gx, player.gy);
    const visitors = npcs.filter((n) => n.rx === here.rx && n.ry === here.ry);
    const seen = new Set<string>();
    const hits: VisitorHit[] = [];
    const bucket = Math.floor(world.ticks / VISIT_BUCKET_TICKS);

    for (const npc of visitors) {
      let target: { x: number; y: number };
      let tgx: number;
      let tgy: number;
      if (npc.interior) {
        tgx = here.rx * INTERIOR_W + npc.interior.lx;
        tgy = here.ry * INTERIOR_H + npc.interior.ly;
        target = tileCenter(tgx, tgy);
      } else {
        const slot = visitorSlot(npc.id, bucket, here.rx, here.ry, player.gx, player.gy);
        tgx = slot.gx;
        tgy = slot.gy;
        target = tileCenter(tgx, tgy);
      }
      const dx = tgx - fog.px;
      const dy = tgy - fog.py;
      if (dx * dx + dy * dy > fog.r2) continue;
      seen.add(npc.id);

      let view = this.visitorViews.get(npc.id);
      if (!view) {
        const body = this.add.graphics();
        view = {
          body,
          cx: target.x,
          cy: target.y,
          targetCx: target.x,
          targetCy: target.y,
          flashUntil: 0,
          fading: false,
        };
        this.visitorViews.set(npc.id, view);
      } else if (view.fading) {
        // NPC came back mid-fade. Cancel the fade and reset.
        this.tweens.killTweensOf(view.body);
        view.body.setAlpha(1);
        view.fading = false;
      }
      view.targetCx = target.x;
      view.targetCy = target.y;
      view.cx += (view.targetCx - view.cx) * 0.18;
      view.cy += (view.targetCy - view.cy) * 0.18;

      const faction = FACTIONS.find((f) => f.id === npc.factionId);
      const shape = faction?.shape ?? "diamond";
      view.body.clear();
      view.body.fillStyle(COLORS.shadow, 0.18);
      view.body.fillCircle(view.cx, view.cy + 2, NPC_SIZE / 2);
      const flashing = this.time.now < view.flashUntil;
      const fillColor = flashing ? 0xffffff : npc.factionColor;
      drawFactionShape(view.body, shape, fillColor, view.cx, view.cy, NPC_SIZE, {
        stroke: 1.5,
        strokeColor: COLORS.outline,
      });
      hits.push({ id: npc.id, x: view.cx, y: view.cy, half: NPC_SIZE / 2 + 14 });
    }

    for (const [id, view] of this.visitorViews) {
      if (seen.has(id) || view.fading) continue;
      view.fading = true;
      this.tweens.add({
        targets: view.body,
        alpha: { from: 1, to: 0 },
        duration: 250,
        ease: "Cubic.easeOut",
        onComplete: () => {
          view.body.destroy();
          this.visitorViews.delete(id);
        },
      });
    }
    this.visitorHits = hits;
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

  private gameOver(): boolean {
    return useGameStore.getState().world?.life?.gameOver ?? false;
  }

  private setCameraPanned(panned: boolean) {
    if (this.cameraPanned === panned) return;
    this.cameraPanned = panned;
    bus.emit("biome:panned", { panned });
  }

  private onRecenterRequest = () => {
    this.setCameraPanned(false);
    this.cameras.main.centerOn(this.playerCx, this.playerCy);
  };

  private hitVisitorAt(wx: number, wy: number): string | null {
    let best: { id: string; d2: number } | null = null;
    for (const h of this.visitorHits) {
      const dx = wx - h.x;
      const dy = wy - h.y;
      const d2 = dx * dx + dy * dy;
      const r2 = h.half * h.half;
      if (d2 > r2) continue;
      if (best === null || d2 < best.d2) best = { id: h.id, d2 };
    }
    return best ? best.id : null;
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
    const startX = pointer.x;
    const startY = pointer.y;
    this.longPressTimer = this.time.delayedCall(500, () => {
      this.longPressTimer = null;
      if (this.dragMoved) return;
      this.showTilePeek(startX, startY);
    });
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
      const minZ = 0.6 * this.dpr;
      const maxZ = 2.5 * this.dpr;
      const zoom = Phaser.Math.Clamp(this.pinchInitial.zoom * factor, minZ, maxZ);
      this.cameras.main.setZoom(zoom);
      return;
    }
    if (this.dragStart && pointer.isDown) {
      const dx = pointer.x - this.dragStart.x;
      const dy = pointer.y - this.dragStart.y;
      if (Math.abs(dx) + Math.abs(dy) > PAN_THRESHOLD_PX) {
        this.dragMoved = true;
        this.cancelLongPress();
        this.setCameraPanned(true);
      }
      this.cameras.main.scrollX -= dx / this.cameras.main.zoom;
      this.cameras.main.scrollY -= dy / this.cameras.main.zoom;
      this.dragStart = { x: pointer.x, y: pointer.y };
    }
  }

  private cancelLongPress() {
    if (this.longPressTimer) {
      this.longPressTimer.remove(false);
      this.longPressTimer = null;
    }
  }

  private showTilePeek(screenX: number, screenY: number) {
    const store = useGameStore.getState();
    const world = store.world;
    if (!world?.life) return;
    const player = world.life.player;
    const wp = this.cameras.main.getWorldPoint(screenX, screenY);
    const gx = Math.floor(wp.x / CELL);
    const gy = Math.floor(wp.y / CELL);
    const dx = gx - player.gx;
    const dy = gy - player.gy;
    const perception = effectivePerception(player);
    if (dx * dx + dy * dy > perception * perception) return;
    const { rx, ry, lx, ly } = globalToLocal(gx, gy);
    const interior = world.biomeInteriors[regionKey(rx, ry)];
    if (!interior) return;
    if (isLocalObstacle(interior, lx, ly)) return;

    let label: string | null = null;
    const npc = world.npcs.find((n) => {
      if (n.rx !== rx || n.ry !== ry) return false;
      if (n.interior) return n.interior.lx === lx && n.interior.ly === ly;
      return false;
    });
    if (npc) {
      const faction = FACTIONS.find((f) => f.id === npc.factionId);
      label = faction ? `${npc.name} of ${faction.name}` : npc.name;
    } else {
      const resource = resourceAtLocal(interior, lx, ly);
      if (resource) label = RESOURCES[resource.kind].label;
    }
    if (!label) return;

    if (this.peekText) {
      this.peekText.destroy();
      this.peekText = null;
    }
    const center = tileCenter(gx, gy);
    const text = this.add.text(center.x, center.y - 18, label, {
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      fontSize: "11px",
      color: "#2c2820",
      backgroundColor: "#fbf6ed",
      padding: { x: 4, y: 2 },
    });
    text.setOrigin(0.5, 1);
    text.setDepth(12);
    this.peekText = text;
    this.tweens.add({
      targets: text,
      alpha: { from: 1, to: 0 },
      duration: 1500,
      ease: "Cubic.easeOut",
      onComplete: () => {
        text.destroy();
        if (this.peekText === text) this.peekText = null;
      },
    });
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
      const tappedVisitor = this.hitVisitorAt(world.x, world.y);
      const store = useGameStore.getState();
      if (tappedVisitor) {
        store.openNpcContextMenu(tappedVisitor, pointer.x, pointer.y);
      } else {
        const gx = Math.floor(world.x / CELL);
        const gy = Math.floor(world.y / CELL);
        const { rx, ry, lx, ly } = globalToLocal(gx, gy);
        const player = store.world?.life?.player;
        const dxp = player ? gx - player.gx : 0;
        const dyp = player ? gy - player.gy : 0;
        const perception = player ? effectivePerception(player) : 0;
        const visible = player ? dxp * dxp + dyp * dyp <= perception * perception : false;
        const interior = store.world?.biomeInteriors[regionKey(rx, ry)];
        const kind = visible && interior ? obstacleKindAt(interior, lx, ly) : null;
        store.closeNpcContextMenu();
        if (kind) {
          store.openObstacleContextMenu(rx, ry, lx, ly, kind, pointer.x, pointer.y, false);
        } else {
          store.closeObstacleContextMenu();
          store.walkPlayerTo(gx, gy);
        }
      }
    }

    this.cancelLongPress();
    this.dragStart = null;
    this.dragMoved = false;
    this.pinchInitial = null;
  }

  private onWheel(_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) {
    if (this.gameOver()) return;
    const minZ = 0.6 * this.dpr;
    const maxZ = 2.5 * this.dpr;
    const zoom = Phaser.Math.Clamp(this.cameras.main.zoom - dy * 0.001, minZ, maxZ);
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

function tileCenter(gx: number, gy: number): { x: number; y: number } {
  return { x: gx * CELL + CELL / 2, y: gy * CELL + CELL / 2 };
}

function fillPolygon(g: Phaser.GameObjects.Graphics, pts: ReadonlyArray<readonly [number, number]>) {
  if (pts.length === 0) return;
  const first = pts[0]!;
  g.beginPath();
  g.moveTo(first[0], first[1]);
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i]!;
    g.lineTo(p[0], p[1]);
  }
  g.closePath();
  g.fillPath();
}

function computeTileColor(gx: number, gy: number, biome: Biome): number {
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
