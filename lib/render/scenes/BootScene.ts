import Phaser from "phaser";
import { useGameStore } from "@/lib/state/game-store";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("Boot");
  }

  create() {
    const view = useGameStore.getState().view;
    this.scene.start(view === "home" ? "Home" : "World");
  }
}
