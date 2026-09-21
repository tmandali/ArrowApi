// Geçici teşhis scripti: headless Chromium ile konsol preload uyarıları,
// 404/5xx yanıtları ve failed request'leri toplar. Kullanım:
//   node scripts/preload-watch.mjs
import { chromium } from "@playwright/test";

const BASE = `http://localhost:${process.env.PORT || 56402}`;
const PAGES = ["/", "/sign-in", "/login", "/dashboard", "/stock"];

const consoleMsgs = [];
const responses = [];
const failedRequests = [];

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

page.on("console", (msg) =>
  consoleMsgs.push({ text: msg.text(), type: msg.type(), page: page.url() })
);
page.on("response", (res) =>
  responses.push({ status: res.status(), url: res.url(), page: page.url() })
);
page.on("requestfailed", (req) =>
  failedRequests.push({ url: req.url(), failure: req.failure()?.errorText, page: page.url() })
);

for (const p of PAGES) {
  try {
    await page.goto(BASE + p, { waitUntil: "load", timeout: 60000 });
    // Preload uyarı penceresi: window.load sonrası ~5 sn.
    await page.waitForTimeout(6000);
  } catch (e) {
    console.error("goto failed", p, e.message);
  }
}
await page.waitForTimeout(2000);
await browser.close();

// Rapor
const preloadWarns = consoleMsgs.filter(
  (m) => m.text.toLowerCase().includes("preload")
);
console.log("=== PRELOAD UYARILARI ===");
const counts = {};
for (const w of preloadWarns) {
  const m = w.text.match(/http[s]?:[^\s"]+/);
  const key = m ? m[0] : w.text.slice(0, 120);
  counts[key] = (counts[key] || 0) + 1;
}
if (Object.keys(counts).length === 0) {
  console.log("(preload uyarısı yok)");
} else {
  for (const [url, n] of Object.entries(counts)) console.log(`${n}x  ${url}`);
  console.log("--- RAW ---");
  for (const w of preloadWarns.slice(0, 4)) console.log(JSON.stringify(w));
}

console.log("\n=== 404 YANITLARI ===");
const nf = {};
for (const r of responses) {
  if (r.status === 404) nf[r.url] = (nf[r.url] || 0) + 1;
}
if (Object.keys(nf).length === 0) {
  console.log("(404 yok)");
} else {
  for (const [url, n] of Object.entries(nf)) console.log(`${n}x  ${url}`);
}

console.log("\n=== 5xx YANITLARI ===");
const ns = {};
for (const r of responses) {
  if (r.status >= 500) ns[r.url] = (ns[r.url] || 0) + 1;
}
if (Object.keys(ns).length === 0) {
  console.log("(5xx yok)");
} else {
  for (const [url, n] of Object.entries(ns)) console.log(`${n}x  ${url}`);
}

console.log("\n=== FAILED REQUESTS ===");
if (failedRequests.length === 0) {
  console.log("(failed request yok)");
} else {
  const ff = {};
  for (const f of failedRequests) {
    const k = `${f.url} [${f.failure}]`;
    ff[k] = (ff[k] || 0) + 1;
  }
  for (const [k, n] of Object.entries(ff)) console.log(`${n}x  ${k}`);
}

console.log("\n=== DİĞER KONSOL HATALARI ===");
const errs = consoleMsgs
  .filter((m) => m.type === "error" && !m.text.toLowerCase().includes("preload"))
  .slice(0, 20);
if (errs.length === 0) {
  console.log("(diğer konsol hatası yok)");
} else {
  for (const e of errs) console.log(e.text.slice(0, 300));
}
