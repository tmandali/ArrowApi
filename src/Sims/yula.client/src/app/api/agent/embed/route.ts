import { embed, embedMany } from "ai";
import { getYulaEmbeddingModel, getYulaProviderInfo } from "@/lib/yula-provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      text?: string;
      texts?: string[];
      model?: string;
    };

    const { text, texts, model } = body ?? {};
    const embeddingModel = getYulaEmbeddingModel(model);
    const providerInfo = getYulaProviderInfo();

    if (Array.isArray(texts) && texts.length > 0) {
      const validTexts = texts.map((t) => (t && t.trim().length > 0 ? t.trim() : " "));
      const result = await embedMany({
        model: embeddingModel,
        values: validTexts,
      });

      return Response.json({
        embeddings: result.embeddings,
        dimension: result.embeddings[0]?.length ?? providerInfo.vectorDimension,
        provider: providerInfo.provider,
      });
    }

    if (typeof text === "string") {
      const trimmed = text.trim();
      if (!trimmed) {
        return Response.json({
          embedding: new Array(providerInfo.vectorDimension).fill(0),
          dimension: providerInfo.vectorDimension,
          provider: providerInfo.provider,
        });
      }

      const result = await embed({
        model: embeddingModel,
        value: trimmed,
      });

      return Response.json({
        embedding: result.embedding,
        dimension: result.embedding.length,
        provider: providerInfo.provider,
      });
    }

    return Response.json({ error: "text or texts parameter is required" }, { status: 400 });
  } catch (error) {
    console.error("🤖 [Yula Embed API Error]:", error);
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Embedding generation failed",
      },
      { status: 500 },
    );
  }
}
