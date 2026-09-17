"use client";

import * as React from "react";
import { useEffect, useMemo } from "react";
import { useSession } from "next-auth/react";
import type { Session } from "@/lib/auth";

// Modül seviyesinde dedupe: remount/HMR/oturum refire'lerinde aynı
// parmak izi en fazla 1 kez loglanır.
let lastLoggedFingerprint = "";

/**
 * Gizli dev bileşeni — SessionProvider altında bir kez render edilir
 * (providers.tsx). İlk girişte (ve kullanıcı/provider değişince) oturum
 * kimliğini konsola yazar: hangi provider, okunan ad, e-posta, resim, roller.
 *
 * v5 `SessionProvider` her `visibilitychange`'de (sekme odak kazanınca)
 * oturumu yeniden getirir — içerik aynı kalır, refetch notu bastırılır.
 *
 * `NODE_ENV=production` derlemelerde (Tauri production vb.) log çıkmaz.
 */
export function SessionDebug() {
  const { data: session, status } = useSession();
  const user = session?.user as Session["user"] | undefined;

  // Değişimi yakalamak için parmak izi — fingerprint değişince logla.
  const fingerprint = useMemo(
    () =>
      [
        status,
        user?.provider ?? "",
        user?.id ?? "",
        user?.name ?? "",
        user?.email ?? "",
        user?.roles?.join(",") ?? "",
      ].join("|"),
    [status, user]
  );

  // Session nesnesinin kimlik değişimini izle (refetch tespiti).
  const prevSessionRef = React.useRef<unknown>(undefined);

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const refetched = prevSessionRef.current !== session;
    prevSessionRef.current = session;
    if (fingerprint === lastLoggedFingerprint) {
      if (refetched) {
        // Oturum yeniden getirildi ama içerik değişmedi (visibilitychange /
        // cross-tab senkronu) — ikinci "oturum detayı" logu bastırıldı.
        console.info("[Yula Auth] oturum yeniden getirildi (aynı içerik — log bastırıldı)");
      }
      return;
    }
    lastLoggedFingerprint = fingerprint;
    if (status === "authenticated") {
      console.info("[Yula Auth] oturum detayı", {
        provider: user?.provider ?? null,
        id: user?.id ?? null,
        name: user?.name ?? null,
        firstName: user?.name ? user.name.trim().split(/\s+/)[0] ?? null : null,
        email: user?.email ?? null,
        image: user?.image ?? null,
        roles: user?.roles ?? [],
        hasAccessToken: Boolean(user?.accessToken),
      });
    } else {
      console.info("[Yula Auth] durum:", status);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fingerprint, session]);

  return null;
}
