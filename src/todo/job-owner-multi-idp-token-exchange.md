# Yula Job Owner — Multi-IdP Doğrulama & Provider-Agnostik Token Exchange

> Durum: **PLANLADI** — Sprint 1 (multi-issuer JWKS) bekleniyor; Sprint 2 (exchange) tasarımlı
> Sorumlu: TMR
> Son güncelleme: 2025-11
> İlgili kod: `src/Sims/Sims.Server/Program.cs`, `src/Arrow.Jobs.AspNetCore/ArrowJobEndpoints.cs`,
> `src/Sims/yula.client/src/lib/auth.ts`, `src/Sims/yula.client/src/lib/auth-headers.ts`,
> `src/Sims/yula.client/src/features/jobs/hooks/use-job-owners.ts`

---

## 0. Kök Sorun

Rapor job'larında panel "Kim başlattı?" satırını hep **"Sistem"** gösteriyor.

Zincir:
1. Backend (`ArrowJobEndpoints.StartJobAsync`, ~satır 247) owner'ı `httpContext.User`'ın
   `sub` claim'inden okur; user kimliksizse `OwnerId` bilinçli olarak `null` (tek kullanıcı
   dev fallback'i — kodda sabit string değil, fallback).
2. Client (`use-job-owners.ts`) `ownerId` falsy ise `label = "Sistem"` yazar.
3. `sub`'un null kalma sebebi: backend yalnız **Keycloak JwtBearer** doğruluyor;
   - Google One Tap session'ında client, Google'ın **ID token**'ını `accessToken` olarak
     session'a koyuyor (`lib/auth.ts` ~satır 215 — Google RFC 8693 exchange desteklemediği
     için). Bu token Keycloak JWKS'inde doğrulanamaz → anonymous → `ownerId: null`.
   - SMS OTP / provider'sız oturumda token hiç yok.
   - `Sims.Server` `Development` dışında koşarsa `Auth:KeycloakIssuer` boş → auth middleware
     hiç kurulmaz → her istek anonymous.

Sonuç: yalnız **Keycloak provider** + **Keycloak issuer'lı dev ortam** kombinasyonunda
owner dolduruluyor; diğer tüm senaryolarda "Sistem".

---

## 1. Mevcut Kod Tabanı Bulguları (zemin)

| Bulgu | Kaynak | Etkisi |
|---|---|---|
| `user_identities(provider, provider_id)` → uygulama kendi **stabil GUID'ı** (`user_id`) var; `ensure-user` upsert akışı mevcut | `yula.client/src/features/auth/lib/app-user-sync.ts` | Identity collision (#2)'nin cevabı hazır: token `sub`'una internal id yazılmalı |
| `/api/jobs/owners` `providerId`'ye göre lookup yapıyor; aynı sub 2 provider'da varsa ilk satır kazanıyor (ambiguity) | `yula.client/src/app/api/jobs/owners/route.ts` | Çift-lookup (legacy + internal id) migration gerekli |
| `StaticApiKeyAuthenticationExtensions` (`X-API-Key`) kütüphanede hazır ama **Sims.Server'da kayıtlı değil** | `src/Arrow.Jobs.AspNetCore/Authentication/` | Dev modu için hazır altyapı |
| `session.user.id` provider'a göre değişken: Keycloak sub / Google sub / phone | `yula.client/src/lib/auth.ts` | `myOwnerId` ↔ backend `sub` uyumsuzluğu ("Sen" senaryosu kapalı) |
| Client, job fetch'lerini `getCompanyHeaders()` → `getAuthHeaders()` → `Authorization: Bearer` ile gönderiyor; altyapı hazır | `yula.client/src/lib/company-headers.ts`, `lib/auth-headers.ts` | Token içeriği değişir, taşıma yolu değişmez |
| Prod: `Sims.Server` static Next build sunuyor (`UseDefaultFiles`/`MapStaticAssets`) | `Sims.Server/Program.cs` | Prod'da BFF'nin kim olduğu edge-case (bkz. §7) |
| Redis zaten servis altyapısında (job store/queue) | `Sims.Server` | Revocation key'leri için hazır store |

---

## 2. Mimari Hüküm (Güvenlik Değerlendirmesi)

### 2.1 İmpersonation (eleştiri #1)

- **StaticApiKey + payload claim forwarding tek başına GÜVENLİ DEĞİL** — backend aynı
  network'de BFF dışında da erişilebilirse, key elindeki herkeste **arbitrary sub ile
  token mint** edebilir (tam impersonation).
- Trust boundary kuralları:
  - **Dev (localhost / aynı host, izolasyon var)** → `X-API-Key` + claim forwarding kabul.
  - **Prod** → BFF'ye **RS256 service keypair** (private yalnız BFF env'inde); BFF,
    30 sn'lik kısa ömürlü service JWT ile claim'leri imzalar; backend
    `sig + iss=yula-bff + aud=yula-backend + exp` doğrular. RFC 8693'ün mikro formu;
    tam RFC 8693 (token server) kurmuyoruz — gereksiz ağırlık.
- **Raw `id_token` forwarding önerilmiyor**: backend'e provider JWKS bağımlılığını geri
  getirir (provider-agnostik hedefle çelişir) ve SMS-OTP'de dış token yoktuğunda
  yine claim forwarding'e düşüyor. Trust, NextAuth'un **server-side session
  doğrulamasına** (`getServerSession`) indirgenir — İdP token'ı NextAuth tarafında
  (`googleJwks` / Keycloak provider) zaten doğrulanıyor.
- Maliyet: exchange ~4 istek/saat/kullanıcı (15 dk user token + 10 dk refresh).
  **Sıfır IdP çağrısı, sıfır JWKS çekimi.**

### 2.2 Identity Collision (eleştiri #2)

- Mint token'ında **asla çıplak external sub YOK**:
  - `sub` = `user_identities.user_id` (internal GUID)
  - `pid` = provider, `psub` = external sub (audit), `email` = gösterim
- `session.user.internalUserId` (ensure-user satırının `user_id`) session'a girer →
  client `myOwnerId` = internal id → backend `sub` = internal id → **"Sen" senaryosu
  da kapanır**.
- `/api/jobs/owners` **çift lookup** yapar: önce internal id, geçiş dönemi için legacy
  external `providerId` (şu anki `limit(*2)` ambigüitesi giderilir).
- Guest/admin katmanı değişmez: `user_id` NULL → GUEST; admin catalog linki ayrı claim
  ile (gerekirse `arole`).

### 2.3 Session Revocation (eleştiri #3)

- IdP'de silinen kullanıcı: NextAuth session geçerli kaldığı sürece token almaya devam
  edebilir → katmanlı kapatma:
  1. **User token `exp` = 15 dk** → maksimum delik ≈ 15 dk.
  2. **Revocation kontrolü YALNIZ mint anında** (her request'te değil — zero-overhead
     hedefi korunur): exchange, `user_identities`'te kayıt yoksa / flagli ise → `409 user-not-found`.
  3. Opsiyonel sert revocation: Redis `yula:revoked:{user_id}` (kısa TTL) → admin
     "şimdi düşsün" senaryosu.

---

## 3. SPRINT 1 — Multi-IdP JWKS (hızlı, minimum risk; "Sistem" sorununu kapatır)

**Amaç:** Backend, token'ın `iss`'ine göre Keycloak **ve** Google (One Tap ID token)
doğrulamayı tanıyabilsin → her iki oturumda da `sub` çıkarılabilsin → `ownerId` dolsun.

### Dosya: `src/Sims/Sims.Server/Auth/KeycloakGoogleJwtBearer.cs` (yeni)

```csharp
using Microsoft.AspNetCore.Authentication;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;

namespace Sims.Server.Auth;

public static class KeycloakGoogleJwtBearer
{
    private static readonly string[] GoogleIssuers =
        ["https://accounts.google.com", "accounts.google.com"];

    public static AuthenticationBuilder AddKeycloakAndGoogleJwtBearer(
        this AuthenticationBuilder builder, IConfiguration config)
    {
        string keycloakIssuer  = config["Auth:KeycloakIssuer"]!;
        string? keycloakAudience = config["Auth:KeycloakAudience"];
        string? googleClientId   = config["Auth:GoogleClientId"]; // boşsa Google kaynağı devre dışı

        // Keycloak: realm discovery'den JWKS (1h cache, sliding 5dk — JwtBearer default'ı)
        var keycloakRetriever = new OpenIdConnectConfigurationManager
        {
            BaseAddress = new Uri(keycloakIssuer),
            MetadataAddress = new Uri(keycloakIssuer.TrimEnd('/') + "/.well-known/openid-configuration"),
            // localhost Keycloak (http) yalnız dev'te; prod issuer https → default
            RequireHttpsMetadata = !keycloakIssuer.StartsWith("http://", StringComparison.Ordinal),
        };
        var keycloakKeys = new JwkSetSecurityKeyProvider(keycloakRetriever);

        // Google: public JWKS, statik (ilk fetch + cache; key rotasyonu için sliding manager'a çevrilebilir)
        var googleRetriever = new StaticConfigurationRetriever(new OpenIdConnectConfiguration
        {
            Issuer = GoogleIssuers[0],
            Jwks = new JsonWebKeySet("https://www.googleapis.com/oauth2/v3/certs"),
        });
        var googleKeys = new JwkSetSecurityKeyProvider(googleRetriever);

        builder.AddJwtBearer(options =>
        {
            // Authority YOK (auto-metadata discovery kapalı); anahtar çözümü issuer'a göre
            var tvp = options.TokenValidationParameters;
            tvp.ValidateIssuer = true;
            tvp.ValidIssuers.Add(keycloakIssuer);
            tvp.ValidIssuers.AddRange(GoogleIssuers);
            tvp.NameClaimType = "sub";
            if (!string.IsNullOrWhiteSpace(keycloakAudience))
                tvp.ValidAudiences.Add(keycloakAudience);

            tvp.IssuerSigningKeyResolver = (rawToken, header, kid) =>
            {
                string? iss = ReadClaim(rawToken, "iss");
                bool isGoogle = iss is string g && GoogleIssuers.Contains(g, StringComparer.Ordinal);

                // Google guard: aud, yapılandırılmış Google Client ID'yi içermeli
                if (isGoogle && !string.IsNullOrWhiteSpace(googleClientId)
                    && !AudiencesContain(ReadClaim(rawToken, "aud"), googleClientId))
                    return [];

                if (string.IsNullOrWhiteSpace(kid)) return []; // bilinmeyen token → reject

                var provider = isGoogle ? googleKeys : keycloakKeys;
                return provider.GetSigningKeys(iss ?? keycloakIssuer, kid, null, header.Alg).ToArray();
            };
        });
        return builder;
    }

    /// <summary>JWT payload'undaki claim'i decode (iss/aud routing + guard için).</summary>
    private static string? ReadClaim(string rawToken, string claim) { /* base64url payload → JsonDocument */ }
    private static bool AudiencesContain(string? audJson, string expected) { /* aud: string | array[] kontrolü */ }
}
```

### `Sims.Server/Program.cs`

Eski `AddJwtBearer` bloğu (~satır 30–57, dev `RequireHttpsMetadata` hack'iyle birlikte) yerine:

```csharp
var keycloakIssuer = builder.Configuration["Auth:KeycloakIssuer"];
bool keycloakAuthEnabled = !string.IsNullOrWhiteSpace(keycloakIssuer);
if (keycloakAuthEnabled)
{
    builder.Services.AddAuthentication()
        .AddKeycloakAndGoogleJwtBearer(builder.Configuration);
}
```

`app.UseAuthentication()` ve `/api/arrow/whoami` unchanged.

### `appsettings`

- `appsettings.json`: `"Auth:GoogleClientId": ""` → boşsa Google kaynağı devre dışı, mevcut Keycloak davranışı aynen korunur (regression riski sıfır).
- `appsettings.Development.json`:
  ```json
  "Auth": {
    "KeycloakIssuer": "http://localhost:8080/realms/yula",
    "KeycloakAudience": "",
    "GoogleClientId": "922275320241-…apps.googleusercontent.com"  // .env'deki public client id
  }
  ```

### Doğrulama

1. `dotnet build` (Sims.Server)
2. Dev ortamda `GET /api/arrow/whoami`:
   - One Tap oturumu → `authenticated:true`, `sub` = Google sub
   - Keycloak oturumu → `authenticated:true`, `sub` = Keycloak sub
3. Yeni başlatılan job'da panel "Sistem" yerine isim (veya sub kısaltması) gösterir.
   **Eski `ownerId: null` job'lar geriye dönük düzelmez.**

### S1 risk/not

- Google ID token ömrü ~1 saat; süresi dolunca NextAuth jwt callback token'ı siler →
  anonim fallback (mevcut davranış, kabul ediliyor).
- `aud` guard `Auth:GoogleClientId` boşsa atlanır (Keycloak'a regression riski doğmaz).

---

## 4. SPRINT 2 — Provider-Agnostik Exchange (tasarım onaylı; kod aşağıda)

### 4.1 Akış

```
[IdP: Keycloak / Google One Tap / SMS / GitHub …]   (NextAuth — yalnız LOGIN katmanı;
      │  provider ek/çıkar = NextAuth env + lib/auth.ts; BACKEND'E SIFIR DEĞİŞİKLİK)
      ▼
 NextAuth session (server-side, getServerSession)
      │
      ▼  POST /api/arrow/auth/exchange   (BFF route handler → backend;
      │        dev: X-API-Key | prod: BFF'nin RS256 imzalı 30sn service claim JWT)
      ▼
 Backend: user_identities lookup (aktif mi?) + opsiyonel Redis revocation check
      │
      ▼  mint: HS256 user token (iss: yula-backend, sub: INTERNAL user_id, exp: 15dk)
      ▼
 Browser (memory) → her /api/arrow isteğinde Bearer (mevcut getAuthHeaders yolu)
```

### 4.2 Backend — yeni dosyalar `src/Sims/Sims.Server/Auth/`

> Konumlandırma: host-level auth. `Arrow.Jobs.AspNetCore` provider-agnostik kalır;
> `ArrowJobEndpoints.FindFirst("sub")` **dokunulmaz** — `sub` artık internal GUID olunca
> owner extraction otomatik doğru akar.

#### `ExchangeModels.cs`

```csharp
namespace Sims.Server.Auth;

/// <summary>BFF'nin backend'e doğrulanmış session claim'leri olarak ilettiği model.</summary>
public sealed record ExchangeRequest(
    string UserId,      // internal user_id (GUID) — user_identities.user_id
    string Provider,    // "keycloak" | "google" | "google-onesig" | "sms-otp"
    string ExternalSub, // provider sub (audit + legacy owner çözümleme)
    string? Email,
    string? Name);

public sealed record ExchangeResponse(
    string AccessToken,
    string TokenType = "Bearer",
    int ExpiresIn,
    Guid UserId,
    string Provider);
```

#### `UserTokenIssuer.cs`

```csharp
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;

namespace Sims.Server.Auth;

public sealed class UserTokenIssuer
{
    private readonly byte[] _secret;   // Auth:UserToken:Secret (≥ 32B, base64, env)
    private readonly string _issuer;    // Auth:UserToken:Issuer ("yula-backend")
    private readonly TimeSpan _lifetime; // Auth:UserToken:LifeMinutes (default 15)

    public UserTokenIssuer(IConfiguration cfg)
    {
        _secret   = Convert.FromBase64String(cfg["Auth:UserToken:Secret"]!);
        _issuer   = cfg["Auth:UserToken:Issuer"] ?? "yula-backend";
        _lifetime = TimeSpan.FromMinutes(int.Parse(cfg["Auth:UserToken:LifeMinutes"] ?? "15"));
        if (_secret.Length < 32)
            throw new InvalidOperationException("Auth:UserToken:Secret en az 32 byte olmalı.");
    }

    public ExchangeResponse Issue(ExchangeRequest req)
    {
        var now = DateTime.UtcNow;
        var claims = new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub, req.UserId),   // internal GUID
            new Claim("pid",  req.Provider),
            new Claim("psub", req.ExternalSub),
            new Claim(JwtRegisteredClaimNames.Email, req.Email ?? string.Empty),
            new Claim(JwtRegisteredClaimNames.Jti,  Guid.NewGuid().ToString()),
            new Claim(JwtRegisteredClaimNames.Iat,  now.ToString("o")),
        };
        var token = new JwtSecurityToken(
            issuer: _issuer,
            audience: "yula-api",
            claims: claims,
            notBefore: now,
            expires: now.Add(_lifetime),
            signingCredentials: new(new SymmetricSecurityKey(_secret), SecurityAlgorithms.HmacSha256));
        return new ExchangeResponse(new JwtSecurityTokenHandler().WriteToken(token),
            ExpiresIn = (int)_lifetime.TotalSeconds,
            UserId = Guid.Parse(req.UserId),
            Provider = req.Provider);
    }
}
```

#### `BffClaimGuard.cs`

```csharp
// Production: BFF'nin RS256 public key(ler)i env/JWKS pin'i (rotasyonda 2 key, 1 dk kesişim)
//   → new JwtSecurityTokenHandler().ValidateToken(bearer, new TokenValidationParameters
//     { ValidIssuer="yula-bff", ValidAudience="yula-backend",
//       ValidAlgorithms=[SecurityAlgorithms.RsaSha256], ClockSkew=10s, RequireExpirationTime=true })
// Dev: X-API-Key (CryptographicOperations.FixedTimeEquals) — yalnız network izolasyonunda
```

#### `Program.cs` ekleri

```csharp
// 1) USER token doğrulaması: TEK issuer = biz. JWKS/IdP çağrısı YOK.
builder.Services.AddAuthentication(o => o.DefaultAuthenticateScheme = "UserTokens")
    .AddJwtBearer("UserTokens", o =>
    {
        o.TokenValidationParameters = new()
        {
            ValidIssuer = issuer,
            ValidAudience = "yula-api",
            IssuerSigningKey = new SymmetricSecurityKey(Convert.FromBase64String(secret)),
            ClockSkew = TimeSpan.FromSeconds(15),
            NameClaimType = "sub",
        };
        o.DefaultChallengeOnly = true; // 401 → 403'a çevirme
    });

// 2) MINT endpoint'i
app.MapPost("/api/arrow/auth/exchange", async (HttpContext ctx) =>
{
    var req = BffClaimGuard.Extract(ctx);          // mode'a göre: service JWT / API key + body
    var user = await db.FindActiveIdentityAsync(req.UserId, req.Provider, req.ExternalSub);
    if (user is null) return Results.Conflict(new { error = "user-not-found" });
    if (await redis.ExistsAsync($"yula:revoked:{req.UserId}"))
        return Results.Conflict(new { error = "user-revoked" });   // opsiyonel
    return Results.Ok(userTokenIssuer.Issue(req));
}).DisableAntiforgery();
// Opsiyonel: rate-limit middleware (1 kullanıcı / 30 sn)
```

#### Edge-case uyarıları (backend)

- **HS256 user token**: secret yalnız backend'de kalır → browser forj edemez. Rotasyon =
  env değişimi (geçişte `iss` versiyonu ile çift-secret). RS256 yalnız public key
  dağıtımı gerekirse.
- **JTI replay**: 30sn'lik BFF token'ı 2 kez exchange → 2 tane aynı kullanıcıya ait
  token (exploit değil, idempotent). Sıkıysanız Redis `SET NX jti` ile 1-shot.
- **Clock skew**: BFF↔backend farklı makine → NTP; 15sn skew yeterli.
- Migration: eski job'lar `ownerId = external sub`; `/api/jobs/owners` **çift lookup**
  (internal id → legacy `providerId`) → geçiş dönemi sorunsuz.

### 4.3 Next.js / NextAuth entegrasyonu

#### `src/app/api/arrow/auth/exchange/route.ts` (yeni, server-only)

```ts
import { getServerSession } from "next-auth";
import { auth } from "@/lib/auth";
import { internalUserIdForSession } from "@/features/auth/lib/app-user-sync"; // ensure-user uyumlu

export async function GET() {
  const session = await getServerSession(auth.options);
  const user = session?.user as { internalUserId?: string } | undefined;
  if (!session?.user?.id || !user?.internalUserId)
    return new Response(null, { status: 401 });

  const provider = session.user.provider ?? "unknown";

  const headers = process.env.AUTH_EXCHANGE_MODE === "servicejwt"
      ? { Authorization: `Bearer ${await signServiceClaims(user.internalUserId, provider, 30)}` } // WebCrypto RS256
      : { "X-API-Key": process.env.AUTH_EXCHANGE_API_KEY! };

  const res = await fetch(`${backendUrl}/api/arrow/auth/exchange`, {
    method: "POST", headers,
    body: JSON.stringify({
      userId: user.internalUserId,
      provider,
      externalSub: session.user.id,
      email: session.user.email,
      name: session.user.name,
    }),
  });
  if (!res.ok) return new Response(null, { status: 401 }); // 409 user-revoked → re-login
  const { access_token, expires_in } = await res.json();
  return Response.json({ token: access_token, expires_in });
}
```

#### `src/lib/auth.ts` — session hizalama

- `callbacks.jwt`: `token.internalUserId` = ensure-user satırının `user_id`'si
  (ilk login'de upsert, sonra claim).
- `callbacks.session`: `session.user.internalUserId = token.internalUserId`
  → `myOwnerId` iç id → panelde "Sen" senaryosu kapanır.

#### `src/components/app/mint-token-sync.tsx` (yeni; `AuthHeaderSync` yerine)

```tsx
export function MintTokenSync() {
  const { status } = useSession();
  React.useEffect(() => {
    if (status !== "authenticated") { setAuthAccessToken(undefined); return; }
    let live = true;
    const refresh = async () => {
      const r = await fetch("/api/arrow/auth/exchange");   // session cookie otomatik
      if (!r.ok) { setAuthAccessToken(undefined); return; } // fallback: anonim mod korunur
      const { token } = await r.json();
      setAuthAccessToken(token);
    };
    refresh();
    const id = setInterval(refresh, 10 * 60_000);          // 10dk < 15dk exp → gap yok
    const onVis = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVis); };
  }, [status]);
  return null;
}
```

- `arrow-job-client.ts`'te `getCompanyHeaders()` çağrıları değişmez →
  `Authorization: Bearer <mint token>` otomatik taşınır.
- 401 (Bearer'lı) → tek `refresh()` + retry.

### 4.4 Sprint 2 çalışma paketleri

| # | İş | Est. |
|---|---|---|
| 2.1 | `UserTokenIssuer` + `UserMappingService` (mevcut `user_identities`) + `/api/arrow/auth/exchange` (dev: `X-API-Key`) + Next route + `MintTokenSync` + `session.internalUserId` | 1–2 gün |
| 2.2 | RS256 `BffClaimGuard` (prod) + key pin env'leri + çift-key rotasyon prosedürü | 0,5–1 gün |
| 2.3 | Redis `yula:revoked:{user_id}` (admin akışından SET) + `user-not-found` 409 elinde | 0,5 gün |
| 2.4 | `/api/jobs/owners` çift-lookup migration + eski job'ların görüntülenmesi regresyon testi | 0,5 gün |
| 2.5 | Rate limit middleware + dev/prod `.env.example` değerleri + smoke test | 0,5 gün |

---

## 5. Provider Ekleme/Çıkarma Operasyonu (kazanım)

Yeni OIDC provider (Auth0, GitHub, Azure AD…) = **yalnızca**:
1. `lib/auth.ts`'e NextAuth provider + env
2. `user_identities.provider` değerine dize eklemek

**Backend'e sıfır değişiklik.** Keycloak çıkarma = provider'ı NextAuth'tan kaldır + BFF env;
backend etkilenmez. (Sprint 1 multi-issuer JWKS bu esnekliği vermez; Sprint 2 verir.)

## 6. Kabul Kriterleri (Definition of Done)

- [ ] One Tap / Keycloak / SMS oturumlarında **yeni** job'lar `ownerId ≠ null` açılır
- [ ] Panel "Kim başlattı?" satırı: kendi oturumunda "Sen" (internal id hizalanınca),
      başka kullanıcıda isim, yalnızca token'sız dev modda "Sistem"
- [ ] `/api/arrow/whoami` her iki provider için `authenticated:true`
- [ ] `Auth:KeycloakIssuer` boşken her şey anonim fallback ile çalışır (regression yok)
- [ ] Backend'de provider'a özel kod SIFIR (Sprint 2 sonrası; S1'de 2 provider sabit tanımlı)
- [ ] `dotnet build` + Next typecheck yeşil; eski job'lar (null owner) "Sistem" göstermeye devam eder

## 7. Bilinen Edge / Açık Sorular

1. **Static export prod**: `Sims.Server` static build'i sunarsa NextAuth API route'ları
   yaşamaz → prod'da ya `next start` (BFF ayrı, exchange canlı) ya da Tauri desktop'ta
   anonim fallback. Mimari kural: **exchange'i doğrulayan katman, session'ı sahiplenen
   katmandır** (BFF).
2. **Tauri desktop**'ta client-side BFF imzalanamaz → desktop server-side BFF'e
   localhost istek atar; `X-API-Key` sadece lokal ağda.
3. Google **key rotasyonu**: S1'de `StaticConfigurationRetriever` sliding cache'siz →
   Google yeni `kid` eklerse token doğrulanamaz. Gerekirse `OpenIdConnectConfigurationManager`
   (MetadataAddress = `.../oauth2/v3/certs`) ile sliding'a çevrilir.
4. **Token algoritması kararı**: user token HS256 (secret backend-only, basitlik) ;
   BFF→backend RS256 (service keypair). Onay bekleniyor.
5. `session.user.provider` Google One Tap'te `google-onesig` — `user_identities.provider`
   normalize değerle (bkz. `normalizeProvider`) birebir eşleşmeli; lookup'ta normalize edin.

## 8. Karar Geçmişi

| Tarih | Karar | Gerekçe |
|---|---|---|
| 2025-11 | "Sistem" sabit değil, ownerId null fallback'i | `use-job-owners.ts`, `ArrowJobEndpoints.cs` |
| 2025-11 | JWT doğrulama provider'a (Keycloak/Google) ait, bizim ürettiğimiz token yok | JWKS discovery |
| 2025-11 | S1: multi-issuer JWKS (hızlı, düşük risk) → S2: exchange (provider-agnostik, revocation) | İkili sprint: bug kapanır, hedef mimariye geçişi riskli |
| 2025-11 | StaticApiKey tek başına prod'da YETERLİ DEĞİL → BFF RS256 claim imzası | İmpersonation analizi |
| 2025-11 | Token `sub`'u = internal `user_identities.user_id`; çıplak provider sub ASLA | Identity collision |
| 2025-11 | Revocation kontrolü yalnız mint anında + opsiyonel Redis | Her-request'te introspection maliyeti hedeflenmiyor |
