import Phaser from "phaser";
import type { FactionShape } from "@/content/factions";

export type DrawShapeOpts = {
  stroke?: number;
  strokeColor?: number;
  alpha?: number;
};

// Shared faction-silhouette draws so World and Biome scenes stay visually
// aligned. Square is the player's reserved shape.
export function drawFactionShape(
  g: Phaser.GameObjects.Graphics,
  shape: FactionShape,
  color: number,
  cx: number,
  cy: number,
  size: number,
  opts: DrawShapeOpts = {},
): void {
  const alpha = opts.alpha ?? 1;
  const half = size / 2;
  g.fillStyle(color, alpha);
  switch (shape) {
    case "square": {
      const radius = Math.max(2, Math.floor(size / 5));
      g.fillRoundedRect(cx - half, cy - half, size, size, radius);
      if (opts.stroke) {
        g.lineStyle(opts.stroke, opts.strokeColor ?? 0xffffff, alpha);
        g.strokeRoundedRect(cx - half, cy - half, size, size, radius);
      }
      break;
    }
    case "triangle": {
      const h = size * 0.92;
      const ax = cx;
      const ay = cy - h * 0.55;
      const bx = cx - half;
      const by = cy + h * 0.45;
      const dx = cx + half;
      const dy = cy + h * 0.45;
      g.fillTriangle(ax, ay, bx, by, dx, dy);
      if (opts.stroke) {
        g.lineStyle(opts.stroke, opts.strokeColor ?? 0xffffff, alpha);
        g.strokeTriangle(ax, ay, bx, by, dx, dy);
      }
      break;
    }
    case "diamond": {
      const pts = [
        { x: cx, y: cy - half },
        { x: cx + half, y: cy },
        { x: cx, y: cy + half },
        { x: cx - half, y: cy },
      ];
      const poly = new Phaser.Geom.Polygon(pts);
      g.fillPoints(poly.points, true);
      if (opts.stroke) {
        g.lineStyle(opts.stroke, opts.strokeColor ?? 0xffffff, alpha);
        g.strokePoints(poly.points, true);
      }
      break;
    }
    case "hex": {
      const pts: Array<{ x: number; y: number }> = [];
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i + Math.PI / 6;
        pts.push({ x: cx + half * Math.cos(a), y: cy + half * Math.sin(a) });
      }
      const poly = new Phaser.Geom.Polygon(pts);
      g.fillPoints(poly.points, true);
      if (opts.stroke) {
        g.lineStyle(opts.stroke, opts.strokeColor ?? 0xffffff, alpha);
        g.strokePoints(poly.points, true);
      }
      break;
    }
  }
}
