/**
 * SMS OTP — DB tabanlı operasyonlar (server-only, Node runtime).
 *
 * Saf yardımcılar (`normalizePhone`, `hashSmsCode`, gönderim sınırları)
 * `./sms-otp.ts`'ta yaşar; bu modül `@/server/db/client` bağımlılığını
 * TAŞIR — asla client bileşeninden / test prosesinden import etme.
 *
 * Tüketenler:
 *  - `lib/auth.ts` → `verifySmsOtp` (sms-otp provider'ın authorize'ı)
 *  - `POST /api/sms/request` → `requestSmsCode`
 *
 * `sms_codes` tablosu (schema.ts):
 *  - PK `phone` (E.164): bir numara için en fazla 1 bekleyen kod.
 *  - `code_hash` = SHA-256(`<phone>:<code>`) — ham kod saklanmaz.
 *  - `attempts` kod başına deneme limiti (5); `last_send_at` ~30 sn
 *    gönderim aralığı (çok instance'ta tutarlı).
 */
import { eq, lt } from "drizzle-orm";
import { db } from "@/server/db/client";
import { smsCodesSchema } from "@/server/db/schema";
import {
  SMS_CODE_TTL_MS,
  SMS_MAX_ATTEMPTS,
  SMS_MAX_PER_HOUR,
  SMS_MIN_SEND_GAP_MS,
  generateSmsCode,
  hashSmsCode,
  hourSendCount,
  normalizePhone,
  recordSend,
} from "./sms-otp";

export {
  SMS_CODE_TTL_MS,
  SMS_MAX_ATTEMPTS,
  SMS_MAX_PER_HOUR,
  SMS_MIN_SEND_GAP_MS,
  hashSmsCode,
  normalizePhone,
} from "./sms-otp";

/** Konsol modunda loglanan son kod (dev/test; twilio'da her zaman null). */
let lastConsoleCode: string | null = null;

/**
 * Konsol modunda son üretilen kodu döndürür (dev/test ergonomisi).
 * `SMS_PROVIDER=console` değilse null döner.
 */
export function takeLastConsoleCode(): string | null {
  const v = lastConsoleCode;
  lastConsoleCode = null;
  return v;
}

/**
 * Süresi dolmuş satırları fırsatçı temizler (her istekte, düşük maliyet)
 * ve kod hiç gelmemiş gibi davranmayı garanti eder.
 */
async function purgeExpiredCodes(): Promise<void> {
  await db.delete(smsCodesSchema).where(lt(smsCodesSchema.expiresAt, new Date()));
}

export interface RequestSmsResult {
  ok: boolean;
  reason?: "invalid_phone" | "hourly_limit" | "gap" | "send_failed";
  /** YALNIZ `SMS_PROVIDER=console`'da — route production'da taşımaz. */
  lastCode?: string;
}

/**
 * Kod üretir → `sms_codes`'e hash'li yazar → `SMS_PROVIDER` üzerinden
 * dispatch (console | twilio). Gönderim başaramazsa bekleyen kod SİLİNİR.
 *
 * Rate-limit sıralaması (ucuz → pahalı):
 *  1. Saatlik limit (bellek haritası — instance başı).
 *  2. 30 sn aralık (DB `last_send_at` — instance'lardan bağımsız).
 */
export async function requestSmsCode(phoneInput: unknown): Promise<RequestSmsResult> {
  const phone = normalizePhone(phoneInput);
  if (!phone) return { ok: false, reason: "invalid_phone" };

  if (hourSendCount(phone) >= SMS_MAX_PER_HOUR) {
    return { ok: false, reason: "hourly_limit" };
  }

  await purgeExpiredCodes();

  const gapBefore = new Date(Date.now() - SMS_MIN_SEND_GAP_MS);
  const [existing] = await db
    .select({ lastSendAt: smsCodesSchema.lastSendAt })
    .from(smsCodesSchema)
    .where(eq(smsCodesSchema.phone, phone))
    .limit(1);
  if (existing && existing.lastSendAt.getTime() > gapBefore.getTime()) {
    return { ok: false, reason: "gap" };
  }

  const code = generateSmsCode();
  const expiresAt = new Date(Date.now() + SMS_CODE_TTL_MS);
  const now = new Date();

  await db
    .insert(smsCodesSchema)
    .values({
      phone,
      codeHash: hashSmsCode(phone, code),
      expiresAt,
      attempts: 0,
      sentAt: now,
      lastSendAt: now,
    })
    .onConflictDoUpdate({
      target: smsCodesSchema.phone,
      set: {
        codeHash: hashSmsCode(phone, code),
        expiresAt,
        attempts: 0,
        lastSendAt: now,
      },
    });

  const dispatch = await dispatchSms(phone, code);
  if (!dispatch.ok) {
    await db.delete(smsCodesSchema).where(eq(smsCodesSchema.phone, phone));
    return { ok: false, reason: "send_failed" };
  }

  recordSend(phone);
  lastConsoleCode = dispatch.provider === "console" ? code : null;

  return { ok: true, lastCode: dispatch.provider === "console" ? code : undefined };
}

export interface VerifySmsOtpResult {
  ok: boolean;
  /** Başarısız durumda her zaman "invalid_code" (kod hiç gelmedi mi
   *  sızıntısı üretmez); telefon normalize edilemediyse "invalid_phone". */
  reason?: "invalid_code" | "invalid_phone";
}

/**
 * Kod doğrulaması: satır var mı → TTL → deneme limiti → hash eşleşmesi.
 * Başarılınca satır SİLİNİR (tek kullanımlık). Deneme limiti aşılan
 * kod da SİLİNİR — taze kod istenmesi gerekir (brute-force kapanır).
 */
export async function verifySmsOtp(phoneInput: unknown, codeInput: unknown): Promise<VerifySmsOtpResult> {
  const phone = normalizePhone(phoneInput);
  if (!phone) return { ok: false, reason: "invalid_phone" };
  const normalized = typeof codeInput === "string" ? codeInput.trim() : "";
  if (!/^\d{4,8}$/.test(normalized)) return { ok: false, reason: "invalid_code" };

  await purgeExpiredCodes();

  const [row] = await db
    .select()
    .from(smsCodesSchema)
    .where(eq(smsCodesSchema.phone, phone))
    .limit(1);

  if (!row || row.expiresAt.getTime() < Date.now()) {
    if (row) await db.delete(smsCodesSchema).where(eq(smsCodesSchema.phone, phone));
    return { ok: false, reason: "invalid_code" };
  }

  if (row.attempts >= SMS_MAX_ATTEMPTS) {
    await db.delete(smsCodesSchema).where(eq(smsCodesSchema.phone, phone));
    return { ok: false, reason: "invalid_code" };
  }

  if (row.codeHash !== hashSmsCode(phone, normalized)) {
    await db
      .update(smsCodesSchema)
      .set({ attempts: row.attempts + 1 })
      .where(eq(smsCodesSchema.phone, phone));
    return { ok: false, reason: "invalid_code" };
  }

  await db.delete(smsCodesSchema).where(eq(smsCodesSchema.phone, phone));
  return { ok: true };
}

// ── SMS dispatch ────────────────────────────────────────────────────────────

/**
 * `SMS_PROVIDER` env'ine göre dispatch:
 *  - `console` (varsayılan, dev/test): kod terminal'e yazılır; GERÇEK
 *    SMS GİTMEZ.
 *  - `twilio`: REST ile gerçek SMS (TWILIO_ACCOUNT_SID +
 *    TWILIO_AUTH_TOKEN + TWILIO_FROM gerekli).
 */
async function dispatchSms(phone: string, code: string): Promise<{ ok: boolean; provider: "console" | "twilio" }> {
  const provider = (process.env.SMS_PROVIDER ?? "console").toLowerCase();

  if (provider === "twilio") {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_FROM;
    if (!sid || !authToken || !from) {
      console.error("[sms-otp] SMS_PROVIDER=twilio ama TWILIO_* env'leri eksik — gönderim atlandı");
      return { ok: false, provider: "twilio" };
    }
    try {
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${sid}:${authToken}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          To: phone,
          From: from,
          Message: `Yula doğrulama kodunuz: ${code}`,
        }),
      });
      if (!res.ok) {
        const body = (await res.text()).slice(0, 300);
        console.error(`[sms-otp] Twilio gönderim hatası: HTTP ${res.status} — ${body}`);
        return { ok: false, provider: "twilio" };
      }
      console.log(`[sms-otp] Twilio SMS gönderildi → ${phone}`);
      return { ok: true, provider: "twilio" };
    } catch (error) {
      console.error("[sms-otp] Twilio istisna:", error);
      return { ok: false, provider: "twilio" };
    }
  }

  console.log(`[sms-otp] (console modu) kod = ${code} → ${phone}`);
  return { ok: true, provider: "console" };
}
