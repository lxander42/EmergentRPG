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
        type: Phaser.AUTO,
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

      // Mobile browsers commonly drop the WebGL context when the tab is
      // backgrounded. Without these the canvas stays black on return.
      const onVisibility = () => {
        if (document.visibilityState !== "visible") return;
        sizeCanvas();
        // Restart the active scene to force a clean redraw with current state.
        const scenes = game.scene.getScenes(true);
        for (const s of scenes) {
          if (s.scene.key === "Boot") continue;
          s.scene.restart();
        }
      };
      document.addEventListener("visibilitychange", onVisibility);

      const onContextLost = (e: Event) => {
        e.preventDefault();
      };
      const onContextRestored = () => {
        sizeCanvas();
        const scenes = game.scene.getScenes(true);
        for (const s of scenes) {
          if (s.scene.key === "Boot") continue;
          s.scene.restart();
        }
      };
      game.canvas.addEventListener("webglcontextlost", onContextLost);
      game.canvas.addEventListener("webglcontextrestored", onContextRestored);

      // Stash teardown so cleanup below can call it.
      (gameRef as unknown as { teardown?: () => void }).teardown = () => {
        window.removeEventListener("resize", onResize);
        window.removeEventListener("orientationchange", onResize);
        document.removeEventListener("visibilitychange", onVisibility);
        game.canvas.removeEventListener("webglcontextlost", onContextLost);
        game.canvas.removeEventListener("webglcontextrestored", onContextRestored);
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
