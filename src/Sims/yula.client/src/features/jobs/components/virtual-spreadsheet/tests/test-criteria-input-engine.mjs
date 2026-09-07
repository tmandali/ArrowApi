import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log("🧪 Test: Criteria Input Engine (D365/BC Syntax & Validation)");

// 1. JSON Schema yükleme
const schemaPath = path.resolve(
  __dirname,
  "../../../../../workspaces/stock/stock-balance/schemas/stock-balance-criteria.schema.json"
);
const schema = JSON.parse(fs.readFileSync(schemaPath, "utf-8"));

assert.equal(schema["x-scope"], "stock-balance", "Şema x-scope stock-balance olmalıdır");
assert.ok(schema.properties.kayitTarihi, "kayitTarihi alanı mevcut olmalıdır");
assert.ok(schema.properties.durum, "durum alanı mevcut olmalıdır");

// 2. D365 Tarih & Aralık Sözdizimi Testleri
console.log("  ▶ Checking D365 date range expressions...");

function isValidDate(str) {
  if (!str) return false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const d = new Date(str);
    return !isNaN(d.getTime());
  }
  return false;
}

function validateDateExpr(val) {
  const trimmed = String(val).trim();
  if (trimmed.includes("..")) {
    const [from, to] = trimmed.split("..");
    if (from && !isValidDate(from)) return { valid: false, reason: "invalid_from" };
    if (to && !isValidDate(to)) return { valid: false, reason: "invalid_to" };
    if (from && to && new Date(from) > new Date(to)) return { valid: false, reason: "from_after_to" };
    return { valid: true, from, to };
  }
  return { valid: isValidDate(trimmed) };
}

assert.equal(validateDateExpr("2026-08-18").valid, true, "Tekil tarih geçerli olmalıdır");
assert.equal(validateDateExpr("2026-08-01..2026-08-31").valid, true, "Geçerli aralık onaylanmalıdır");
assert.equal(validateDateExpr("..2026-08-31").valid, true, "Açık uçlu bitiş aralığı onaylanmalıdır");
assert.equal(validateDateExpr("2026-08-01..").valid, true, "Açık uçlu başlangıç aralığı onaylanmalıdır");
assert.equal(validateDateExpr("2026-08-31..2026-08-01").valid, false, "from > to hatalı kabul edilmelidir");
assert.equal(validateDateExpr("geçersiz-tarih").valid, false, "Bozuk tarih reddedilmelidir");

// 3. D365 Sayısal Karşılaştırma & Aralık Testleri
console.log("  ▶ Checking D365 numeric & comparison expressions...");

function validateNumericExpr(val) {
  if (typeof val === "number") return Number.isFinite(val);
  const str = String(val).trim();
  if (str.includes("..")) {
    const [from, to] = str.split("..");
    if (from && isNaN(Number(from))) return false;
    if (to && isNaN(Number(to))) return false;
    if (from && to && Number(from) > Number(to)) return false;
    return true;
  }
  return /^(>=|<=|>|<|<>|=)?\s*(-?\d+(\.\d+)?)$/.test(str);
}

assert.equal(validateNumericExpr(500), true, "Sayı geçerli olmalıdır");
assert.equal(validateNumericExpr(">100"), true, ">100 geçerli olmalıdır");
assert.equal(validateNumericExpr("<=500"), true, "<=500 geçerli olmalıdır");
assert.equal(validateNumericExpr("<>0"), true, "<>0 geçerli olmalıdır");
assert.equal(validateNumericExpr("100..200"), true, "100..200 geçerli olmalıdır");
assert.equal(validateNumericExpr("500..100"), false, "from > to sayı aralığı reddedilmelidir");
assert.equal(validateNumericExpr("abc"), false, "Harf girdisi reddedilmelidir");

// 4. Enum & Seçenek Doğrulama Testi
console.log("  ▶ Checking enum / status choices...");
const allowedStatus = schema.properties.durum.items.enum;
assert.deepEqual(allowedStatus, ["AKTIF", "PASIF", "BEKLEMEDE", "IPTAL"]);

function validateEnumChoice(choices, allowed) {
  const arr = Array.isArray(choices) ? choices : [choices];
  return arr.every((c) => allowed.includes(c));
}

assert.equal(validateEnumChoice(["AKTIF", "BEKLEMEDE"], allowedStatus), true);
assert.equal(validateEnumChoice("AKTIF", allowedStatus), true);
assert.equal(validateEnumChoice(["AKTIF", "BILINMEYEN"], allowedStatus), false, "Bilinmeyen statü reddedilmelidir");

// 5. Zorunlu Alan (Required) Kontrolü Testi
console.log("  ▶ Checking required fields logic...");
const requiredFields = schema.required || [];

function checkRequired(instance, required) {
  const missing = [];
  for (const req of required) {
    if (instance[req] === undefined || instance[req] === null || instance[req] === "") {
      missing.push(req);
    }
  }
  return { valid: missing.length === 0, missing };
}

assert.equal(checkRequired({ kayitTarihi: "2026-08-18" }, requiredFields).valid, true);
if (requiredFields.includes("kayitTarihi")) {
  assert.equal(checkRequired({}, requiredFields).valid, false, "kayitTarihi eksikse valid:false dönmelidir");
}

console.log("✅ All Criteria Input Engine tests PASSED successfully!\n");
