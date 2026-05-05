import Phaser from "phaser";
import { useGameStore } from "@/lib/state/game-store";
import {
  globalToLocal,
  INTERIOR_W,
  INTERIOR_H,
  lootAtLocal,
  obstacleKindAt,
  regionKey,
  resourceAtLocal,
  type BiomeInterior,
  type ObstacleKind,
} from "@/lib/sim/biome-interior";
import { hasTool } from "@/lib/sim/tools";
import { biomeAt } from "@/lib/sim/biome";
import { BIOMES } from "@/content/biomes";
import { RESOURCES, type ResourceKind } from "@/content/resources";
import { FACTIONS } from "@/content/factions";
import { ATLAS_KEY, type TileName } from "@/content/tiles";
import { frameKey, pickVariant, registerTileFrames } from "@/lib/render/tiles";
import type { Npc } from "@/lib/sim/npc";
import { effectivePerception, isBitmapTileDiscovered } from "@/lib/sim/fog";
import type { Player } from "@/lib/sim/player";

// 16-px atlas tiles drawn at 32-px logical so 2x integer scale stays crisp
// under DPR scaling. Origin (0, 0) of every chunk RT lands on a region
// boundary so chunks tile with zero gap.
const CELL = 32;
const PLAYER_SIZE = 24;
const NPC_SIZE = 22;
const VIEWPORT_PADDING_TILES = 10;
const VISIT_BUCKET_TICKS = 24;
const PAN_THRESHOLD_PX = 6;
const CHUNK_TILES = INTERIOR_W;
const CHUNK_PX = CHUNK_TILES * CELL;
const MAX_CACHED_CHUNKS = 12;

const COLORS = {
  bg: 0xf6f1e8,
  player: 0xd96846,
  selection: 0xd96846,
  routeDot: 0xd96846,
  shadow: 0x2c2820,
  outline: 0x2c2820,
};

const MATERIAL_ALPHA = 0.7;

type VisitorView = {
  body: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Ellipse;
  cx: number;
  cy: number;
  targetCx: number;
  targetCy: number;
  flashUntil: number;
  fading: boolean;
  tint: number;
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

type ChunkEntry = {
  // Container-of-Images per region. Each tile is a 16-px atlas frame
  // displayed at CELL px via setDisplaySize. Cheaper to manage than a
  // RenderTexture because there's no DynamicTexture command buffer to
  // reset across scene swaps — Phaser's Canvas renderer just iterates
  // the container's children each frame.
  container: Phaser.GameObjects.Container;
  // Reference-equality tags. Interior mutations follow an immutable pattern
  // (clearObstacle / removeResource / removeLoot / addLoot return new arrays),
  // so a single ref check is enough to know whether to repaint.
  obstacles: (ObstacleKind | null)[] | null;
  resources: BiomeInterior["resources"] | null;
  loot: BiomeInterior["loot"] | null;
  lastUsedTick: number;
};

export class BiomeScene extends Phaser.Scene {
  private chunkLayer!: Phaser.GameObjects.Container;
  private fogLayer!: Phaser.GameObjects.Graphics;
  private routeLayer!: Phaser.GameObjects.Graphics;
  private playerImage!: Phaser.GameObjects.Image;
  private playerShadow!: Phaser.GameObjects.Ellipse;
  private selectionRing!: Phaser.GameObjects.Graphics;
  private projectileLayer!: Phaser.GameObjects.Graphics;

  private chunks = new Map<string, ChunkEntry>();
  private visitorViews = new Map<string, VisitorView>();
  private visitorHits: VisitorHit[] = [];
  private prevNpcHealth = new Map<string, number>();
  private prevPlayerHealth = -1;
  private seenPickupIds = new Set<string>();

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

  private accumulator = 0;
  private readonly tickStepMs = 250;
  private dpr = 1;
  private longPressTimer: Phaser.Time.TimerEvent | null = null;
  private longPressFired = false;

  constructor() {
    super("Biome");
  }

  create() {
    this.dpr = (this.game.registry.get("dpr") as number) ?? 1;
    this.cameras.main.setBackgroundColor(COLORS.bg);

    // BootScene normally registers the atlas frames; if the player jumped
    // straight here (HMR, explicit scene.start) the frames may not be set up
    // yet. Idempotent — does nothing on subsequent calls.
    registerTileFrames(this);

    this.chunkLayer = this.add.container(0, 0);
    this.routeLayer = this.add.graphics();
    this.fogLayer = this.add.graphics();
    this.selectionRing = this.add.graphics();
    this.selectionRing.setVisible(false);
    this.playerShadow = this.add.ellipse(0, 0, PLAYER_SIZE * 0.7, PLAYER_SIZE * 0.18, COLORS.shadow, 0.22);
    this.playerImage = this.add
      .image(0, 0, ATLAS_KEY, frameKey("char"))
      .setOrigin(0.5, 0.85)
      .setDisplaySize(PLAYER_SIZE, PLAYER_SIZE);
    this.projectileLayer = this.add.graphics();

    // Layer ordering: chunks (ground+obstacles+resources+loot) → route →
    // player shadow/sprite → projectiles → selection → fog (top, occludes
    // everything outside the perception ring).
    this.chunkLayer.setDepth(0);
    this.routeLayer.setDepth(1);
    this.playerShadow.setDepth(2);
    this.playerImage.setDepth(3);
    this.projectileLayer.setDepth(4);
    this.selectionRing.setDepth(5);
    this.fogLayer.setDepth(6);

    this.cameras.main.setZoom(this.dpr);
    this.accumulator = 0;
    this.playerTransitionStart = 0;
    useGameStore.getState().setCameraPanned(false);
    this.visitorViews.clear();
    this.visitorHits = [];

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
  }

  shutdown() {
    this.scale.off("resize", this.handleResize, this);
    this.game.events.off("dprchange", this.onDprChange, this);
    for (const view of this.visitorViews.values()) {
      view.body.destroy();
      view.shadow.destroy();
    }
    this.visitorViews.clear();
    this.visitorHits = [];
    for (const entry of this.chunks.values()) entry.container.destroy(true);
    this.chunks.clear();
    this.prevPlayerHealth = -1;
    this.prevNpcHealth.clear();
    this.seenPickupIds.clear();
    this.cancelLongPress();
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

    if (!useGameStore.getState().cameraPanned) {
      this.cameras.main.centerOn(this.playerCx, this.playerCy);
    }

    const fog = this.computeFog(player, world);
    this.refreshChunks(world);
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

  private refreshChunks(world: {
    biomeInteriors: Record<string, BiomeInterior>;
    ticks: number;
  }) {
    const v = this.viewport();
    const rxMin = Math.floor(v.gxMin / INTERIOR_W);
    const rxMax = Math.floor(v.gxMax / INTERIOR_W);
    const ryMin = Math.floor(v.gyMin / INTERIOR_H);
    const ryMax = Math.floor(v.gyMax / INTERIOR_H);

    const visible = new Set<string>();
    for (let ry = ryMin; ry <= ryMax; ry++) {
      for (let rx = rxMin; rx <= rxMax; rx++) {
        const key = regionKey(rx, ry);
        visible.add(key);
        this.ensureChunk(rx, ry, world);
      }
    }

    // Keep chunks that are still in view + a small idle cache. Drop the
    // least-recently-used entries when over budget.
    if (this.chunks.size > MAX_CACHED_CHUNKS) {
      const entries = Array.from(this.chunks.entries())
        .filter(([key]) => !visible.has(key))
        .sort((a, b) => a[1].lastUsedTick - b[1].lastUsedTick);
      while (this.chunks.size > MAX_CACHED_CHUNKS && entries.length > 0) {
        const next = entries.shift()!;
        next[1].container.destroy(true);
        this.chunks.delete(next[0]);
      }
    }
  }

  private ensureChunk(
    rx: number,
    ry: number,
    world: { biomeInteriors: Record<string, BiomeInterior>; ticks: number },
  ) {
    const key = regionKey(rx, ry);
    const interior = world.biomeInteriors[key];
    let entry = this.chunks.get(key);
    const stale =
      entry &&
      (entry.obstacles !== (interior?.obstacles ?? null) ||
        entry.resources !== (interior?.resources ?? null) ||
        entry.loot !== (interior?.loot ?? null));
    if (!entry) {
      const container = this.add.container(rx * CHUNK_PX, ry * CHUNK_PX);
      this.chunkLayer.add(container);
      entry = {
        container,
        obstacles: null,
        resources: null,
        loot: null,
        lastUsedTick: world.ticks,
      };
      this.chunks.set(key, entry);
      this.paintChunk(entry, rx, ry, interior);
    } else if (stale) {
      this.paintChunk(entry, rx, ry, interior);
    }
    entry.lastUsedTick = world.ticks;
  }

  private paintChunk(
    entry: ChunkEntry,
    rx: number,
    ry: number,
    interior: BiomeInterior | undefined,
  ) {
    const { container } = entry;
    container.removeAll(true);
    const baseBiome = interior ? interior.biome : biomeAt(rx, ry);

    // Ground pass — every tile is its own Image child of the chunk
    // container. Container is positioned at the region's world origin so
    // tile (lx, ly) lives at child-local (lx * CELL, ly * CELL).
    for (let ly = 0; ly < INTERIOR_H; ly++) {
      for (let lx = 0; lx < INTERIOR_W; lx++) {
        const gx = rx * INTERIOR_W + lx;
        const gy = ry * INTERIOR_H + ly;
        const biome = interior ? baseBiome : biomeAt(gx, gy);
        const variant = pickVariant(BIOMES[biome].variants, gx, gy);
        const tile = this.add.image(0, 0, ATLAS_KEY, frameKey(variant));
        tile.setOrigin(0, 0);
        tile.setPosition(lx * CELL, ly * CELL);
        tile.setDisplaySize(CELL, CELL);
        container.add(tile);
      }
    }

    if (!interior) {
      entry.obstacles = null;
      entry.resources = null;
      entry.loot = null;
      return;
    }

    // Obstacles render on top of ground tiles via container child order.
    for (let ly = 0; ly < INTERIOR_H; ly++) {
      for (let lx = 0; lx < INTERIOR_W; lx++) {
        const kind = obstacleKindAt(interior, lx, ly);
        if (!kind) continue;
        const gx = rx * INTERIOR_W + lx;
        const gy = ry * INTERIOR_H + ly;
        const frame = obstacleFrame(kind, gx, gy);
        const sprite = this.add.image(0, 0, ATLAS_KEY, frameKey(frame));
        sprite.setOrigin(0, 0);
        sprite.setPosition(lx * CELL, ly * CELL);
        sprite.setDisplaySize(CELL, CELL);
        container.add(sprite);
      }
    }

    for (const r of interior.resources) {
      const meta = RESOURCES[r.kind];
      const sprite = this.add.image(0, 0, ATLAS_KEY, frameKey(meta.frame));
      sprite.setOrigin(0, 0);
      sprite.setPosition(r.lx * CELL, r.ly * CELL);
      sprite.setDisplaySize(CELL, CELL);
      sprite.setAlpha(meta.food ? 1 : MATERIAL_ALPHA);
      container.add(sprite);
    }

    for (const pile of interior.loot) {
      const sprite = this.add.image(0, 0, ATLAS_KEY, frameKey("loot_pile"));
      sprite.setOrigin(0, 0);
      sprite.setPosition(pile.lx * CELL, pile.ly * CELL);
      sprite.setDisplaySize(CELL, CELL);
      container.add(sprite);
    }

    entry.obstacles = interior.obstacles;
    entry.resources = interior.resources;
    entry.loot = interior.loot;
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
          if (!bitmap || !isBitmapTileDiscovered(bitmap, lx, ly)) {
            this.fogLayer.fillStyle(COLORS.bg, 1);
            this.fogLayer.fillRect(gx * CELL, gy * CELL, CELL, CELL);
            continue;
          }
          alpha = 0.55;
        }
        this.fogLayer.fillStyle(COLORS.bg, alpha);
        this.fogLayer.fillRect(gx * CELL, gy * CELL, CELL, CELL);
      }
    }
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
    if (this.seenPickupIds.size > 64) {
      const live = new Set(pickups.map((p) => p.id));
      for (const id of this.seenPickupIds) if (!live.has(id)) this.seenPickupIds.delete(id);
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
    const player = useGameStore.getState().world?.life?.player;
    const factionColor =
      FACTIONS.find((f) => f.id === player?.factionOfOriginId)?.color ?? COLORS.player;
    // Bob the sprite vertically while walking between tiles. Holding the
    // sprite still off-tick would feel lifeless on a slow speed; holding
    // through a 250 ms tile transition gives a clear walk cadence.
    const moving = this.playerTransitionStart !== 0;
    const bob = moving ? Math.sin(this.time.now * 0.018) * 1.6 : 0;
    this.playerImage.setPosition(this.playerCx, this.playerCy + PLAYER_SIZE * 0.35 + bob);
    this.playerImage.setTint(factionColor);
    this.playerShadow.setPosition(this.playerCx, this.playerCy + PLAYER_SIZE * 0.42);
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
        const shadow = this.add.ellipse(
          target.x,
          target.y + NPC_SIZE * 0.42,
          NPC_SIZE * 0.7,
          NPC_SIZE * 0.18,
          COLORS.shadow,
          0.22,
        );
        shadow.setDepth(2);
        const body = this.add
          .image(target.x, target.y + NPC_SIZE * 0.35, ATLAS_KEY, frameKey("char"))
          .setOrigin(0.5, 0.85)
          .setDisplaySize(NPC_SIZE, NPC_SIZE);
        body.setDepth(3);
        view = {
          body,
          shadow,
          cx: target.x,
          cy: target.y,
          targetCx: target.x,
          targetCy: target.y,
          flashUntil: 0,
          fading: false,
          tint: 0,
        };
        this.visitorViews.set(npc.id, view);
      } else if (view.fading) {
        this.tweens.killTweensOf(view.body);
        this.tweens.killTweensOf(view.shadow);
        view.body.setAlpha(1);
        view.shadow.setAlpha(0.22);
        view.fading = false;
      }
      view.targetCx = target.x;
      view.targetCy = target.y;
      view.cx += (view.targetCx - view.cx) * 0.18;
      view.cy += (view.targetCy - view.cy) * 0.18;

      const flashing = this.time.now < view.flashUntil;
      const tint = flashing ? 0xffffff : npc.factionColor;
      if (tint !== view.tint) {
        view.body.setTint(tint);
        view.tint = tint;
      }
      const distSq =
        (view.targetCx - view.cx) * (view.targetCx - view.cx) +
        (view.targetCy - view.cy) * (view.targetCy - view.cy);
      const bob = distSq > 0.5 ? Math.sin(this.time.now * 0.018 + view.cx * 0.05) * 1.4 : 0;
      view.body.setPosition(view.cx, view.cy + NPC_SIZE * 0.35 + bob);
      view.shadow.setPosition(view.cx, view.cy + NPC_SIZE * 0.42);
      hits.push({ id: npc.id, x: view.cx, y: view.cy, half: NPC_SIZE / 2 + 14 });
    }

    for (const [id, view] of this.visitorViews) {
      if (seen.has(id) || view.fading) continue;
      view.fading = true;
      this.tweens.add({
        targets: [view.body, view.shadow],
        alpha: 0,
        duration: 250,
        ease: "Cubic.easeOut",
        onComplete: () => {
          view.body.destroy();
          view.shadow.destroy();
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
    this.longPressFired = false;
    const startX = pointer.x;
    const startY = pointer.y;
    this.longPressTimer = this.time.delayedCall(600, () => {
      this.longPressTimer = null;
      if (this.dragMoved) return;
      this.openContextMenuAt(startX, startY);
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
        useGameStore.getState().setCameraPanned(true);
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

  private flashTapRing(wx: number, wy: number, color: number) {
    const ring = this.add.graphics();
    ring.setDepth(8);
    let progress = 0;
    this.tweens.add({
      targets: { v: 0 },
      v: 1,
      duration: 380,
      ease: "Cubic.easeOut",
      onUpdate: (tween) => {
        progress = tween.progress;
        ring.clear();
        const radius = 4 + progress * 22;
        ring.lineStyle(2.5, color, 0.9 * (1 - progress));
        ring.strokeCircle(wx, wy, radius);
      },
      onComplete: () => ring.destroy(),
    });
  }

  private openContextMenuAt(screenX: number, screenY: number) {
    const store = useGameStore.getState();
    const world = store.world;
    if (!world?.life) return;
    const player = world.life.player;
    const wp = this.cameras.main.getWorldPoint(screenX, screenY);
    const tappedVisitor = this.hitVisitorAt(wp.x, wp.y);
    if (tappedVisitor) {
      this.flashTapRing(wp.x, wp.y, COLORS.outline);
      store.openNpcContextMenu(tappedVisitor, screenX, screenY);
      this.longPressFired = true;
      return;
    }
    const gx = Math.floor(wp.x / CELL);
    const gy = Math.floor(wp.y / CELL);
    const dx = gx - player.gx;
    const dy = gy - player.gy;
    const perception = effectivePerception(player);
    if (dx * dx + dy * dy > perception * perception) return;
    const { rx, ry, lx, ly } = globalToLocal(gx, gy);
    const interior = world.biomeInteriors[regionKey(rx, ry)];
    if (!interior) return;
    const kind = obstacleKindAt(interior, lx, ly);
    if (!kind) return;
    this.flashTapRing(wp.x, wp.y, COLORS.outline);
    store.openObstacleContextMenu(rx, ry, lx, ly, kind, screenX, screenY, false);
    this.longPressFired = true;
  }

  private onPointerUp(pointer: Phaser.Input.Pointer) {
    if (this.gameOver()) {
      this.dragStart = null;
      this.dragMoved = false;
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
      this.flashTapRing(world.x, world.y, COLORS.routeDot);
      const tappedVisitor = this.hitVisitorAt(world.x, world.y);
      const store = useGameStore.getState();
      if (tappedVisitor) {
        store.closeNpcContextMenu();
        store.closeObstacleContextMenu();
        store.selectNpc(tappedVisitor);
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
        const resource = visible && interior ? resourceAtLocal(interior, lx, ly) : null;
        const loot = visible && interior ? lootAtLocal(interior, lx, ly) : null;
        store.closeNpcContextMenu();
        store.closeObstacleContextMenu();
        if (kind) {
          const action = defaultObstacleAction(kind);
          if (action === "harvest" && player) {
            const need: "axe" | "pickaxe" =
              kind === "tree" ? "axe" : "pickaxe";
            if (!hasTool(player.tools, need)) {
              store.pushStatus(`You need ${needArticle(need)}.`);
              store.walkPlayerTo(gx, gy);
            } else {
              store.interactWithObstacle(rx, ry, lx, ly, action);
            }
          } else if (action) {
            store.interactWithObstacle(rx, ry, lx, ly, action);
          } else {
            store.walkPlayerTo(gx, gy);
          }
        } else if (loot) {
          store.pickupLootAt(rx, ry, lx, ly, loot.id);
        } else if (resource) {
          store.collectResourceAt(rx, ry, lx, ly, resource.id);
        } else {
          store.walkPlayerTo(gx, gy);
        }
      }
    }

    this.cancelLongPress();
    this.dragStart = null;
    this.dragMoved = false;
    this.longPressFired = false;
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

function defaultObstacleAction(
  kind: ObstacleKind,
): "harvest" | "workbench" | null {
  switch (kind) {
    case "tree":
    case "rock":
      return "harvest";
    case "workbench":
      return "workbench";
    case "cactus":
    case "bush":
      return null;
  }
}

function needArticle(tool: "axe" | "pickaxe"): string {
  return tool === "axe" ? "an axe" : "a pickaxe";
}

function obstacleFrame(kind: ObstacleKind, gx: number, gy: number): TileName {
  switch (kind) {
    case "tree":
      return pickVariant(["tree_oak", "tree_pine"] as const, gx, gy);
    case "rock":
      return pickVariant(["rock_a", "rock_b"] as const, gx, gy);
    case "cactus":
      return "cactus";
    case "bush":
      return "bush";
    case "workbench":
      return "workbench";
  }
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

function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
