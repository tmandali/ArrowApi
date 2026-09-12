import { describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { TableFooterSummaryRow } from "./TableFooterSummaryRow";
import type {
  ColumnAggregationConfig,
  ColumnAggregationValues,
  SpreadsheetColumn,
} from "./types";

const columns: SpreadsheetColumn[] = [
  { name: "tutar", label: "Tutar", align: "right", duckType: "DECIMAL" },
  { name: "ad", label: "Ad", align: "left", duckType: "VARCHAR" },
];

const baseProps = {
  visibleColumns: columns,
  effectivePinnedCount: 0,
  isScrolledLeft: false,
  getStickyLeftOffset: () => undefined,
  aggregationConfigs: {} as ColumnAggregationConfig,
  aggregationValues: {} as ColumnAggregationValues,
  onAggregationChange: () => {},
};

function renderFooter(overrides: Partial<typeof baseProps> = {}) {
  return render(
    <table>
      <TableFooterSummaryRow {...baseProps} {...overrides} />
    </table>,
  );
}

describe("TableFooterSummaryRow", () => {
  it("seçimsiz kolonda '+' tetikleyiciyi gösterir", async () => {
    await renderFooter();

    const trigger = page.getByTitle("Tutar (+)");
    await expect.element(trigger).toBeVisible();
  });

  it("menüden SUM seçince onAggregationChange çağrılır", async () => {
    const onAggregationChange = vi.fn();
    await renderFooter({ onAggregationChange });

    await page.getByTitle("Tutar (+)").click();
    await page.getByRole("menuitem", { name: /SUM/u }).click();

    expect(onAggregationChange).toHaveBeenCalledWith("tutar", "sum");
  });

  it("seçili özetin biçimli değerini gösterir", async () => {
    await renderFooter({
      aggregationConfigs: { tutar: "sum" },
      aggregationValues: {
        tutar: { type: "sum", label: "Σ", formatted: "1.234,50", value: 1234.5 },
      },
    });

    await expect.element(page.getByText("1.234,50")).toBeVisible();
  });
});
