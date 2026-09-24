"use client";

import { useEffect, useRef } from "react";
import { signOut, useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { useAuthRoleStore } from "@/store/slices/auth-role-store";

const AUTH_ROUTES = ["/sign-in", "/login", "/sign-up"] as const;

/**
 * Hesap durumu ve ilk rol yükleme koruması (provider'dan bağımsız: Keycloak + Google).
 *
 * `GET /api/auth/account-status` route'u session kullanıcısının `app_users.status`
 * ve `role` değerini oturum açıldığında (mount) 1 kez sorgular ve Zustand rol
 * store'unu başlatır.
 *
 * Pasife alma veya yetki kontrolleri devam eden işlemlerde (RPC / Server Actions /
 * API çağrıları) sunucu tarafında doğrulanır. Arka planda sürekli polling yapılmaz.
 *
 * Fail-open: route DB hatasında `active:true` döner → login asla kırılmaz.
 * Tek kullanıcı / provider'sız modda guard ateşlemez (route `active:true`).
 */
export function AccountStatusGuard() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const signingOutRef = useRef(false);

  const isAuthRoute = pathname ? AUTH_ROUTES.some((route) => pathname.startsWith(route)) : false;

  useEffect(() => {
    // Auth ekranlarındayken (sign-in, login, sign-up vb.) guard ve signOut döngüsü çalıştırma
    if (isAuthRoute) {
      signingOutRef.current = false;
      return;
    }

    const user = session?.user as
      | (NonNullable<typeof session>["user"] & { accessToken?: string; provider?: string })
      | undefined;
    const isExpired =
      (session as { error?: string } | null)?.error === "RefreshTokenError" ||
      (status === "authenticated" && !!user && user.provider !== "sms" && !user.accessToken);

    if (isExpired) {
      if (!signingOutRef.current) {
        signingOutRef.current = true;
        void signOut({
          callbackUrl: "/sign-in?reason=session_expired",
        }).catch(() => {
          signingOutRef.current = false;
        });
      }
      return;
    }

    if (status !== "authenticated") {
      signingOutRef.current = false;
      return;
    }

    let disposed = false;
    let inFlight = false;

    // Yeni login olan kullanıcıyı ilk tam sayfa yüklemesinde app_users'a
    // düşür (upsert). Yalnız ayarlar sayfasında çalışmadığı için
    // /system/users listesi yeni kullanıcıları gösterebilsin. Fire-and-
    // forget: hata guard'ı engellemez (route fail-open 200 döner).
    void fetch("/api/auth/ensure-user", {
      method: "POST",
      cache: "no-store",
    }).catch(() => undefined);

    const check = async () => {
      if (inFlight || disposed) return;
      inFlight = true;
      try {
        const res = await fetch("/api/auth/account-status", {
          cache: "no-store",
        });
        if (disposed || !res.ok) return;
        const data = (await res.json()) as {
          active?: boolean;
          role?: string | null;
          tenantRoles?: Record<string, string>;
        };
        // Etkin rol: guest ekran gating'i + admin nav filtrelemenin canlı kaynağı.
        // Yalnız gerçek değerleri yaz — `role` boş gelirse hazır rol ezmeyecek.
        if (data.role) useAuthRoleStore.getState().setRole(data.role, data.tenantRoles);
        if (data.active === false) {
          // signOut Promise — asıl hata yönetimi sign-in kartında.
          if (!signingOutRef.current) {
            signingOutRef.current = true;
            void signOut({
              callbackUrl: "/sign-in?reason=deactivated",
            }).catch(() => {
              signingOutRef.current = false;
            });
          }
          // Tek seferlik: sign-out sonrası status "unauthenticated" olur.
          return;
        }
      } catch {
        // offline — son oturuma dokunma (fail-open)
      } finally {
        inFlight = false;
      }
    };

    // Oturum açılışında / sayfa yüklenmesinde tek seferlik durum ve rol kontrolü
    void check();

    return () => {
      disposed = true;
    };
  }, [status, session, isAuthRoute]);

  return null;
}
