"use client";

import { pdf } from "@react-pdf/renderer";
import { FinancialReportDocument } from "@/blocks/pdfx/report-financial/report-financial";

/**
 * Stok Item ve Analiz raporu için PDF belgesi oluşturur ve
 * tarayıcının yerel yazıcı/baskı diyaloğunu başlatır.
 */
export async function printStockItemReport(): Promise<void> {
  const blob = await pdf(<FinancialReportDocument />).toBlob();
  const url = URL.createObjectURL(blob);

  return new Promise((resolve) => {
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.style.opacity = "0";
    iframe.style.pointerEvents = "none";
    iframe.src = url;

    const cleanup = () => {
      try {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
      } catch {
        // Ignore cleanup errors
      }
      URL.revokeObjectURL(url);
      resolve();
    };

    iframe.onload = () => {
      setTimeout(() => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch (err) {
          console.warn("[PDF Print] Iframe print failed, falling back to window.open:", err);
          window.open(url, "_blank");
        }
        setTimeout(cleanup, 60_000);
      }, 300);
    };

    iframe.onerror = () => {
      console.warn("[PDF Print] Iframe load error, opening in new window");
      window.open(url, "_blank");
      setTimeout(cleanup, 60_000);
    };

    document.body.appendChild(iframe);
  });
}

// Geriye dönük uyumluluk takma adı (alias)
export const printStockAnalyticsReport = printStockItemReport;
