import * as React from "react";
import { emptySubscribe } from "@/hooks/use-mounted";

/**
 * Yerel profil kaydı (localStorage + canlı yayın): resim + ad/soyad + e-posta.
 *
 * Neden: session JWT'deki profil alanları yalnızca GİRİŞ ANINDAKİ provider
 * userinfo değerini taşır; One Tap ID token'ında picture claim'i gömülü
 * değildir ve eski session'larda resim/ad eksik kalabiliyor. Ayarlar
 * sayfasındaki "Yeniden getir" butonu taze değerler getirince onları
 * BURADA saklarız; header rozeti (nav-user), ayarlar kartı ve sağ panel
 * (ad/email) aynı kayıttan okur → profil tüm uygulamada eşleşir.
 *
 * Öncelik: session (sunucu kaynaklı, giriş anındaki resmi) > yerel kayıt
 * (yalnızca session alanı boşken tamamlar) > form değeri (ui katmanında).
 *
 * Kalıcılık notu: URL (örn. lh3.googleusercontent.com) süresiz olduğundan
 * sorun yaratmaz; farklı cihaza geçişte değerler o cihazda ilk "Yeniden
 * getir"e kadar session/form üzerinden kalır (kabul edilebilir).
 */
const STORAGE_KEY = "yula.profileImage";

/** Kullanıcının KENDİ yüklediği resim (data URL) — provider resminin ÜSTÜNE
 *  bindirilir; silinince provider zinciri devreye döner. Ayrı anahtar: 
 *  "Yeniden getir" (provider record'ı) bu kayda dokunmaz. */
const USER_PHOTO_KEY = "yula.userPhoto";

/** Kayıtlı profil: resim URL'i + ad/soyad + e-posta (boş alanlar null). */
export interface LocalProfileRecord {
  picture: string | null;
  name: string | null;
  email: string | null;
}

let cache: LocalProfileRecord | null = null;
let initialized = false;
let userPhotoCache: string | null = null;
let userPhotoInitialized = false;
const listeners = new Set<() => void>();

function ensureUserPhotoInitialized() {
  if (!userPhotoInitialized) {
    userPhotoInitialized = true;
    try {
      const raw = localStorage.getItem(USER_PHOTO_KEY);
      userPhotoCache = raw && raw.startsWith("data:image/") ? raw : null;
    } catch {
      userPhotoCache = null;
    }
  }
}

/** Kullanıcının kendi yüklediği resim (data URL; yoksa null). */
export function getLocalUserPhoto(): string | null {
  ensureUserPhotoInitialized();
  return userPhotoCache;
}

/**
 * Kendi resminin yerel kaydı: data URL (canvas ile 256×256'a küçültülmüş
 * JPEG — localStorage kotayına sığar) ya da null (kaydı sil → provider
 * resmine dön). Aynı canlı yayına yazılır (dinleyiciler tetiklenir).
 */
export function setLocalUserPhoto(dataUrl: string | null) {
  const next = dataUrl && dataUrl.startsWith("data:image/") ? dataUrl : null;
  ensureUserPhotoInitialized();
  if (next === userPhotoCache) return;
  userPhotoCache = next;
  try {
    if (next) localStorage.setItem(USER_PHOTO_KEY, next);
    else localStorage.removeItem(USER_PHOTO_KEY);
  } catch {
    // Quota / erişim sorunu: bellek kopyası yine yayımlanır (sayfa
    // ömrü boyunca geçerli; kalıcı kayıt yazılamadıysa sonraki
    // yüklemede provider zinciri devrede kalır).
  }
  listeners.forEach((listener) => listener());
}

function readStorage(): LocalProfileRecord | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    // V1 kayıtlar çıplak resim URL'i olarak saklanıyordu — uyumlu oku.
    if (raw.startsWith("http://") || raw.startsWith("https://")) {
      return { picture: raw, name: null, email: null };
    }
    const parsed = JSON.parse(raw) as Partial<LocalProfileRecord>;
    if (!parsed || typeof parsed !== "object") return null;
    return {
      picture:
        typeof parsed.picture === "string" && parsed.picture
          ? parsed.picture
          : null,
      name: typeof parsed.name === "string" ? parsed.name : null,
      email: typeof parsed.email === "string" ? parsed.email : null,
    };
  } catch {
    // Bozuk kayıt / erişilemeyen localStorage → null (bozulmamış bir
    // kullanıcı akışını bozma).
    return null;
  }
}

function ensureInitialized() {
  if (!initialized) {
    initialized = true;
    cache = readStorage();
  }
}

/** Mevcut yerel kayıt (yoksa null). */
export function getLocalProfileRecord(): LocalProfileRecord | null {
  ensureInitialized();
  return cache;
}

/**
 * Avatar kaynak URL'i haritası — <img src> hedefi.
 *
 * Uzak (http/https) provider resimleri localStorage'daki HAM URL olarak
 * tarayıcıya/WebView'e yükletilmez: süre/dönen URL'ler ve 3. parti
 * engelleri baş harfler fallback'ine düşürüyordu. Bunun yerine
 * `/api/avatar` proxy'si session üzerinden resmi sunucu tarafında TAZE
 * çözüp same-origin stream eder (bkz. src/app/api/avatar/route.ts).
 * `data:` URL'leri (kullanıcının kendi yüklediği resim) ve null aynen
 * döner — proxy yalnızca UZAK URL'ler içindir.
 */
export function toAvatarSrc(
  url: string | null | undefined,
): string | null {
  if (!url) return null;
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return "/api/avatar";
  }
  return url;
}

// ────────────────────────────────────────────────────────────────────────
// /api/avatar TEK SEFERLIK fetch (istemci-side dedup)
//
// YOKSAY edilmeyen kök neden: `Cache-Control: no-store` + 404'ün
// cache'lenememesi → her <img> mount'u (sayfa geçişi yeniden mount,
// StrictMode 2×, HMR, her F5, dropdown açılışı) /api/avatar'a YENİ
// istek atar; resim yokken hepsi log'a 404 satırı düşer ("404 fırtınası").
//
// Çözüm: sayfa ömründe proxy YALNIZCA BİR KEZ fetch edilir; baytları
// paylaşılan bir blob URL olarak bütün tüketicilere verilir
// (nav-user rozeti, ayarlar kartı). 404 / ağ hatası → null → baş
// harfler fallback'i ve sonrasında istek YOK. "Yeniden getir" başarısında
// `invalidateAvatarProxy()` çağrılır; taze resim bir sonraki mount'ta
// yeniden çözülebilir. Blob URL bilinçli olarak release edilmez —
// tarayıcı sayfa kapanışında serbest bırakır (resim baytları ≤ 5 MB;
// tek kopya, kabul edilebilir).
// ────────────────────────────────────────────────────────────────────────
let sharedAvatarBlobUrl: string | null = null;
let sharedAvatarPromise: Promise<string | null> | null = null;
let avatarEpoch = 0;
const avatarEpochListeners = new Set<() => void>();

/** /api/avatar proxy'si için TEK istek (modül seviyesi dedup — tüm
 *  tüketiciler aynı blob URL'i / null'u paylaşır).
 *  Avatar baytlarının blob URL'ini döner; 404 (resim yok) veya hata →
 *  null (ve sonraki çağrılar ağa ÇIKMAZ). */
export function fetchAvatarProxyOnce(): Promise<string | null> {
  if (sharedAvatarPromise) return sharedAvatarPromise;
  sharedAvatarPromise = fetch("/api/avatar", { cache: "no-store" })
    .then((res) => (res.ok ? res.blob() : null))
    .then((blob) => {
      sharedAvatarBlobUrl = blob ? URL.createObjectURL(blob) : null;
      return sharedAvatarBlobUrl;
    })
    .catch(() => {
      // Ağ hatası: sayfa ömrü boyunca null (baş harfler kalır; "Yeniden
      // getir" başarısı invalidasyonla yeniden dener).
      return null;
    });
  return sharedAvatarPromise;
}

/** "Yeniden getir" başarısında çağrılır: paylaşılan sonuç iptal edilir,
 *  epoch bump'u hook'ları yeniden çözümlemeye zorlar. */
export function invalidateAvatarProxy(): void {
  if (sharedAvatarBlobUrl) {
    URL.revokeObjectURL(sharedAvatarBlobUrl);
  }
  sharedAvatarBlobUrl = null;
  sharedAvatarPromise = null;
  avatarEpoch += 1;
  avatarEpochListeners.forEach((listener) => listener());
}

/**
 * `toAvatarSrc`'in reaktif, dedup'lu versiyonu — <img src> hedefi.
 *
 * - `data:` / yerel URL'ler aynen döner (proxy'den geçmez).
 * - Uzak (http/https) URL'ler TEK SEFERLIK /api/avatar fetch'i ile
 *   paylaşılan blob URL'e çözülür; çözülmeden önce (ve çözüm
 *   başarısızsa) null → baş harfler rozeti; src'siz <img> mount
 *   edilmediği için 404 fırtınası olmaz.
 *
 * Hydration güvenli: ilk (SSR) render'da daima null — tarayıcıda ilk
 * render da null, <img> çözülünceye kadar DOM'da yoktur (mismatch yok).
 */
export function useAvatarSrc(
  url: string | null | undefined,
): string | null {
  const isRemote = !!url && url.startsWith("http");
  const plain = isRemote ? null : (url ?? null);
  const epoch = React.useSyncExternalStore(
    (callback) => {
      avatarEpochListeners.add(callback);
      return () => {
        avatarEpochListeners.delete(callback);
      };
    },
    () => avatarEpoch,
    () => 0,
  );
  const [remote, setRemote] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!isRemote) return;
    let cancelled = false;
    void fetchAvatarProxyOnce().then((blobUrl) => {
      if (!cancelled) setRemote(blobUrl);
    });
    return () => {
      cancelled = true;
    };
  }, [isRemote, epoch]);
  return plain ?? remote;
}

/**
 * "Yeniden getir" başarısında çağrılır. V2: {picture, name, email};
 * geriye uyum için çıplak URL (yalnız resim) veya null (kayıt sil) kabul
 * edilir. Kayıt silinir/yazılırsa yayımlanır (canlı dinleyiciler tetiklenir).
 */
export function setLocalProfileImage(
  record:
    | Partial<LocalProfileRecord>
    | string
    | null
    | undefined,
): void {
  const next: LocalProfileRecord | null =
    record === null || record === undefined
      ? null
      : typeof record === "string"
        ? { picture: record, name: null, email: null }
        : {
            picture: record.picture ?? null,
            name: record.name ?? null,
            email: record.email ?? null,
          };
  if (next === cache) return;
  cache = next;
  try {
    if (next) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // localStorage'e yazılamazsa bile bellek kopyası yayımlanır.
  }
  listeners.forEach((listener) => listener());
}

/**
 * Reaktif erişim: session profilini (image + name + email) ve yerel kaydı
 * izler. Öncelik: session alanı (doluyse) > yerel kayıt; ikisi de boşsa
 * null (ui katmanı form değerine düşer).
 *
 * Hydration güvenli: SSR/ilk render'da yerel kayıt daima null döner
 * (localStorage erişilemez); yalnız mount sonrası gerçek kayıt devreye
 * girer.
 */
export function useLocalProfileImage(
  sessionUser?: {
    image?: string | null;
    name?: string | null;
    email?: string | null;
  } | null,
): LocalProfileRecord {
  const [record, setRecord] = React.useState<LocalProfileRecord | null>(null);
  const [userPhoto, setUserPhoto] = React.useState<string | null>(null);
  const mounted = React.useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
  React.useEffect(() => {
    const update = () => {
      ensureInitialized();
      ensureUserPhotoInitialized();
      setRecord(cache);
      setUserPhoto(userPhotoCache);
    };
    update();
    listeners.add(update);
    return () => {
      listeners.delete(update);
    };
  }, []);

  const source = mounted ? record : null;
  return {
    // Öncelik: kullanıcının kendi yüklediği resim > session > yerel kayıt
    picture: userPhoto || sessionUser?.image || source?.picture || null,
    name: sessionUser?.name || source?.name || null,
    email: sessionUser?.email || source?.email || null,
  };
}
