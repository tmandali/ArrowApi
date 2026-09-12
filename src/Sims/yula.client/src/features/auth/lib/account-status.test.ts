/**
 * Node built-in test runner:
 *   npx tsx --test src/features/auth/lib/account-status.test.ts
 * `app_users.status` → erişim izni eşlemesi (saf logic; DB yok).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isAccountStatusActive } from "./account-status.ts";

describe("isAccountStatusActive", () => {
  it("Active → erişim var", () => {
    assert.equal(isAccountStatusActive("Active"), true);
  });

  it("Inactive → erişim yok", () => {
    assert.equal(isAccountStatusActive("Inactive"), false);
  });

  it("Deleted → erişim yok", () => {
    assert.equal(isAccountStatusActive("Deleted"), false);
  });

  it("bilinmeyen değer → fail-open (erişim var)", () => {
    assert.equal(isAccountStatusActive("Locked"), true);
  });

  it("null/undefined (satır yok / ilk giriş) → varsayılan Active", () => {
    assert.equal(isAccountStatusActive(null), true);
    assert.equal(isAccountStatusActive(undefined), true);
  });

  it("boş string → varsayılan Active", () => {
    assert.equal(isAccountStatusActive(""), true);
  });
});
