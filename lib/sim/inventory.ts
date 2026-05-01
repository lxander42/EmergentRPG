import type { ResourceKind } from "@/content/resources";

export type Inventory = Partial<Record<ResourceKind, number>>;
