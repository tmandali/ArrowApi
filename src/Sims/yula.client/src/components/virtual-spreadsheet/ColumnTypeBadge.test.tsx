import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import messages from "@/messages/tr.json";
import { ColumnTypeBadge } from "./ColumnTypeBadge";
import type { SpreadsheetColumn } from "./types";

function renderBadge(col: SpreadsheetColumn, isPinned = false) {
  return render(
    <NextIntlClientProvider locale="tr" messages={messages}>
      <ColumnTypeBadge col={col} isPinned={isPinned} />
    </NextIntlClientProvider>,
  );
}

describe("ColumnTypeBadge", () => {
  it("sayı tipinde '123' rozeti gösterir", async () => {
    await renderBadge({ name: "tutar", label: "Tutar", duckType: "DECIMAL" });

    await expect.element(page.getByText("123")).toBeVisible();
  });

  it("tarih tipinde takvim ikonu gösterir", async () => {
    const { container } = await renderBadge({
      name: "tarih",
      label: "Tarih",
      duckType: "DATE",
    });

    // Tarih rozeti metin değil ikon taşır.
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("mantıksal tipte 'bool' rozeti gösterir", async () => {
    await renderBadge({ name: "aktif", label: "Aktif", duckType: "BOOLEAN" });

    await expect.element(page.getByText("bool")).toBeVisible();
  });

  it("metin tipinde 'Aa' rozeti gösterir", async () => {
    await renderBadge({ name: "ad", label: "Ad", duckType: "VARCHAR" });

    await expect.element(page.getByText("Aa")).toBeVisible();
  });

  it("sabitlenmiş kolonda title içinde sabitleme bilgisi taşır", async () => {
    const { container } = await renderBadge(
      { name: "tutar", label: "Tutar", duckType: "DECIMAL" },
      true,
    );

    const badge = container.querySelector("span[title]");
    expect(badge?.getAttribute("title")).toContain("Sabitle");
  });
});
