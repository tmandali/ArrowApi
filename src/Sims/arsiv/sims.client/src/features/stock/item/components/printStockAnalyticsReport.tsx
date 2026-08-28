import { pdf } from "@react-pdf/renderer"
import { FinancialReportDocument } from "@/blocks/pdfx/report-financial/report-financial"

export async function printStockAnalyticsReport() {
  const blob = await pdf(<FinancialReportDocument />).toBlob()
  const url = URL.createObjectURL(blob)
  const printWindow = window.open(url, "_blank", "noopener,noreferrer")

  if (!printWindow) {
    URL.revokeObjectURL(url)
    throw new Error("Yazdırma penceresi açılamadı")
  }

  const cleanup = () => {
    URL.revokeObjectURL(url)
  }

  const triggerPrint = () => {
    printWindow.focus()
    printWindow.print()
  }

  printWindow.addEventListener("load", triggerPrint, { once: true })
  window.setTimeout(triggerPrint, 750)
  printWindow.addEventListener("beforeunload", cleanup, { once: true })
  window.setTimeout(cleanup, 60_000)
}
