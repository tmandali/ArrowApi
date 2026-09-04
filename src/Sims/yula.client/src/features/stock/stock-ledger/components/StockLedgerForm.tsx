"use client";

import { ItemFormShell } from "@/features/stock/item"

export function StockLedgerForm() {
  return (
    <ItemFormShell
      variant="ledger"
      tabs={["tax"]}
      defaultTab="tax"
      tabLabels={{
        tax: "Data Prepare",
      }}
    />
  )
}
