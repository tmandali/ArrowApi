/**
 * Keycloak realm rol yardımcıları (RBAC).
 *
 * Roller `auth.ts`'te access token'daki `realm_access.roles`'tan okunup
 * session'a taşınır (`session.user.roles`). Google ile girenlerde dizi
 * boştur — rol kapısı yazarken Google kullanıcılarını kilitlememeye dikkat:
 * `requireRealmRole` rol yoksa `false` döner, yönlendirme yapmaz; yönlendirme
 * kararı çağıran sayfadadır.
 */
import type { Session } from "@/lib/auth";

export const APP_USER_ROLE = "app-user";
export const APP_ADMIN_ROLE = "app-admin";

/** Session'daki realm rolleri (yoksa boş dizi). */
export function sessionRoles(session: Session | null | undefined): string[] {
  const roles = session?.user?.roles;
  return Array.isArray(roles) ? roles : [];
}

/** Kullanıcıda bu realm rolü var mı? */
export function hasRealmRole(session: Session | null | undefined, role: string): boolean {
  return sessionRoles(session).includes(role);
}

/** Kullanıcıda rollerden en az biri var mı? */
export function hasAnyRealmRole(session: Session | null | undefined, roles: string[]): boolean {
  const mine = sessionRoles(session);
  return roles.some((r) => mine.includes(r));
}
