/**
 * Node built-in test runner:
 *   npx tsx --test src/features/auth/lib/sms-otp.test.ts
 * SMS OTP saf yardımcılar: normalizePhone / hashSmsCode /
 * generateSmsCode / saatlik gönderim sınırları (saf — DB yok).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SMS_CODE_LENGTH,
  SMS_MAX_PER_HOUR,
  generateSmsCode,
  hashSmsCode,
  hourSendCount,
  normalizePhone,
  recordSend,
  resetSendHistory,
} from "./sms-otp.ts";

describe("normalizePhone", () => {
  it("10 haneli yerel biçimi (5 ile başlar) +90'la tamamlar", () => {
    assert.equal(normalizePhone("5551234567"), "+905551234567");
  });

  it("boşluk/nokta/parantez/dash giren yerel biçimi kabul eder", () => {
    assert.equal(normalizePhone(" 0(555) 123 4567 "), "+905551234567");
  });

  it("12 haneli 90-önlü biçimi +90'a çevirir", () => {
    assert.equal(normalizePhone("905551234567"), "+905551234567");
  });

  it("E.164'ü idempotent döndürür", () => {
    const e164 = "+905551234567";
    assert.equal(normalizePhone(e164), e164);
  });

  it("uluslararası biçimi (başka ülke) kabul eder", () => {
    assert.equal(normalizePhone("+14155552671"), "+14155552671");
    assert.equal(normalizePhone("0014155552671"), "+14155552671");
  });

  it("yanlış uzunlukta yerel sayıyı reddeder", () => {
    assert.equal(normalizePhone("1234567890"), null); // 5 ile başlamıyor
    assert.equal(normalizePhone("555123456"), null); // 9 hane
    assert.equal(normalizePhone("55512345678"), null); // 11 hane + 90 ile başlamıyor
  });

  it("E.164 uzunluk sınırlarını uygular (8-15 hane)", () => {
    assert.equal(normalizePhone("+123"), null); // kısa
    assert.equal(normalizePhone("+1234567890123456"), null); // 16 hane
  });

  it("geçersiz girdileri reddeder", () => {
    assert.equal(normalizePhone(null), null);
    assert.equal(normalizePhone(5551234567), null);
    assert.equal(normalizePhone("abc"), null);
    assert.equal(normalizePhone(""), null);
  });
});

describe("hashSmsCode", () => {
  it("deterministik hash üretir (aynı girdi → aynı sonuç)", () => {
    assert.equal(hashSmsCode("+905551234567", "123456"), hashSmsCode("+905551234567", "123456"));
  });

  it("telefon veya kod değişince hash değişir", () => {
    assert.notEqual(hashSmsCode("+905551234567", "123456"), hashSmsCode("+905551234567", "654321"));
    assert.notEqual(hashSmsCode("+905551234567", "123456"), hashSmsCode("+905551234568", "123456"));
  });

  it("hex'dir ve 64 karakterdir", () => {
    assert.match(hashSmsCode("+905551234567", "123456"), /^[0-9a-f]{64}$/);
  });
});

describe("generateSmsCode", () => {
  it("SMS_CODE_LENGTH haneli rakam üretir", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateSmsCode();
      assert.equal(code.length, SMS_CODE_LENGTH);
      assert.match(code, /^\d+$/);
    }
  });
});

describe("hourSendCount / recordSend", () => {
  it("yoksa 0 döner", () => {
    resetSendHistory();
    assert.equal(hourSendCount("+905551234567"), 0);
  });

  it("recordSend sayısı biriktirir ve sınırı gösterir", () => {
    resetSendHistory();
    const now = Date.now();
    for (let i = 0; i < SMS_MAX_PER_HOUR; i++) recordSend("+905551234567", now);
    assert.equal(hourSendCount("+905551234567", now + 1000), SMS_MAX_PER_HOUR);
  });

  it("1 saati geçen kayıtlar sayılmaz", () => {
    resetSendHistory();
    const now = Date.now();
    recordSend("+905551234567", now - 61 * 60_000); // 1 saatten eski
    assert.equal(hourSendCount("+905551234567", now), 0);
  });
});
