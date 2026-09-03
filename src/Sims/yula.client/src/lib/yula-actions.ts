/**
 * Bilinen rapor/ekran aksiyonları — kapalı enum (rapor adları veridir,
 * kelime listesi değildir). Hem sohbet renderer'ı hem entity plugin kullanır.
 */

export interface KnownSystemAction {
  pattern: RegExp
  prompt: string
  label: string
  scope?: string
}

export const KNOWN_SYSTEM_ACTIONS: KnownSystemAction[] = [
  // Stok Raporları & Modülleri
  {
    pattern: /stok bakiye(?:si|sini|ye|leri|lerinin)?(?:\s+raporu|\s+raporları|\s+raporunu)?|stock balance(?:\s+report)?/i,
    prompt: "Stok Bakiyesi hazırla",
    label: "Stok Bakiyesi",
    scope: "stock-balance",
  },
  {
    pattern: /perakende satış(?:\s+raporu|\s+raporları|\s+raporunu)?|retail sales(?:\s+report)?/i,
    prompt: "Perakende Satış Raporu hazırla",
    label: "Perakende Satış",
    scope: "retail-sales-report",
  },
  {
    pattern: /stok analiti(?:k|ği|ğini|kleri|klerinin)?(?:\s+raporu|\s+raporları|\s+raporunu)?|stock analytics(?:\s+report)?/i,
    prompt: "Stok Analitik Raporu hazırla",
    label: "Stok Analitik Raporu",
    scope: "stock-analytics",
  },
  {
    pattern: /stok defteri(?:ni|leri|lerinin)?(?:\s+raporu|\s+raporları)?|stock ledger(?:\s+report)?/i,
    prompt: "Stok Defteri hazırla",
    label: "Stok Defteri",
    scope: "stock-ledger",
  },
  {
    pattern: /seri(?:\/|\s+ve\s+)lot izlenebilirli(?:k|ği|ğini)?(?:\s+raporu|\s+raporları)?|serial(?:\/|\s+and\s+)batch traceability(?:\s+report)?/i,
    prompt: "Seri ve Lot İzlenebilirlik Raporu hazırla",
    label: "Seri/Lot İzlenebilirlik",
    scope: "serial-batch-traceability",
  },
  {
    pattern: /stok kart(?:ı|ları|ını)?|item form/i,
    prompt: "Stok Kartı ekranını aç",
    label: "Stok Kartı",
  },
  {
    pattern: /ambar(?:lar| tanımları|ını|larını)?/i,
    prompt: "Ambarlar listesini aç",
    label: "Ambarlar",
  },
  {
    pattern: /stok girişi(?:\s+fişi|\s+fişleri)?/i,
    prompt: "Stok Girişi fişi hazırla",
    label: "Stok Girişi",
  },
  {
    pattern: /satınalma kabul(?:\s+fişi|\s+fişleri)?/i,
    prompt: "Satınalma Kabul fişlerini göster",
    label: "Satınalma Kabul",
  },
  {
    pattern: /teslimat irsaliye(?:si|leri|sini)?|delivery note/i,
    prompt: "İrsaliyeleri göster",
    label: "İrsaliyeler",
  },

  // Subcontracting (Fason)
  {
    pattern: /gelen fason sipariş(?:i|leri|lerini)?|inward subcontracting/i,
    prompt: "Gelen Fason Siparişlerini aç",
    label: "Gelen Fason Siparişleri",
  },
  {
    pattern: /giden fason sipariş(?:i|leri|lerini)?|outward subcontracting/i,
    prompt: "Giden Fason Siparişlerini aç",
    label: "Giden Fason Siparişleri",
  },
  {
    pattern: /fason teslimat(?:ı|ları|larını)?/i,
    prompt: "Fason Teslimat ekranını aç",
    label: "Fason Teslimat",
  },
  {
    pattern: /fason kabul(?:ü|leri|lerini)?/i,
    prompt: "Fason Kabul fişlerini aç",
    label: "Fason Kabul",
  },
  {
    pattern: /satış sipariş(?:i|leri|lerini)?|sales order/i,
    prompt: "Satış Siparişlerini aç",
    label: "Satış Siparişleri",
  },

  // Muhasebe & Finans
  {
    pattern: /bilanço(?:\s+tablosu|\s+raporu)?|balance sheet/i,
    prompt: "Bilanço Raporu hazırla",
    label: "Bilanço",
  },
  {
    pattern: /gelir tablosu(?:\s+raporu)?|profit and loss/i,
    prompt: "Gelir Tablosu hazırla",
    label: "Gelir Tablosu",
  },
  {
    pattern: /nakit akış(?:ı)?(?:\s+tablosu|\s+raporu)?|cash flow/i,
    prompt: "Nakit Akışı Raporu hazırla",
    label: "Nakit Akışı",
  },
  {
    pattern: /(?:genel\s+)?mizan(?:\s+raporu)?|trial balance/i,
    prompt: "Genel Mizan Raporu hazırla",
    label: "Genel Mizan",
  },
  {
    pattern: /muavin defter(?:i|ini)?|general ledger/i,
    prompt: "Muavin Defteri aç",
    label: "Muavin Defter",
  },
  {
    pattern: /(?:müşteri|satıcı)\s+defter(?:i|ini)?/i,
    prompt: "Müşteri Defterini aç",
    label: "Müşteri Defteri",
  },

  // Maliyet Dağıtımı & Üretim
  {
    pattern: /maliyet yükleme fişi|landed cost voucher/i,
    prompt: "Maliyet Yükleme Fişi oluştur",
    label: "Maliyet Yükleme Fişi",
  },
  {
    pattern: /iş emir(?:i|leri|lerini)?|work order/i,
    prompt: "İş Emirlerini göster",
    label: "İş Emirleri",
  },
  {
    pattern: /ürün reçete(?:si|leri|lerini)?|bom/i,
    prompt: "Ürün Reçetelerini aç",
    label: "Ürün Reçeteleri",
  },
  {
    pattern: /üretim planlama/i,
    prompt: "Üretim Planlama ekranını aç",
    label: "Üretim Planlama",
  },
]


/** Tırnak içi komut önerisi tespiti — teknik araç adları ve rapor adları hariç. */
export function isPromptSentenceLike(candidate: string): boolean {
  const candidateLower = candidate.toLowerCase()
  const isTechnicalTool = /^(filter_|update_|clear_|analyze_|detect_|get_|create_)/i.test(candidate)
  const isSimpleReportName = KNOWN_SYSTEM_ACTIONS.some(
    (a) => a.label.toLowerCase() === candidateLower || a.scope?.toLowerCase() === candidateLower,
  )
  const isPromptSentence =
    candidate.includes(" ") &&
    (/(hazırla|hazirla|göster|goster|listele|filtrele|süz|suz|aç|ac|analiz|trend|temizle|temiz)/i.test(candidate) ||
      /^(son|bu|tüm|tum|hangi|geçen)/i.test(candidate))
  return !isTechnicalTool && !isSimpleReportName && isPromptSentence
}
