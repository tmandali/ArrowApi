/**
 * SMS OTP — SAF yardımcılar (bağımlılıksız, test süresinde DB açmaz).
 *
 * DB tabanlı operasyonlar (`requestSmsCode` / `verifySmsOtp`)
 * `./sms-otp-store.ts`'ta yaşar — oradan bu modülün export'ları
 * convenience için re-export edilir.
 *
 * Güvenlik kuralları (detay: sms-otp-store.ts + schema.ts `sms_codes`):
 *  - Kod disk'e ham olarak ASLA yazılmaz; hash = SHA-256(`<phone>:<code>`).
 *  - Kod başına MAX_ATTEMPTS (5) deneme; gönderim aralığı ~30 sn
 *    (DB `last_send_at`); saatlik üst limit modül içi bellek haritasında
 *    (dahili tek instance varsayar).
 *  - Kod TTL 5 dk.
 */
import { createHash, randomInt } from "node:crypto";

// ── Sabitler ────────────────────────────────────────────────────────────────

/** Kod uzunluğu (rakam). */
export const SMS_CODE_LENGTH = 6;
/** Kod geçerlilik süresi (ms). */
export const SMS_CODE_TTL_MS = 5 * 60_000;
/** Kod başına doğrulama deneme limiti. */
export const SMS_MAX_ATTEMPTS = 5;
/** Ardışık kod gönderimleri arası minimum süre (ms). */
export const SMS_MIN_SEND_GAP_MS = 30_000;
/** Telefon başına saatlik kod gönderim limiti. */
export const SMS_MAX_PER_HOUR = 10;

// ── Saf yardımcılar ─────────────────────────────────────────────────────────

/**
 * Girilen telefon numarasını E.164'e normalize eder.
 *
 * Kurallar (TR merkezli uygulama — yerel biçimler +90 kabul edilir):
 *  - `5XXXXXXXXX` (10 hane) veya `05XXXXXXXXX` (0-önlü yerel) → `+905...`
 *  - `905XXXXXXXXX` (12 hane: 90 + 10 haneli yerel numara) → `+905...`
 *  - `+` veya ön `00` ile başlayan uluslararası biçim → rakamlar
 *    alınır, `+` öne konur (8-15 hane).
 *  - Geçersiz → null.
 */
export function normalizePhone(input: unknown): string | null {
  if (typeof input !== "string") return null;
  let raw = input.replace(/[\s\-().]/g, "");
  let digits: string;
  let international = false;
  if (raw.startsWith("+") || raw.startsWith("00")) {
    international = true;
    digits = raw.replace(/^[+0]+/, "");
  } else {
    digits = raw;
  }
  if (!/^\d+$/.test(digits)) return null;
  if (!international) {
    if (digits.length === 11 && digits.startsWith("0")) {
      digits = digits.slice(1); // TR 0-önlü yerel biçim (05XXXXXXXXX)
    }
    if (digits.length === 10 && digits.startsWith("5")) {
      digits = "90" + digits;
    } else if (!(digits.length === 12 && digits.startsWith("90"))) {
      return null;
    }
  }
  if (digits.length < 8 || digits.length > 15) return null;
  return "+" + digits;
}

/** SHA-256(`<phone>:<code>`) — disk'e yazılan tek temsil. */
export function hashSmsCode(phone: string, code: string): string {
  return createHash("sha256").update(`${phone}:${code}`).digest("hex");
}

/** 6 haneli kriptografik rastgele kod üretir. */
export function generateSmsCode(): string {
  return randomInt(10 ** (SMS_CODE_LENGTH - 1), 10 ** SMS_CODE_LENGTH)
    .toString()
    .slice(0, SMS_CODE_LENGTH);
}

// ── Saatlik gönderim limiti (modül içi bellek haritası) ────────────────────

const sendHistory = new Map<string, number[]>;

/** `phone` için son 1 saatteki gönderim sayısı (süresi dolanları atar). */
export function hourSendCount(phone: string, nowMs: number = Date.now()): number {
  const stamps = sendHistory.get(phone);
  if (!stamps) return 0;
  const alive = stamps.filter((t) => nowMs - t < 60 * 60_000);
  if (alive.length !== stamps.length) sendHistory.set(phone, alive);
  return alive.length;
}

/** Yeni gönderim kaydını ekler (requestSmsCode başarısız kod sonrası çağrılır). */
export function recordSend(phone: string, nowMs: number = Date.now()): void {
  sendHistory.set(phone, [...(sendHistory.get(phone) ?? []), nowMs]);
}

/** Test ergonomisi: haritayı sıfırlar (yalnız test dosyaları çağırmalı). */
export function resetSendHistory(): void {
  sendHistory.clear();
}
