import { requestSmsCode, takeLastConsoleCode } from "@/features/auth/lib/sms-otp-store";

/**
 * `POST /api/sms/request` — SMS OTP kodu üret + gönder.
 *
 * Gövde: `{ phone: string }` (yerel 10 hane veya E.164; normalize
 * edilir — bkz. `normalizePhone`).
 *
 * Yanıt:
 *  - `200 { ok: true, lastCode? }` — `lastCode` YALNIZ `SMS_PROVIDER=console`
 *    (dev/test) iken ve `NODE_ENV !== "production"` iken eklenir; üretimde
 *    kod asla HTTP yanıtında taşınmaz.
 *  - `400 { ok: false, reason: "invalid_phone" }`
 *  - `429 { ok: false, reason: "gap" | "hourly_limit" }`
 *  - `503 { ok: false, reason: "send_failed" }` — SMS servisi
 *    ulaşılamadı / config eksik.
 *
 * Rate-limit katmanları: DB `last_send_at` (30 sn aralık, çok
 * instance'ta tutarlı) + modül içi saatlik limit (10) —
 * bkz. features/auth/lib/sms-otp.ts.
 */
export async function POST(req: Request) {
  let body: { phone?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, reason: "invalid_phone" }, { status: 400 });
  }

  const result = await requestSmsCode(body.phone);
  if (result.ok) {
    const payload: Record<string, unknown> = { ok: true };
    if (process.env.SMS_PROVIDER?.toLowerCase() === "console" && process.env.NODE_ENV !== "production") {
      const lastCode = takeLastConsoleCode();
      if (lastCode) payload.lastCode = lastCode;
    }
    return Response.json(payload);
  }

  const status =
    result.reason === "invalid_phone" ? 400 : result.reason === "send_failed" ? 503 : 429;
  return Response.json({ ok: false, reason: result.reason }, { status });
}
