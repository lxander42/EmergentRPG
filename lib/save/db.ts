import Dexie, { type Table } from "dexie";
import type { World } from "@/lib/sim/world";

export type SaveRow = {
  slot: string;
  world: World;
  savedAt: number;
};

class EmergentDB extends Dexie {
  saves!: Table<SaveRow, string>;

  constructor() {
    super("emergentrpg");
    this.version(1).stores({
      saves: "slot, savedAt",
    });
  }
}

let _db: EmergentDB | null = null;
function db(): EmergentDB {
  if (typeof window === "undefined") {
    throw new Error("Dexie is only available in the browser");
  }
  if (!_db) _db = new EmergentDB();
  return _db;
}

export async function saveWorld(slot: string, world: World): Promise<void> {
  await db().saves.put({ slot, world, savedAt: Date.now() });
}

export async function loadWorld(slot: string): Promise<World | null> {
  if (typeof window === "undefined") return null;
  const row = await db().saves.get(slot);
  return row?.world ?? null;
}

export async function hasSave(slot: string): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    const row = await db().saves.get(slot);
    return !!row;
  } catch {
    return false;
  }
}
