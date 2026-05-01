"use client";

import { useEffect, useRef } from "react";

export default function PhaserGame() {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<unknown>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

    (async () => {
      const Phaser = (await import("phaser")).default;
      const { BootScene } = await import("@/lib/render/scenes/BootScene");
      const { WorldScene } = await import("@/lib/render/scenes/WorldScene");
      const { BiomeScene } = await import("@/lib/render/scenes/BiomeScene");

      if (cancelled || !containerRef.current) return;
      const container = containerRef.current;

      const cw = container.clientWidth;
      const ch = container.clientHeight;
      const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 3));

      const game = new Phaser.Game({
        // Canvas renderer instead of WebGL: mobile Safari aggressively
        // discards backgrounded WebGL contexts and doesn't always fire
        // webglcontextrestored, leaving the canvas black on tab return.
        // 2D canvas keeps state across visibility changes and is plenty
        // fast for our Graphics-only rendering.
        type: Phaser.CANVAS,
        parent: container,
        backgroundColor: "#f6f1e8",
        transparent: false,
        scale: {
          mode: Phaser.Scale.NONE,
          width: Math.floor(cw * dpr),
          height: Math.floor(ch * dpr),
        },
        render: {
          antialias: true,
          roundPixels: false,
          pixelArt: false,
        },
        scene: [BootScene, WorldScene, BiomeScene],
        input: {
          activePointers: 3,
        },
      });
      gameRef.current = game;

      // Phaser scales pointer events using canvas pixel size / CSS pixel size,
      // so pointer.x naturally lands in canvas-pixel coords. We CSS-size the
      // canvas to logical px and scale every scene's camera by DPR so 1
      // logical px == 1 sceneunit. Result: crisp text/edges on retina.
      const sizeCanvas = () => {
        const w = container.clientWidth;
        const h = container.clientHeight;
        const cur = Math.max(1, Math.min(window.devicePixelRatio || 1, 3));
        game.scale.setGameSize(Math.floor(w * cur), Math.floor(h * cur));
        game.canvas.style.width = `${w}px`;
        game.canvas.style.height = `${h}px`;
        game.canvas.style.touchAction = "none";
        game.registry.set("dpr", cur);
        game.events.emit("dprchange", cur);
      };
      game.registry.set("dpr", dpr);
      sizeCanvas();

      const onResize = () => sizeCanvas();
      window.addEventListener("resize", onResize);
      window.addEventListener("orientationchange", onResize);

      // Even with the Canvas renderer, the page can be evicted from memory
      // on iOS, so resize on visibility return as a safety net.
      const onVisibility = () => {
        if (document.visibilityState !== "visible") return;
        sizeCanvas();
      };
      document.addEventListener("visibilitychange", onVisibility);

      (gameRef as unknown as { teardown?: () => void }).teardown = () => {
        window.removeEventListener("resize", onResize);
        window.removeEventListener("orientationchange", onResize);
        document.removeEventListener("visibilitychange", onVisibility);
      };
    })();

    return () => {
      cancelled = true;
      const ref = gameRef as unknown as { teardown?: () => void };
      ref.teardown?.();
      const game = gameRef.current as { destroy?: (removeCanvas: boolean) => void } | null;
      game?.destroy?.(true);
      gameRef.current = null;
    };
  }, []);

  return <div ref={containerRef} className="absolute inset-0" />;
}
