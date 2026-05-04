export type ToolKind = "axe" | "pickaxe" | "basket" | "torch";

export type ToolMeta = {
  label: string;
  durability: number;
  swatch: string;
};

export type ToolInstance = {
  kind: ToolKind;
  usesLeft: number;
};

export const TOOLS: Record<ToolKind, ToolMeta> = {
  axe: { label: "Axe", durability: 30, swatch: "#8a6a4a" },
  pickaxe: { label: "Pickaxe", durability: 30, swatch: "#5e6675" },
  basket: { label: "Basket", durability: 999, swatch: "#b6a070" },
  torch: { label: "Torch", durability: 999, swatch: "#d99348" },
};

export const TOOL_KINDS: ToolKind[] = ["axe", "pickaxe", "basket", "torch"];

export function makeTool(kind: ToolKind): ToolInstance {
  return { kind, usesLeft: TOOLS[kind].durability };
}

export function hasTool(tools: ToolInstance[], kind: ToolKind): boolean {
  for (const t of tools) {
    if (t.kind === kind && t.usesLeft > 0) return true;
  }
  return false;
}

export function consumeToolUse(
  tools: ToolInstance[],
  kind: ToolKind,
): ToolInstance[] {
  let consumed = false;
  const out: ToolInstance[] = [];
  for (const t of tools) {
    if (!consumed && t.kind === kind && t.usesLeft > 0) {
      consumed = true;
      const next = t.usesLeft - 1;
      if (next > 0) out.push({ kind: t.kind, usesLeft: next });
      continue;
    }
    out.push(t);
  }
  return out;
}

export function basketCount(tools: ToolInstance[]): number {
  let n = 0;
  for (const t of tools) if (t.kind === "basket") n++;
  return n;
}
