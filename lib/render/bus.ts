import mitt from "mitt";

export type GameEvents = {
  "npc:selected": { id: string };
  "npc:deselected": undefined;
  "world:tick": { ticks: number };
  "narration:request": { topic: string; context: string };
};

export const bus = mitt<GameEvents>();
