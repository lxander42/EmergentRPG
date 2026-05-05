import mitt from "mitt";

export type GameEvents = {
  "npc:selected": { id: string };
  "npc:deselected": undefined;
  "world:tick": { ticks: number };
};

export const bus = mitt<GameEvents>();
