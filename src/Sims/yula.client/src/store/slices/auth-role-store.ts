"use client";

import { create } from "zustand";

/**
 * Etkin rol deposu (client, auth katmanı).
 *
 * `AccountStatusGuard` her `GET /api/auth/account-status` yanıtındaki
 * `role` alanını buraya yazar:
 * - `"System Administrator"` | `"Viewer"` | ... → admin kataloğa linkli
 *   kullanıcının `app_users.role` değeri
 * - `"Guest"` → kimliği var ama yönetici linki YOK (guest mod)
 * - `undefined` → henüz yüklenmedi (guard'ın ilk istek öncesi)
 *
 * Realm claim'leri (Keycloak `app-admin`) bu depoda YOKTUR — client
 * `useEffectiveAdminRole()` hook'u session rolleriyle burada birleştirir
 * (bootstrap: Keycloak admini kataloğa linklenmeden de admin kalır).
 */
type AuthRoleState = {
  /** `undefined` = ilk account-status yanıtı gelmeden. */
  role: string | undefined;
  setRole: (role: string) => void;
};

export const useAuthRoleStore = create<AuthRoleState>()((set) => ({
  role: undefined,
  setRole: (role) => set({ role }),
}));
