"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { setAuthAccessToken } from "@/lib/auth-headers";

/**
 * Gizli bileşen — SessionProvider altında bir kez render edilir (providers.tsx).
 *
 * `session.user.accessToken` (lib/auth'un session callback'i ile taşıdığı
 * Keycloak OIDC access token) her değişiminde `setAuthAccessToken`'a iter.
 * Çıkışda (sign-out) token düşer → backend tek kullanıcı moduna iner.
 */
export function AuthHeaderSync() {
  const { data: session, status } = useSession();
  // Base next-auth tipinde `accessToken` yok; extended Session (lib/auth)
  // session callback'inde garanti eder — runtime güvenli daraltma.
  const accessToken = (session?.user as { accessToken?: string } | undefined)?.accessToken;

  useEffect(() => {
    setAuthAccessToken(status === "authenticated" ? accessToken : undefined);
  }, [status, accessToken]);

  return null;
}
