import { anthropic } from "@ai-sdk/anthropic";
import { streamText } from "ai";
import { WORLD_BIBLE } from "@/lib/ai/prompts";

// Default model: Sonnet for cost/latency. Swap to Opus for major world events.
export const DEFAULT_MODEL = "claude-sonnet-4-6";
export const HEAVY_MODEL = "claude-opus-4-7";

export function streamNarration(prompt: string, opts: { heavy?: boolean } = {}) {
  const model = opts.heavy ? HEAVY_MODEL : DEFAULT_MODEL;
  return streamText({
    model: anthropic(model),
    system: WORLD_BIBLE,
    prompt,
    maxOutputTokens: 320,
    temperature: 0.85,
  });
}
