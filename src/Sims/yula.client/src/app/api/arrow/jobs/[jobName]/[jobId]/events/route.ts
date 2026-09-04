import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const backendUrl = process.env.BACKEND_URL ?? "http://localhost:5168";

/**
 * Job SSE köprüsü — Next dev rewrite proxy'si (`/api/:path*`) text/event-stream
 * yanıtlarını job bitene kadar buffer'layabildiği için events ucu dosya-sistemi
 * route handler olarak açılır ve upstream gövdesi akış halinde passthrough edilir.
 * (Dizi-formu rewrite dosya route'larından SONRA koşar; yalnız events yolu buradan geçer.)
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ jobName: string; jobId: string }> }
) {
  const { jobName, jobId } = await ctx.params;

  const forwardHeaders: Record<string, string> = {
    Accept: "text/event-stream",
  };
  const companyId = req.headers.get("x-company-id");
  if (companyId) {
    forwardHeaders["X-Company-Id"] = companyId;
  }

  let upstream: Response;
  try {
    upstream = await fetch(
      `${backendUrl}/api/arrow/jobs/${encodeURIComponent(jobName)}/${encodeURIComponent(jobId)}/events`,
      {
        headers: forwardHeaders,
        signal: req.signal,
        cache: "no-store",
      }
    );
  } catch (error) {
    if (req.signal.aborted) {
      return new Response(null, { status: 499 });
    }
    return new Response(
      `SSE upstream error: ${error instanceof Error ? error.message : String(error)}`,
      { status: 502 }
    );
  }

  if (!upstream.ok || !upstream.body) {
    return new Response(upstream.statusText || "SSE upstream failed", {
      status: upstream.status || 502,
    });
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
