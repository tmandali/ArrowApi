/**
 * Node built-in test runner:
 *   npx tsx --test src/features/auth/lib/app-user-sync.test.ts
 * Session → app_users rol eşlemesi (saf logic; DB/auth çağrısı yok).
 *
 * ÖNEM: `appRoleForSession` realm-roles'tan import edilir — realm-roles
 * runtime'da sıfır ağırlıklı bağımlılık taşır (tip importları tırna).
 * `app-user-sync` modülü pg Pool'a açılır; onu import etmek `npm test`
 * (tsx --test, force-exit yok) sürecini asılı bırakır.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { appRoleForSession } from "./realm-roles.ts";
import type { Session } from "@/lib/auth";

function sessionWithRoles(roles: string[]): Session {
  return {
    user: {
      id: "sub-keycloak-test",
      name: "Test User",
      email: "test@example.com",
      roles,
    },
  } as Session;
}

describe("appRoleForSession", () => {
  it("Keycloak app-admin → System Administrator", () => {
    assert.equal(appRoleForSession(sessionWithRoles(["app-admin"])), "System Administrator");
  });

  it("sadece app-user rolü → Viewer (varsayılan)", () => {
    assert.equal(appRoleForSession(sessionWithRoles(["app-user"])), "Viewer");
  });

  it("rolsuz session (Google) → Viewer", () => {
    assert.equal(appRoleForSession(sessionWithRoles([])), "Viewer");
  });

  it("null session → Viewer", () => {
    assert.equal(appRoleForSession(null), "Viewer");
  });
});
