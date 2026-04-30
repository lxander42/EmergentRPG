import { streamNarration } from "@/lib/ai/narrator";
import { narratePrompt } from "@/lib/ai/prompts";

export const runtime = "edge";

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response("ANTHROPIC_API_KEY is not configured", { status: 503 });
  }

  const body = (await req.json()) as { topic?: string; context?: string };
  const topic = body.topic ?? "an unremarkable moment";
  const context = body.context ?? "";

  const result = streamNarration(narratePrompt(topic, context));
  return result.toTextStreamResponse();
}
