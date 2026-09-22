import { NextResponse } from "next/server";
import { generateText } from "ai";
import { getYulaLanguageModel } from "@/lib/yula-provider";
import {
  SUMMARIZATION_SYSTEM_PROMPT,
  SUMMARIZATION_PROMPT,
  UPDATE_SUMMARIZATION_PROMPT,
  generateLocalSummary,
  estimateTokens,
} from "@my-agent/core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { serializedText, previousSummary, model, customInstructions } = body ?? {};

    if (!serializedText || typeof serializedText !== "string") {
      return NextResponse.json({ error: "serializedText is required" }, { status: 400 });
    }

    const tokensBefore = estimateTokens(serializedText);

    const sysPrompt = customInstructions
      ? `${SUMMARIZATION_SYSTEM_PROMPT}\n\nEk Talimatlar:\n${customInstructions}`
      : SUMMARIZATION_SYSTEM_PROMPT;

    const basePrompt = previousSummary
      ? `<previous-summary>\n${previousSummary}\n</previous-summary>\n\n${serializedText}\n\n${UPDATE_SUMMARIZATION_PROMPT}`
      : `${serializedText}\n\n${SUMMARIZATION_PROMPT}`;

    let summary = "";

    try {
      const languageModel = getYulaLanguageModel(model);
      const { text } = await generateText({
        model: languageModel,
        system: sysPrompt,
        prompt: basePrompt,
      });

      if (text && text.trim()) {
        summary = text.trim();
      }
    } catch (llmErr) {
      console.warn("[Compact API] LLM summary failed, falling back to local summary:", llmErr);
    }

    // Fallback: Yerel kural-tabanlı yapılandırılmış özet
    if (!summary) {
      summary = generateLocalSummary(serializedText);
    }

    const estimatedTokensAfter = estimateTokens(summary);

    return NextResponse.json({
      summary,
      tokensBefore,
      estimatedTokensAfter,
    });
  } catch (err: any) {
    console.error("[Compact API Error]:", err);
    return NextResponse.json(
      { error: err?.message || String(err), summary: "" },
      { status: 500 },
    );
  }
}

