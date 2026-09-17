"use client";

import { useEffect, useMemo } from "react";
import { useSession } from "next-auth/react";
import type { Session } from "@/lib/auth";

/**
 * Gizli dev bileşeni — SessionProvider altında bir kez render edilir
 * (providers.tsx). İlk girişte (ve kullanıcı/provider değişince) oturum
 * kimliğini konsola yazar: hangi provider, okunan ad, e-posta, resim, roller.
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

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
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
  }, [fingerprint]);

  return null;
}
