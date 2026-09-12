"use client";

import { ItemFormShell } from "@/workspaces/stock/item"
import { useTranslations } from "next-intl"

export function StockLedgerForm() {
  const t = useTranslations("Stock");
  return (
    <ItemFormShell
      variant="ledger"
      tabs={["tax"]}
      defaultTab="tax"
      tabLabels={{
        tax: t("data_prepare"),
      }}
    />
  )
}
