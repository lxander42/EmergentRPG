import { streamNarration } from "@/lib/ai/narrator";
import { npcDialoguePrompt, type NpcContext } from "@/lib/ai/prompts";

export const runtime = "edge";

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response("ANTHROPIC_API_KEY is not configured", { status: 503 });
  }

  const body = (await req.json()) as { npc?: NpcContext; worldSummary?: string };
  if (!body.npc) {
    return new Response("Missing npc payload", { status: 400 });
  }

  const result = streamNarration(npcDialoguePrompt(body.npc, body.worldSummary ?? ""));
  return result.toTextStreamResponse();
}
