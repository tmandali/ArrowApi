# SessionDebug — Dedupe Davranış Kontrol Listesi

**Bileşen:** `src/Sims/yula.client/src/components/app/session-debug.tsx`
**Ön ek:** `[Yula Auth]` — yalnız dev'de (`NODE_ENV !== "production"`)

## 🔒 Varsayımlar (her zaman doğru olmalı)

- [ ] Aynı oturum içeriği (provider + id + name + email + roles) **en fazla 1** kez
      "oturum detayı" loglar — tekrar eden tetiklemeler bastırılır.
- [ ] Dedupe **yalnız logu** bastırır; oturum davranışı değişmez
      (visibilitychange refetch'i yine de çalışır, sessizce).
- [ ] Production build'lerde (`next build` / Tauri production) konsola
      **hiç** `[Yula Auth]` çıktısı düşmez.

## 🖥️ Taze sayfa yüklemesi (zaten oturum açılmış)

- [ ] Konsolda sırayla: `[Yula Auth] durum: loading` → `[Yula Auth] oturum detayı {…}`
- [ ] Ardından ikinci bir "oturum detayı" gelmez.
- [ ] `oturum detayı` objesinde: provider, id, name, firstName, email, image,
      roles, hasAccessToken alanları dolu (google-onesig'de `roles: []`).

## ⚡ Sekme odağı (visibilitychange — v5 tasarımı gereği)

- [ ] Sekme arka plana alınıp geri gelince:
      `[Yula Auth] oturum yeniden getirildi (aynı içerik — log bastırıldı)`
- [ ] İkinci "oturum detayı" **yok**.
- [ ] Her refetch = en fazla 1 not (spam değil; tek bir satır).

## 🔄 HMR / dev sunucu dosya kaydetme

- [ ] Modül yeniden değerlendirilince modül seviyesi durumu
      (`lastLoggedFingerprint`) sıfırlanır → 1 tam log yeniden çıkabilir;
      bu **beklenen** dev davranışıdır, hata değildir.

## 🚪 Çıkış / tekrar giriş

- [ ] Sign-out → `[Yula Auth] durum: unauthenticated`
- [ ] Aynı hesapla tekrar giriş → **yeni** "oturum detayı"
      (fingerprint değişti, bastırılmaz).

## 🔁 Provider / hesap değişimi

- [ ] Google → Keycloak (veya farklı Google hesabı) → yeni "oturum detayı"
      (yeni provider/name)
- [ ] Ana ekran hero selamlaması yeni hesabın **ilk adını** gösterir
      (örn. "İyi akşamlar, Baha").

## 🪟 Sekmeler arası senkron

- [ ] Sekme B'de giriş yap, sekmeye A'ya dönüp odakla →
      yeni "oturum detayı" (içerik değişti, bastırılmaz).

## 🔬 DevTools'da manuel teyit

- [ ] **Network:** `visibilitychange`'de `/api/auth/session` istemi görülür —
      next-auth v5 tasarımı; sızıntı/hata olarak işaretleme.
- [ ] Üretim paketinde (`npm run build` + `start` / Tauri prod) yukarıdaki
      tüm maddeler "çıktı yok" olarak doğrulanır.
