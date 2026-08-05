import { ItemForm } from "./ItemForm"

export function StockLedgerForm() {
  return (
    <ItemForm
      mode="stock-ledger"
      tabs={["tax"]}
      defaultTab="tax"
      tabLabels={{
        tax: "Data Prepare",
      }}
    />
  )
}
