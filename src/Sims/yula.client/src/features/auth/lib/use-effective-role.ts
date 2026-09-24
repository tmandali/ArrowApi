"use client";

import { useSession } from "next-auth/react";
import type { Session } from "@/lib/auth";
import { useAuthRoleStore } from "@/store/slices/auth-role-store";
import { useCompanyStore } from "@/store/slices/company-store";
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
   * - Aktif tenant (şirket) seçiliyse ve tenant rolü tanımlıysa o rol (örn. LCW'de "Admin", Dipen'de "Guest")
   * - Tenant rolü tanımlı değilse global katalog rolü (`app_users.role`)
   * - Link yoksa `"Guest"`
   * - Oturum yoksa `null`
   */
  role: string | null;
  /**
   * Yönetici mi? → Global `System Administrator`, realm claim `app-admin`
   * VEYA aktif tenant'ta "Admin".
   */
  isAdmin: boolean;
  /** Aktif tenant ID (örn. "lcw", "dipen", "sun-inc") */
  activeTenantId: string | null;
  /** Aktif tenant'a atanmış doğrudan rol */
  tenantRole: string | null;
  /** Global platform yöneticisi mi? (tüm tenant'lar üstü) */
  isSystemAdmin: boolean;
  /** Aktif tenant'ın yöneticisi mi? */
  isTenantAdmin: boolean;
};

/**
 * Etkin rol + yönetici durumu — multi-tenant ve guest ekran gating'inin TEK kaynağı.
 *
 * Kaynaklar:
 * 1. `auth-role-store`: `AccountStatusGuard` her account-status isteğinde
 *    günceller (`role` + `tenantRoles`).
 * 2. `company-store`: Aktif şirket (`activeCompanyId`).
 * 3. `useSession().user.roles`: Keycloak realm claim'leri (bootstrap).
 *
 * Çoklu Şirket (Multi-Tenant) Kuralı:
 * Kullanıcı A tenant'ında "Admin", B tenant'ında "Guest" olabilir.
 * Şirket değiştirildiğinde `role` ve `isTenantAdmin` anında o şirketin rolüne döner.
 */
export function useEffectiveRole(): EffectiveRoleState {
  const { data: sessionData } = useSession();
  const catalogRole = useAuthRoleStore((s) => s.role);
  const tenantRoles = useAuthRoleStore((s) => s.tenantRoles);
  const activeTenantId = useCompanyStore((s) => s.activeCompanyId);

  // `next-auth/react`'ün generic'siz `useSession`'ı core `Session` döndürür;
  // uygulama tipi (`@/lib/auth` Session — `user.roles` genişletmesi) cast.
  const session = sessionData as unknown as Session | null;

  const realmAdmin = hasRealmRole(session, APP_ADMIN_ROLE);
  const isSystemAdmin = realmAdmin || catalogRole === CATALOG_ADMIN_ROLE;

  const ready = realmAdmin || catalogRole !== undefined;

  // Aktif tenant'taki atanmış özel rol
  const tenantRole = activeTenantId && tenantRoles[activeTenantId] ? tenantRoles[activeTenantId] : null;

  // Tenant rolü varsa o geçerlidir; yoksa sistem admini ise "System Administrator",
  // normal kullanıcı ise catalogRole, oturum yoksa null.
  let role: string | null = null;
  if (!session) {
    role = null;
  } else if (tenantRole) {
    role = tenantRole;
  } else if (catalogRole) {
    role = catalogRole;
  } else {
    role = "Guest";
  }

  const isTenantAdmin = tenantRole === "Admin" || (isSystemAdmin && !tenantRole);
  const isAdmin = isSystemAdmin || tenantRole === "Admin";

  return {
    ready,
    role,
    isAdmin,
    activeTenantId,
    tenantRole,
    isSystemAdmin,
    isTenantAdmin,
  };
}
