"use client";

/**
 * Otomatik Google One Tap kartı (sayfa açılışında sağ üstte fırlayan kart).
 *
 * Root layout'ta global olarak monte edilir (bkz. src/app/layout.tsx →
 * Providers altı): `GOOGLE_ONE_TAP=1` iken ve oturum YOKKEN her tam sayfa
 * yüklenmesinde `google.accounts.id.prompt()` bir kez çağrılır.
 *
 * - Kayıtlı Google credential varsa kartta hesap görünür → tek dokunuşla
 *   credential callback'i çalışır (`signIn("google-onesig")`).
 * - Credential yoksa / kart kapatıldıysa prompt() sessizce no_op olur;
 *   sign-in ekranındaki tıklanabilir GIS butonu (GoogleOneTapButton)
 *   fallback olarak kalır.
 * - RSC sayfa geçişlerinde layout tekrar mount edilmediği için kart
 *   yalnızca tam sayfa yüklenmelerinde (F5 / ilk açılış) belirir.
 * - `/sign-in` üzerinde kart GÖSTERİLMEZ: sign-in kartında zaten tıklanabilir
 *   GIS butonu (GoogleOneTapButton) vardır — aynı eylemin iki tetikleyicisi
 *   yan yana gösterilmez.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { initGsiClient } from "@/features/auth/lib/gsi-client";
import { isGoogleOneTapEnabled } from "@/features/auth/lib/google-one-tap-flag";
import { signInWithGoogleCredential } from "@/features/auth/lib/google-onesig-signin";

export function GoogleOneTapPrompt() {
  const router = useRouter();
  const { status } = useSession();
  const promptedRef = React.useRef(false);

  React.useEffect(() => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId || !isGoogleOneTapEnabled() || status === "authenticated") {
      return;
    }
    let cancelled = false;
    // /sign-in zaten tıklanabilir GIS butonu taşır; üst üste kart çıkmasın.
    if (typeof window !== "undefined" && window.location.pathname.startsWith("/sign-in")) {
      return;
    }
    void initGsiClient(clientId, (credential) => {
      if (cancelled) return;
      void signInWithGoogleCredential(credential, router);
    }).then((gsi) => {
      if (!gsi || cancelled || promptedRef.current) return;
      // Sayfa başına tek seferlik: kart kapatılıp yeniden mount edilse bile
      // Google kuralları gereği tekrar çağrılmaz.
      promptedRef.current = true;
      try {
        gsi.prompt?.();
      } catch {
        // prompt arızası → fallback buton akışı çalışır, UI kırılmaz.
      }
    });
    return () => {
      cancelled = true;
    };
  }, [router, status]);

  return null;
}
