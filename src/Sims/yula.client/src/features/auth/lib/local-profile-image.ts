import * as React from "react";
import { emptySubscribe } from "@/hooks/use-mounted";

/**
 * Yerel profil resmi kaydı (localStorage + canlı yayın).
 *
 * Neden: session JWT'deki `user.image` yalnızca GİRİŞ ANINDAKİ provider
 * userinfo değerini taşır; One Tap ID token'ında picture claim'i zaten
 * gömülmüyor ve eski session'larda resim eksik kalabiliyor. Ayarlar
 * sayfasındaki "Yeniden getir" butonu taze URL getirince onu BURADA
 * saklarız; header rozeti (nav-user) ve ayarlar kartı aynı kayıttan
 * okur → resim tüm uygulamada eşleşir.
 *
 * Sunucu yazılabilir profil deposu olmadığından pratik çözüm bu; URL
 * (örn. lh3.googleusercontent.com) süresiz olduğundan kalıcılık sorun
 * yaratmaz. Farklı cihaza geçişte resim o cihazda ilk "Yeniden getir"e
 * kadar ilk harfler olarak kalır (kabul edilebilir).
 */
const STORAGE_KEY = "yula.profileImage";

let cache: string | null = null;
let initialized = false;
const listeners = new Set<() => void>();

function readStorage(): string | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value && value.length > 0 ? value : null;
  } catch {
    // SSR / erişilemeyen localStorage → null.
    return null;
  }
}

function ensureInitialized() {
  if (!initialized) {
    initialized = true;
    cache = readStorage();
  }
}

/** Mevcut yerel resim URL'i (yoksa null). */
export function getLocalProfileImage(): string | null {
  ensureInitialized();
  return cache;
}

/** "Yeniden getir" başarısında çağrılır; null → kaydı siler. */
export function setLocalProfileImage(url: string | null) {
  const next = url && url.length > 0 ? url : null;
  if (next === cache) return;
  cache = next;
  try {
    if (next) localStorage.setItem(STORAGE_KEY, next);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // localStorage'e yazılamazsa bile bellek kopyası yayımlanır.
  }
  listeners.forEach((listener) => listener());
}

/**
 * Reaktif erişim: hem session değerini hem yerel kaydı izler.
 * Öncelik: session'daki resim (sunucu kaynaklı, resmi) > yerel kayıt
 * (yalnızca session'da resim yokken tamamlar).
 *
 * Hydration güvenli: SSR/ilk render'da daima null döner (localStorage
 * erişilemezdir); yalnız mount sonrası gerçek kayıt devreye girer.
 */
export function useLocalProfileImage(sessionImage?: string | null) {
  const [stored, setStored] = React.useState<string | null>(null);
  const mounted = React.useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
  React.useEffect(() => {
    const update = () => {
      ensureInitialized();
      setStored(cache);
    };
    update();
    listeners.add(update);
    return () => {
      listeners.delete(update);
    };
  }, []);

  if (!mounted || sessionImage) return sessionImage ?? null;
  return stored ?? null;
}
