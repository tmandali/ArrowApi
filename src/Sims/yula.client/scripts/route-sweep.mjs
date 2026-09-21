// Tüm route'ları ziyaret edip 404/5xx + tekrar eden konsol uyarılarını toplar.
// Kullanım: PORT=56402 node scripts/route-sweep.mjs   (veya PORT=56403)
import { chromium } from "@playwright/test";

const BASE = `http://localhost:${process.env.PORT || 56402}`;
const ROUTES = [
  "/sign-in", "/sign-up", "/login", "/forgot-password", "/my", "/my/settings",
  "/accounting", "/accounting/dashboard",
  "/manufacturing", "/manufacturing/dashboard",
  "/selling", "/selling/dashboard",
  "/stock", "/stock/dashboard", "/stock/item",
  "/stock/retail-sales-report", "/stock/stock-analytics", "/stock/stock-balance",
  "/stock/stock-ledger",
  "/stock/retail-sales-report/00000000-0000-0000-0000-000000000000",
  "/stock/stock-analytics/00000000-0000-0000-0000-000000000000",
  "/stock/stock-balance/00000000-0000-0000-0000-000000000000",
  "/subcontracting", "/subcontracting/dashboard",
  "/system/agents", "/system/skills", "/system/users",
  "/agents/a1b2c3d4", "/financial-reports",
  "/spike/duckdb", "/spike/duckdb-persist", "/spike/agent-debug",
  "/icon.svg", "/icon.png", "/apple-icon.png", "/favicon.ico", "/favicon.png",
  "/robots.txt", "/manifest.json",
];

const b = await chromium.launch({ headless: true });
const p = await (await b.newContext()).newPage();
const stats = { 404: {}, o5xx: {}, ok: 0, redirect: 0 };
const warnAgg = {};
p.on("console", (m) => {
  if (m.type() === "warning") {
    const t = m.text().slice(0, 160);
    warnAgg[t] = (warnAgg[t] || 0) + 1;
  }
});
p.on("response", (r) => {
  if (r.status() === 404) stats["404"][r.url()] = (stats["404"][r.url()] || 0) + 1;
  else if (r.status() >= 500) stats["o5xx"][`${r.status()} ${r.url()}`] = 1;
});

for (const r of ROUTES) {
  try {
    const resp = await p.goto(BASE + r, { waitUntil: "load", timeout: 30000 });
    if (r.startsWith("/")) {
      if (!resp || resp.status() === 404) stats["404"]["PAGE " + r] = 1;
      else if (resp.status() >= 300 || !!resp.redirected) stats.redirect++;
      else stats.ok++;
    }
    await p.waitForTimeout(1500);
  } catch (e) {
    console.log("SKIP", r, e.message.slice(0, 60));
  }
}
await p.waitForTimeout(4000); // son preload penceresi
await b.close();

console.log(`\n===== PORT ${process.env.PORT || 56402} =====`);
console.log(`Sayfa OK: ${stats.ok}, Redirect: ${stats.redirect}`);
console.log("\n--- 404 ---");
const flat404 = Object.keys(stats["404"]);
if (flat404.length === 0) console.log("(yok)");
else for (const k of flat404) console.log(`${k}`);
console.log("\n--- 5xx (backend kapalıysa beklenen) ---");
const f5 = Object.keys(stats.o5xx);
if (f5.length === 0) console.log("(yok)");
else for (const k of f5.slice(0, 15)) console.log(k);
console.log("\n--- Tekrar eden konsol uyarıları (count x mesaj) ---");
const ws = Object.entries(warnAgg).sort((a, b) => b[1] - a[1]);
if (ws.length === 0) console.log("(uyarı yok)");
else for (const [t, n] of ws) console.log(`${n}x  ${t}`);
