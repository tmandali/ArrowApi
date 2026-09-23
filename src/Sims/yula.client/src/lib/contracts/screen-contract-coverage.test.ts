import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import {
  resolveRouteCategory,
  isAiAllowedOnRoute,
  ScreenCategorySchema,
  type ScreenCategory,
} from "./screen-contract";

/**
 * Finds all page.tsx files recursively in src/app directory.
 */
function findPages(dir: string, baseDir: string = dir): string[] {
  let results: string[] = [];
  const list = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of list) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(findPages(fullPath, baseDir));
    } else if (entry.isFile() && entry.name === "page.tsx") {
      const rel = path.relative(baseDir, fullPath).replace(/\\/g, "/");
      results.push(rel);
    }
  }

  return results;
}

/**
 * Converts a page.tsx relative path into a Next.js route pathname.
 */
function pagePathToRoute(pageRelPath: string): string {
  // e.g. "stock/stock-balance/page.tsx" -> "/stock/stock-balance"
  // e.g. "page.tsx" -> "/"
  // e.g. "(auth)/sign-in/page.tsx" -> "/sign-in" or "/(auth)/sign-in"
  let route = pageRelPath.replace(/\/page\.tsx$/, "").replace(/^page\.tsx$/, "");
  if (!route.startsWith("/")) {
    route = `/${route}`;
  }
  return route;
}

describe("Screen Contract 100% CI Coverage Suite", () => {
  const appDir = path.resolve(process.cwd(), "src/app");
  const pages = findPages(appDir);

  it("projedeki tüm sayfa (page.tsx) rotalarını tespit eder", () => {
    assert.ok(pages.length > 20, `En az 20 sayfa bulunmalı, bulunan: ${pages.length}`);
  });

  for (const page of pages) {
    const route = pagePathToRoute(page);

    it(`Rota '${route}' (${page}) geçerli bir ScreenCategory'ye sahip olmalıdır`, () => {
      const category: ScreenCategory = resolveRouteCategory(route);

      // Zod schema ile doğrula
      const parsed = ScreenCategorySchema.safeParse(category);
      assert.ok(
        parsed.success,
        `Rota '${route}' için geçersiz kategori: ${category}`
      );

      // Circuit breaker tutarlılığı: restricted ise AI devre dışı, değilse açık olmalıdır
      if (category === "restricted") {
        assert.equal(
          isAiAllowedOnRoute(route),
          false,
          `Restricted rota '${route}' için AI engellenmelidir.`
        );
      } else {
        assert.equal(
          isAiAllowedOnRoute(route),
          true,
          `Aktif rota '${route}' için AI açık olmalıdır.`
        );
      }
    });
  }
});
