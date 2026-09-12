# ArrowApi Projesi İçin Referans Değerlendirmesi

Kaynak: `_review_Next-js-Boilerplate` projesi  
Hedef: `ArrowApi` (Next.js + Yula Client + .NET AspNetCore backend)

---

## 1. 🔐 Kimlik Doğrulama (Authentication)

### Boileroak'taki Mevcut Durum
- **Clerk** (`@clerk/nextjs` v7) ile tam entegre auth sistemi
- `/sign-in`, `/sign-up` sayfaları Clerk'ın otomatik route'ları
- Multi-provider destek: Magic Link, passkeys, OAuth (Google, GitHub, Facebook, Twitter, Apple vb.)
- MFA desteği Clerk üzerinden
- User impersonation Clerk Admin UI ile
- `<ClerkProvider>` wrapper ile tüm app tree'sine auth context aktarımı
- `ClerkLocalizations` ile çoklu dil desteği

### ArrowApi'deki Mevcut Durum
| Katman | Durum |
|--------|-------|
| **Frontend (`yula.client`)** | `(center)/login` layout'u var ama **sayfa içeriği yok** — placeholder |
| **Backend (`Arrow.Jobs.AspNetCore`)** | Sadece **API Key** auth (`ApiKeyAuthenticationHandler` / `StaticApiKeyAuthenticationHandler`). Kullanıcı kimlik doğrulaması yok |
| **DB Schema** | `app_users` tablosu (id, name, email, role, status) — **şifre/hash alanı yok** |
| **Auth servisi** | `features/auth/hooks/use-job-session.ts` — sadece job session sync, gerçek login yok |
| **Arsiv client** | Basit email+password login formu (stub), Google butonu placeholder |

### Değerlendirme

#### ✅ Passwordless Authentication with Magic Links
**ArrowApi için uygunluk: Yüksek**  
- `app_users` tablosunda `email` alanı zaten var; `VerifyEmailToken` + `MagicLinkToken` sütunları eklenerek uygulanabilir.
- Backend'de yeni bir endpoint (`POST /api/auth/magic-link`) + SMTP service (`Nodemailer` / AWS SES) gerekir.
- Clerk yerine kendi implementasyon kurmayı tercih ediyorsanız: `resend` + `@supabase/gotrue-js` pattern'i kullanılabilir.
- **Öneri:** Next.js route handler ile `/api/auth/magic-link` oluştur, token'ı DB'ye yaz, e-posta gönder, `/auth/verify?token=xxx` ile login yap.

#### ✅ Multi-Factor Auth (MFA)
**ArrowApi için uygunluk: Orta-Yüksek**  
- `app_users` tablosuna `mfaSecret`, `mfaEnabled` (bool) eklenebilir.
- TOTP implementasyonu için `speakeasy` veya `otplib` kullanılabilir.
- Backend'de 2. faktör doğrulama endpoint'i (`POST /api/auth/mfa/verify`) gerekli.
- **Öneri:** Login akışına 2. adım (TOTP code input) eklenmeli; `app_users.mfa_enabled` flag'i ile toggle edilmeli.

#### ⚠️ Social Auth (Google, Facebook, Twitter, GitHub, Apple)
**ArrowApi için uygunluk: Düşük (şu anki mimariye göre)**  
- API Key-based architecture (`X-API-Key` header) ve Clerk bağımlılığı yok.
- Social login eklemek için ya **Clerk entegrasyonu** (boileroak'a en yakın) ya da **NextAuth.js v5** (`@auth/core`) gibi bir çözüm gerekir.
- NextAuth.js tercih edilirse: `@auth/next` kurulumu, provider konfigürasyonu, DB adapter (DrizzleORM ile PostgreSQL) doğrudan uyumlu.
- **Öneri:** Eğer kullanıcı face-to-face web auth gerektiriyorsa **NextAuth.js v5** ile entegre edin; Clerk'a geçiş yapmak proje kapsamını büyük ölçüde değiştirir.

#### ✅ Passwordless login with Passkeys
**ArrowApi için uygunlik: Orta**  
- WebAuthn API'si tarayıcıda native destekleniyor.
- Backend'de `PublicKeyCredential` challenge-response akışı implement edilmeli.
- DB'de `app_users` tablosuna `credentialId` (text, unique), `publicKey` (text), `signCount` (int) eklenecek.
- **Öneri:** `@simplewebauthn/server` + `@simplewebauthn/browser` paketi ile implement edilebilir.

#### ⚠️ User Impersonation
**ArrowApi için uygunluk: Düşük**  
- Şu an `app_users` tablosu "demo seed" verisi içeriyor; real-time user management yok.
- Impersonation için admin paneli + session token generation gerekiyor.
- **Öneri:** Önce gerçek user auth implemented olunca, admin UI'da `Impersonate` butonu + `X-Impersonate-User-Id` header pattern'i uygulanabilir.

---

## 2. 📦 Type-safe ORM with DrizzleORM

### Boileroak'taki Mevcut Durum
- **Drizzle ORM v0.45** + **Drizzle Kit v0.31** aktif
- Schema: `src/models/Schema.ts` → `pgTable` ile PostgreSQL tanımları
- Migration: `npm run db:generate` → `npm run db:migrate`
- DB connection: `src/libs/DB.ts` → `drizzle({ client: pool, schema })`
- `drizzle.config.ts` → PostgreSQL dialect, strict mode
- DB Studio: `npm run db:studio` ile görsel yönetim

### ArrowApi'deki Mevcut Durum
| Dosya | İçerik |
|-------|--------|
| `src/server/db/schema.ts` | `userSettingsSchema` + `appUsersSchema` (pg-core) |
| `src/server/db/connection.ts` | `drizzle({ client: pool, schema })` — PostgreSQL Pool |
| `package.json` | `drizzle-orm`, `drizzle-kit` devDependencies'de |
| `.env` | `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/postgres` |

### Değerlendirme

#### ✅ Tam Uyumluluk
ArrowApi **zaten DrizzleORM kullanıyor** ve boileroak ile aynı stack'i paylaşıyor:
- Aynı `drizzle-orm` ve `drizzle-kit` versiyonları
- Aynı PostgreSQL dialect
- Aynı schema convention (`pgTable`, `text`, `timestamp`, `jsonb`)

#### ⚠️ Eksik/Genişletilmesi Gereken Alanlar
1. **Migration auto-apply**: Boilerplate'de `db-server:file` script'i ile local.db'ye migration otomatik uygulanıyor. ArrowApi'de `drizzle-kit migrate` manual çağrılmalı.
2. **Schema genişletme**: `app_users` tablosu şu an minimal. Auth gereksinimleri için ek alanlar (`hashedPassword`, `emailVerified`, `mfaSecret`, `passkeyData`, `lastLoginAt`) eklenmeli.
3. **DB Studio**: `npm run db:studio` komutu mevcut değil — package.json'a eklenmeli.
4. **Query builder type safety**: `app_users` CRD operation'ları `src/app/api/system/users/route.ts`'te manuel yazılmış; Drizzle'in type-safe query API'si (`eq`, `and`, `or`) ile refactor edilebilir (zaten `eq` kullanılıyor).

#### 📋 Önerilen Eylemler
```bash
# Migration workflow'ü standardize et
npm run db:generate  # schema değişikliklerinden sonra
npm run db:migrate   # migration apply
npm run db:studio    # görsel yönetim (opsiyonel)
```

---

## 3. 💽 Offline and Local Development Database with PGlite

### Boileroak'taki Mevcut Durum
- **`@electric-sql/pglite`** + **`@electric-sql/pglite-socket`** devDependencies'de
- `db-server:file` script: `pglite-server -m 100 --db=local.db --run 'npm run db:migrate'`
- `db-server:memory` script: memory mode local dev için
- `DBConnection.ts`: hem PGlite hem PostgreSQL için aynı `pg` protocol kullanılır
- **Not**: Prod'da gerçek Postgres URL'i, dev'de PGlite kullanılır

### ArrowApi'deki Mevcut Durum
| Paket | Durum |
|-------|-------|
| `drizzle-orm` | ✅ yüklü |
| `drizzle-kit` | ✅ yüklü |
| `@electric-sql/pglite-socket` | ✅ yüklü (devDependency) |
| `pglite-server` | ❌ **yüklü değil** |
| PGlite connection pattern | ❌ **implement edilmemiş** |
| `.env` | `DATABASE_URL=postgresql://...` (sadece gerçek Postgres) |

### Değerlendirme

#### ✅ Potansiyel: Yüksek
`@electric-sql/pglite-socket` zaten yüklü — bu, PGlite'in network socket üzerinden erişilebilir olmasını sağlar. Boilerplate'deki `pglite-server` pattern'i doğrudan uygulanabilir.

#### ⚠️ Eksik Adımlar
1. **`pglite-server` kurulumu**: `@electric-sql/pglite` package'ı ayrıca kurulmalı (`pglite-socket` complement'tir).
2. **DB connection abstraction**: `connection.ts` şu an sadece `node-postgres` Pool kullanıyor. PGlite için conditional logic eklenmeli:
   ```ts
   // src/server/db/connection.ts
   export const createDbConnection = () => {
     if (process.env.USE_PGLITE === 'true') {
       // PGlite WASM connection
       return drizzle({ client: pgliteClient, schema })
     }
     // Mevcut PostgreSQL Pool
     const pool = new Pool({ connectionString: Env.DATABASE_URL })
     return drizzle({ client: pool, schema })
   }
   ```
3. **NPM scripts ekle**:
   ```json
   "db-server:file": "pglite-server -m 100 --db=local.db --run 'npm run db:migrate'",
   "db-server:memory": "pglite-server -m 100 --run 'npm run db:migrate'",
   "db:studio": "drizzle-kit studio"
   ```
4. **Docker'sız local dev**: PGlite ile Docker Postgres gerektirmeden geliştirme yapılabilir.

#### 📋 Önerilen Uygulama Sırası
```bash
# 1. PGlite core'u kur
npm install -D @electric-sql/pglite

# 2. Connection.ts'yi güncelle (conditional PGlite/Postgres)
# 3. package.json'a db scripts ekle
# 4. .env'e USE_PGLITE=true ekle (local dev için)
# 5. npm run db:generate && npm run db:migrate
```

---

## Genel Özet Tablosu

| Özellik | Boilerplate | ArrowApi Mevcut | Uygulanabilirlik | Öncelik |
|---------|-------------|-----------------|------------------|---------|
| Magic Links | ✅ Clerk | ❌ Yok | ⭐⭐⭐ Yüksek | Yüksek |
| MFA | ✅ Clerk | ❌ Yok | ⭐⭐⭐ Yüksek | Yüksek |
| Social Auth | ✅ Clerk | ❌ Yok (stub) | ⭐⭐ Orta | Orta |
| Passkeys | ❌ Clerk'ın kısmi desteği var | ❌ Yok | ⭐⭐ Orta | Orta |
| User Impersonation | ✅ Clerk Admin | ❌ Yok | ⭐ Düşük | Düşük |
| DrizzleORM | ✅ v0.45 | ✅ v0.45 (aynı) | ⭐⭐⭐ Tam uyumlu | — |
| PGlite (offline db) | ✅ `pglite-server` | ⚠️ Packet var, implement yok | ⭐⭐⭐ Yüksek | Yüksek |

---

## Önerilen İlk Adımlar (Yüksek Öncelik)

1. **PGlite local dev desteği ekle** — mevcut `pglite-socket` paketi zaten var, minimum çabayla Docker'sız develop environment sağlanır.
2. **Drizzle schema'yı auth için genişlet** — `app_users` tablosuna `hashedPassword`, `emailVerified`, `mfaSecret` ekle.
3. **Magic Link auth endpoint'leri kur** — `POST /api/auth/magic-link` + `GET /api/auth/verify` + resend SMTP entegrasyonu.
4. **Login sayfasını tamamla** — `(center)/login` sayfasına Magic Link formu yerleştir.
