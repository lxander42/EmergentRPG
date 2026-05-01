import mitt from "mitt";

export type GameEvents = {
  "npc:selected": { id: string };
  "npc:deselected": undefined;
  "world:tick": { ticks: number };
  "biome:panned": { panned: boolean };
  "biome:recenter": undefined;
};

export const bus = mitt<GameEvents>();
