import { StockModuleShell } from "./StockModuleShell"

export function StockLedgerForm() {
  return (
    <StockModuleShell
      mode="stock-ledger"
      tabs={["tax"]}
      defaultTab="tax"
      tabLabels={{
        tax: "Data Prepare",
      }}
    />
  )
}
