# `POST /api/sms/request`

SMS OTP kod istek endpoint'i — telefon numarasına doğrulama kodu
üretir ve dispatch eder. Sign-in **öncesi** çağrılır, session
gerektirmez (`src/proxy.ts` istisna listesinde).

- Gövde: `{ phone: string }` (yerel 10 hane veya E.164)
- Yanıt: `200 { ok, lastCode? }` · `400 invalid_phone` ·
  `429 gap | hourly_limit` · `503 send_failed`

Detaylı dokümantasyon (akış, güvenlik kuralları, env, testler):
**[features/auth/README.md](../../../features/auth/README.md)** —
servis: `features/auth/lib/sms-otp-store.ts`,
provider: `lib/auth.ts` (`sms-otp` credentials).
