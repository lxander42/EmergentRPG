import Phaser from "phaser";
import { useGameStore } from "@/lib/state/game-store";
import { preloadTiles, registerTileFrames } from "@/lib/render/tiles";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("Boot");
  }

  preload() {
    preloadTiles(this);
  }

  create() {
    registerTileFrames(this);
    const view = useGameStore.getState().view;
    this.scene.start(view === "biome" ? "Biome" : "World");
  }
}
