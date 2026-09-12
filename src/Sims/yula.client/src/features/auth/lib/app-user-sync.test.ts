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
import { normalizeProvider, sessionIdentity } from "./session-identity.ts";
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

describe("normalizeProvider", () => {
  it("google-onesig → google (aynı hesap 2 satır üretmesin)", () => {
    assert.equal(normalizeProvider("google-onesig"), "google");
  });

  it("google → google (büyük/küçük harf + trim duyarsız)", () => {
    assert.equal(normalizeProvider("Google "), "google");
  });

  it("keycloak → keycloak", () => {
    assert.equal(normalizeProvider("KEYCLOAK"), "keycloak");
  });

  it("bilinmeyen provider adı korunur", () => {
    assert.equal(normalizeProvider("github"), "github");
  });

  it("null/boş → null", () => {
    assert.equal(normalizeProvider(null), null);
    assert.equal(normalizeProvider("  "), null);
  });
});

function sessionOf(provider: string | undefined, sub?: string): Session {
  return {
    user: { id: sub ?? "sub-x", name: "T", email: "t@e.com", provider },
  } as Session;
}

describe("sessionIdentity", () => {
  it("provider + sub → (provider, providerId)", () => {
    assert.deepEqual(sessionIdentity(sessionOf("keycloak", "kc-sub")), {
      provider: "keycloak",
      providerId: "kc-sub",
    });
  });

  it("google-onesig normalizasyonu kimlikte de uygulanır", () => {
    assert.deepEqual(sessionIdentity(sessionOf("google-onesig", "g-1")), {
      provider: "google",
      providerId: "g-1",
    });
  });

  it("provider'sız session (tek kullanıcı modu) → null", () => {
    assert.equal(sessionIdentity(sessionOf(undefined)), null);
  });

  it("unknown sub → null", () => {
    assert.equal(sessionIdentity(sessionOf("keycloak", "unknown")), null);
  });

  it("null/undefined session → null", () => {
    assert.equal(sessionIdentity(null), null);
    assert.equal(sessionIdentity(undefined), null);
  });
});
