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

      if (cancelled || !containerRef.current) return;

      const game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: containerRef.current,
        backgroundColor: "#f6f1e8",
        transparent: false,
        scale: {
          mode: Phaser.Scale.RESIZE,
          autoCenter: Phaser.Scale.CENTER_BOTH,
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        },
        scene: [BootScene, WorldScene],
        input: {
          activePointers: 3,
        },
      });
      gameRef.current = game;
    })();

    return () => {
      cancelled = true;
      const game = gameRef.current as { destroy?: (removeCanvas: boolean) => void } | null;
      game?.destroy?.(true);
      gameRef.current = null;
    };
  }, []);

  return <div ref={containerRef} className="absolute inset-0" />;
}
