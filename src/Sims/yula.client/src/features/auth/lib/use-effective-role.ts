"use client";

import { useSession } from "next-auth/react";
import type { Session } from "@/lib/auth";
import { useAuthRoleStore } from "@/store/slices/auth-role-store";
import { APP_ADMIN_ROLE, hasRealmRole } from "./realm-roles";

export const CATALOG_ADMIN_ROLE = "System Administrator";

export type EffectiveRoleState = {
  /**
   * Hesaplandı mı? `undefined` rol beklenirken fail-closed davranış için
   * kapılar bu bayrağa bakar (gösterim yanıp sönmesin).
   */
  ready: boolean;
  /**
   * Etkin rol:
   * - Kataloğa linkli kullanıcı → `app_users.role` (örn. "System Administrator")
   * - Link yok → `"Guest"`
   * - Oturum yok → `null`
   * (Realm claim'leri bu alana YANSIMAZ — bootstrap katmanı `isAdmin`'de
   * ayrıca değerlendirilir: Keycloak `app-admin`'i kataloğa linklenmeden
   * de yöneticidir.)
   */
  role: string | null;
  /**
   * Yönetici mi? → KATALOĞDA `System Administrator` KİMLİK
   * YADA realm claim'de `app-admin` (bootstrap).
   */
  isAdmin: boolean;
};

/**
 * Etkin rol + yönetici durumu — guest ekran gating'inin TEK kaynağı.
 *
 * Kaynaklar:
 * 1. `auth-role-store`: `AccountStatusGuard` her account-status istekinde
 *    günceller (ilk kontrol mount'ta; 60 sn + focus'da taze).
 * 2. `useSession().user.roles`: Keycloak realm claim'leri (bootstrap).
 *
 * Kural: rol yetkilendirmesi yapılmamış ekranlar guest'e AÇIK;
 * `adminOnly` ekranlar/uygulamalar yalnız `isAdmin === true` iken görünür.
 */
export function useEffectiveRole(): EffectiveRoleState {
  const { data: sessionData } = useSession();
  const catalogRole = useAuthRoleStore((s) => s.role);

  // `next-auth/react`'ün generic'siz `useSession`'ı core `Session` döndürür;
  // uygulama tip (`@/lib/auth` Session — `user.roles` genişletmesi) cast.
  const session = sessionData as unknown as Session | null;

  const ready = catalogRole !== undefined;
  const role = catalogRole ?? (session ? "Guest" : null);
  const realmAdmin = hasRealmRole(session, APP_ADMIN_ROLE);
  const catalogAdmin = catalogRole === CATALOG_ADMIN_ROLE;

  return { ready, role, isAdmin: realmAdmin || catalogAdmin };
}
