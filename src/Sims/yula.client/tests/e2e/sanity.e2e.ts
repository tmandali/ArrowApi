import { expect, test } from "@playwright/test";

// Backend/DB gerektirmez: yalnızca route koruma (proxy.ts) + auth UI.
test.describe("Sanity", () => {
  test("korumalı rota oturumsuzken sign-in'e yönlenir", async ({ page }) => {
    await page.goto("/stock/dashboard");

    await expect(page).toHaveURL(/\/sign-in\?next=%2Fstock%2Fdashboard/u);
  });

  test("sign-in sayfası başlık ve sağlayıcı alanını gösterir", async ({
    page,
  }) => {
    await page.goto("/sign-in");

    // CardTitle div'dir (heading rolü yok) — slot seçiciyle yakala.
    await expect(page.locator('[data-slot="card-title"]')).toBeVisible();
    // Sağlayıcı yoksa bilgilendirme, varsa sağlayıcı butonları görünür.
    await expect(page.locator("body")).toContainText(
      /Giriş|Sign in|sağlayıcı|providers/iu,
    );
  });
});
