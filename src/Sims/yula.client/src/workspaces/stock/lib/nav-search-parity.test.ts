/**
 * Nav-Search parity: her workspace'ın nav menüsü (routes.ts) URL'leri
 * arama katalogu (workspace-search-catalog.ts) ile hizalı kalmalı.
 *
 * Yürütme: npx tsx --test src/workspaces/stock/lib/nav-search-parity.test.ts
 *
 * Katalog nav'dan otomatik türetildiği için parity yapısal olarak sağlanır;
 * bu test regresyon koruması olarak kalır (özellikle overlays + özel sayfalar
 * için): nav'daki modül sayfaları (dashboard hariç) arama listesinde
 * karşılık bulamazsa test düşer. — bu sayede yeni nav modülü eklenirken arama
 * kataloğuyla drift oluşması derhal yakalanır.
 *
 * Not: routes.ts importları dev-time testi içindir (tsx --test); prod bundle'a
 * girmez.
 */
import { test } from "node:test";
import assert from "node:assert";
import { ALL_WORKSPACE_MENU_ITEMS } from "../../../lib/workspace-search-catalog";
import { accountingNav } from "../../../workspaces/accounting/routes.ts";
import { manufacturingNav } from "../../../workspaces/manufacturing/routes.ts";
import { sellingNav } from "../../../workspaces/selling/routes.ts";
import { subcontractingNav } from "../../../workspaces/subcontracting/routes.ts";
import { stockNav } from "../../../workspaces/stock/routes.ts";

const WORKSPACES: Record<string, Array<{ title: string; url: string; items?: Array<{ title: string; url: string }> }>> = {
  accounting: accountingNav,
  manufacturing: manufacturingNav,
  selling: sellingNav,
  subcontracting: subcontractingNav,
  stock: stockNav,
};

/** Nav'dan düz (top + child) URL listesi: "#" ve dashboard'lar hariç. */
function navModuleUrls(workspace: string): string[] {
  const urls: string[] = [];
  for (const item of WORKSPACES[workspace]) {
    if (item.url && item.url !== "#" && !item.url.toLowerCase().includes("dashboard")) {
      urls.push(item.url);
    }
    for (const child of item.items ?? []) {
      if (child.url && child.url !== "#" && !child.url.toLowerCase().includes("dashboard")) {
        urls.push(child.url);
      }
    }
  }
  return urls;
}

for (const workspace of Object.keys(WORKSPACES)) {
  test(`${workspace} nav URL'leri arama kataloğunda mevcut`, () => {
    const urls = navModuleUrls(workspace);
    assert.ok(urls.length > 0, `${workspace}: nav'den URL çıkarılamadı (test güncel mi?)`);

    const registryUrls = new Set(
      ALL_WORKSPACE_MENU_ITEMS.filter((i) => i.workspace === workspace).map((i) => i.url),
    );

    const missing = urls.filter((u) => !registryUrls.has(u));
    assert.deepStrictEqual(
      missing,
      [],
      `${workspace} nav menüsünde olup arama kataloğunda EKSİK olan URL'ler:\n` +
        missing.map((u) => `  - ${u}`).join("\n") +
        `\nBu öğeleri src/workspaces/stock/lib/stock-menu-registry.ts içine ekleyin.`,
    );
  });
}

test("workspace-önekli URL'ler tek bir workspace'e ait olmalı", () => {
  const byUrl = new Map<string, Set<string>>();
  for (const item of ALL_WORKSPACE_MENU_ITEMS) {
    const set = byUrl.get(item.url) ?? new Set<string>();
    set.add(item.workspace);
    byUrl.set(item.url, set);
  }
  const workspacePrefixes = new Set<string>([...Object.keys(WORKSPACES), "all", "system"]);
  const collisions = [...byUrl.entries()]
    // Kök seviye paylaşılan sayfalar (ör. /landed-cost-voucher) birden çok
    // workspace'e ait olabilir; yalnız workspace-önekli URL'ler teklid olmalı.
    .filter(([url, workspaces]) => {
      const prefix = url.replace(/^\//, "").split("/")[0];
      return workspacePrefixes.has(prefix) && workspaces.size > 1;
    })
    .map(([url, workspaces]) => `  - ${url} (${[...workspaces].join(", ")})`);
  assert.deepStrictEqual(collisions, [], "workspace-önekli URL çakışması:\n" + collisions.join("\n"));
});
