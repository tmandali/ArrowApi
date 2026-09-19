import { NextResponse } from "next/server";
import { generateText } from "ai";
import { getYulaLanguageModel } from "@/lib/yula-provider";
import { SUMMARIZATION_SYSTEM_PROMPT, generateLocalSummary } from "@my-agent/core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { serializedText, model, customInstructions } = body ?? {};

    if (!serializedText || typeof serializedText !== "string") {
      return NextResponse.json({ error: "serializedText is required" }, { status: 400 });
    }

    const sysPrompt = customInstructions
      ? `${SUMMARIZATION_SYSTEM_PROMPT}\n\nEk Talimatlar:\n${customInstructions}`
      : SUMMARIZATION_SYSTEM_PROMPT;

    try {
      const languageModel = getYulaLanguageModel(model);
      const { text } = await generateText({
        model: languageModel,
        system: sysPrompt,
        prompt: `Aşağıdaki konuşma geçmişini özetle:\n\n${serializedText}`,
      });

      if (text && text.trim()) {
        return NextResponse.json({ summary: text.trim() });
      }
    } catch (llmErr) {
      console.warn("[Compact API] LLM summary failed, falling back to local summary:", llmErr);
    }

    // Fallback: Yerel kural-tabanlı yapılandırılmış özet
    const localSummary = generateLocalSummary(serializedText);
    return NextResponse.json({ summary: localSummary });
  } catch (err: any) {
    console.error("[Compact API Error]:", err);
    return NextResponse.json(
      { error: err?.message || String(err), summary: "" },
      { status: 500 },
    );
  }
}
