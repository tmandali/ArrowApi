# Auth — SMS OTP Giriş

Telefon numarası + SMS doğrulama koduyla (OTP) giriş. NextAuth v5
**credentials** provider olarak kuruludur; OAuth akışlarıyla (Keycloak,
Google, Google One Tap) aynı koşullu register desenini kullanır.

## Dosya Haritası

| Dosya | Rol |
| --- | --- |
| `lib/auth.ts` | `smsOtpProvider` tanımı + koşullu register + jwt `1c` branch'i + session `phone` eşlemesi |
| `lib/sms-otp.ts` | Saf yardımcılar: `normalizePhone` (E.164), `hashSmsCode` (SHA-256), `generateSmsCode`, saatlik limit haritası — **bağımlılıksız**, test sürecinde DB açmaz |
| `lib/sms-otp-store.ts` | DB operasyonları: `requestSmsCode` / `verifySmsOtp` + SMS dispatch (`console` \| `twilio`) — server-only, asla client'tan import edilmez |
| `lib/sms-otp.test.ts` | Saf yardımcıların birim testleri (`npx tsx --test`) |
| `components/sms-otp-sign-in.tsx` | Sign-in kartındaki 2 adımlı form (telefon → kod); provider env kapalıysa kendini gizler |
| `components/provider-buttons.tsx` | `sms-otp`'yu `HIDDEN_PROVIDER_IDS`'e alır (fallback buton çifti çizilmesin) + formu listeye ekler |
| `app/api/sms/request/route.ts` | `POST /api/sms/request` — kod üret + dispatch |
| `server/db/schema.ts` (`sms_codes`) | Kod saklama tablosu; migration: `migrations/0004_bizarre_thaddeus_ross.sql` |
| `src/proxy.ts` | `/api/sms` istisna listesinde — endpoint sign-in **öncesi** çağrılır, session gerektirmez |

## Akış

```
┌─ Adım 1: Kod istek ────────────────────────────────────────────────┐
│  [SmsOtpSignIn] ──POST /api/sms/request {phone}──▶ route          │
│      1. normalizePhone → E.164 (+905XXXXXXXXX)                     │
│      2. saatlik limit (bellek haritası, ≤10/1s)                   │
│      3. 30 sn gönderim aralığı (DB last_send_at)                   │
│      4. 6 haneli kod üret → SHA-256(phone:code) → sms_codes upsert│
│      5. dispatch (SMS_PROVIDER: console \| twilio)                 │
│      6. dispatch başarısız → bekleyen kod SİLİNİR, 503            │
└────────────────────────────────────────────────────────────────────┘
┌─ Adım 2: Doğrulama ────────────────────────────────────────────────┐
│  [SmsOtpSignIn] ──signIn("sms-otp",{phone,code})──▶                │
│      NextAuth credentials authorize:                               │
│        verifySmsOtp → TTL + deneme limiti (5) + hash eşleşmesi     │
│        ✓ → user {id: phone, phone}  (sub = telefon)               │
│        ✗ → null → /sign-in?error=CredentialsSignin                │
│      jwt callback 1c: token.provider="sms", access/refresh temizlenir│
│      session: user.phone = E.164                                   │
│                                                                    │
│  Giriş sonrası: ensure-user → user_identities'e guest satır açılır│
│      (provider="sms", provider_id=E.164 telefon)                   │
│      app_users'a DOKUNULMAZ — yetkilendirme yalnız admin akışı    │
└────────────────────────────────────────────────────────────────────┘
```

Kimlik modeliyle uyum: `sessionIdentity(session)` → `(sms, telefon)`;
identity satırı diğer provider'larda olduğu gibi giriş SONRASI otomatik
açılır, `authorize` kullanıcı tablosuna yazmaz.

## Ortam Değişkenleri

| Env | Açıklama |
| --- | --- |
| `AUTH_SMS_OTP_ENABLED=true` | Provider'ı koşullu register eder (env yoksa form UI'da görünmez) |
| `SMS_PROVIDER` | `console` (varsayılan, dev — kod terminal log'una basılır, **gerçek SMS gitmez**) \| `twilio` |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM` | Yalnız `twilio` modunda gerekli; REST ile gönderim, ek bağımlılık yok |

Dev ergonomisi: `console` modunda + development build'de
`POST /api/sms/request` yanıtı `lastCode` alanı taşır (üretimde asla).

## Güvenlik Kuralları

- Ham kod disk'e yazılmaz; `code_hash` = SHA-256(`<phone>:<code>`)
- Kod başına 5 deneme; limit aşılınca kod **iptal edilir** (yeni istek gerekir — brute-force kapanır)
- 5 dk TTL; süresi dolan satırlar her istekte fırsatçı GC edilir
- 30 sn ardışık gönderim aralığı **DB tabanlı** (çok instance'ta tutarlı)
- Saatlik 10 kod limiti modül içi bellek haritasında — **dahili tek
  instance** varsayar; ölçeklenirse `sms_codes`'a saatlik sayaç kolonu
  ekleyerek DB'ye taşınmalı
- `/api/sms/request` public'tir; koruması yukarıdaki rate-limit katmanlarıdır
- Production'a geçiş: `SMS_PROVIDER=twilio` + `TWILIO_*` env'leri
  doldurmak yeter; kod değişmez

## Sınırlar / Notlar

- `normalizePhone` TR merkezlidir: `5XXXXXXXXX` / `05XXXXXXXXX` → `+90`,
  `905XXXXXXXXX` → `+90`; uluslararası biçim `+`/`00` + 8–15 hane
- Konsol modundaki `lastCode` yalnız dev build'de döner; production'da
  API bunu taşımaz
- Bir telefon için aynı anda yalnızca 1 bekleyen kod vardır (yeni
  istek eski kodu geçersiz kılar)

## Testler

```bash
# Saf yardımcılar (normalize / hash / kod üretimi / saatlik limit)
npx tsx --require ./scripts/register-md.cjs --test src/features/auth/lib/sms-otp.test.ts

# El ile uçtan uca (dev, console modu):
curl -X POST http://localhost:56402/api/sms/request \
  -H 'Content-Type: application/json' -d '{"phone":"5551234567"}'
# → {"ok":true,"lastCode":"862606"}; 2. çağrı → 429 (gap)
```
