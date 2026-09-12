import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Provider keşfi için beklenecek azami süre — buton tıklaması takılmasın. */
const HEALTH_TIMEOUT_MS = 2000;

/**
 * Self-hosted provider sağlığı (preflight) — sign-in kartı kullanır.
 *
 * Tarayıcıdan doğrudan istekmek yerine SERVER tarafında sorulur (CORS
 * bağımlılığı yok, timeout'a uyan istek garantili). Buton, self-hosted
 * provider'a (Keycloak) redirect'ten ÖNCE bu route'u çağırır; sunucu
 * ulaşılmıyorsa kullanıcı ölü sayfaya atılmaz, kartta anlamlı hata görür.
 *
 * Döndürülen:
 *   { provider, reachable, reason?: "unsupported" | "not-configured" | "unreachable", status?, latencyMs? }
 */
export async function GET(req: Request) {
  const provider = new URL(req.url).searchParams.get("provider") ?? "";

  // Şimdilik yalnız self-hosted Keycloak preflight'lanır. Google neredeyse
  // her zaman erişilebilir; yeni self-hosted provider eklenirse branch genişlet.
  if (provider !== "keycloak") {
    return NextResponse.json({ provider, reachable: false, reason: "unsupported" });
  }

  const issuer = process.env.KEYCLOAK_ISSUER;
  if (!issuer) {
    return NextResponse.json({ provider, reachable: false, reason: "not-configured" });
  }

  // OIDC discovery dokümanı en hafif canlılık kanıtıdır (auth istek yok).
  const discoveryUrl = `${issuer.replace(/\/+$/, "")}/.well-known/openid-configuration`;
  const started = performance.now();
  try {
    const res = await fetch(discoveryUrl, {
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
      cache: "no-store",
    });
    return NextResponse.json({
      provider,
      reachable: res.ok,
      status: res.status,
      latencyMs: Math.round(performance.now() - started),
    });
  } catch (error) {
    // Ağa ulaşılamadı / timeout — hata türü detaya işlenir (log sadece).
    console.warn(`[provider-health] keycloak keşfi başarısız:`, error instanceof Error ? error.message : error);
    return NextResponse.json({
      provider,
      reachable: false,
      reason: "unreachable",
      latencyMs: Math.round(performance.now() - started),
    });
  }
}
