/**
 * Workspace arama kataloğu — TEK KAYNAK.
 *
 * Menü öğeleri workspace'ların nav tanımlarından (routes.ts → WorkspaceNavItem)
 * türetilir; elle küratörlü TR zenginleştirmesi (titleTr/description/keywords)
 * aşağıdaki SEARCH_ITEM_OVERRIDES tablosunda URL anahtarıyla tutulur.
 *
 *  - Nav'a yeni modül eklendiğinde arama listesi OTOmatik olarak güncellenir
 *    (İngilizce başlık + slug keyword'leriyle gelir; TR etiket/keyword
 *     kalitesi için overrides'e girilir — geçiş durumu zararsızdır).
 *  - Overrides yalnızca zenginleştirir; öğe ekleme/çıkarma yalnız nav
 *    üzerinden yapılır → drift yapısal olarak imkânsızdır.
 *
 * Agrege modül `src/lib/workspace-registry.ts` deseniyle workspace
 * tanımlarından (workspace.config.ts → navigation) beslenir; workspace
 * sınırları korunur. (index.ts Public API zinciri dev-only YAML manifest
 * importlarını taşır; catalog hafif kalmak için config modüllerini kullanır.)
 */
import type { WorkspaceNavItem } from "@/types";
import { stockWorkspace } from "@/workspaces/stock/workspace.config";
import { accountingWorkspace } from "@/workspaces/accounting/workspace.config";
import { sellingWorkspace } from "@/workspaces/selling/workspace.config";
import { manufacturingWorkspace } from "@/workspaces/manufacturing/workspace.config";
import { subcontractingWorkspace } from "@/workspaces/subcontracting/workspace.config";

export interface WorkspaceMenuItem {
  id: string;
  title: string;
  titleTr: string;
  url: string;
  category: string;
  workspace: string;
  description: string;
  keywords: string[];
}

/** Küratörlü overlay alanları (nav'dan otomatik gelen: title, url, workspace). */
export interface SearchItemOverride {
  id?: string;
  titleTr?: string;
  category?: string;
  description?: string;
  keywords?: string[];
}

/**
 * Üst grup başlıkları için kapalı kategori token seti (TR; SearchCats
 * pipeline'ı bu token'larla eşleşir; tanımı olmayan grup → "İşlemler").
 */
const GROUP_CATEGORY_TOKENS: Record<string, string> = {
  reports: "Raporlar",
  "financial reports": "Raporlar",
  "other reports": "Raporlar",
  tools: "Araçlar",
  settings: "Ayarlar",
  catalog: "Katalog",
  customers: "Katalog",
};

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function groupCategory(parentTitle: string | undefined): string {
  if (!parentTitle) return "İşlemler";
  return GROUP_CATEGORY_TOKENS[parentTitle.toLowerCase()] ?? "İşlemler";
}

/** Basit Türkçe kök-elemi; fast-path keyword üretimi için. */
function normalizeKeyword(word: string): string {
  return word.toLowerCase().replace(/(larını|lerini|ları|leri|lar|ler)$/u, "");
}

interface WorkspaceNavSource {
  workspace: string;
  nav: WorkspaceNavItem[];
}

const NAV_SOURCES: WorkspaceNavSource[] = [
  { workspace: "stock", nav: stockWorkspace.navigation },
  { workspace: "accounting", nav: accountingWorkspace.navigation },
  { workspace: "manufacturing", nav: manufacturingWorkspace.navigation },
  { workspace: "subcontracting", nav: subcontractingWorkspace.navigation },
  { workspace: "selling", nav: sellingWorkspace.navigation },
];

/** Nav'dan otomatik baz öğeler (dashboard ve "#" placeholder'ları hariç). */
function deriveBaseItems(source: WorkspaceNavSource): WorkspaceMenuItem[] {
  const items: WorkspaceMenuItem[] = [];
  const seen = new Set<string>();
  const emit = (title: string, url: string, parentTitle?: string) => {
    if (!url || url === "#" || url.toLowerCase().includes("dashboard")) return;
    if (seen.has(url)) return;
    seen.add(url);
    const slug = url.replace(/^\//, "").split("/").pop() ?? slugify(title);
    const words = [...slug.split("-"), ...title.toLowerCase().split(/\s+/)]
      .map(normalizeKeyword)
      .filter((w) => w.length > 2);
    items.push({
      id: slug,
      title,
      titleTr: "",
      url,
      category: groupCategory(parentTitle),
      workspace: source.workspace,
      description: title,
      keywords: [...new Set(words)],
    });
  };

  for (const top of source.nav) {
    emit(top.title, top.url);
    for (const child of top.items ?? []) {
      emit(child.title, child.url, top.title);
    }
  }
  return items;
}

/**
 * Küratörlü TR zenginleştirme katmanı (tek kaynak: bu tablo).
 * Anahtar = nav URL'i; değer = nav'dan otomatik gelmeyen alanlar.
 */
const SEARCH_ITEM_OVERRIDES: Record<string, Record<string, SearchItemOverride>> = {
  stock: {
// === stock (35) ===
  "/stock/item": { id: "stock_item", category: "Katalog", titleTr: "Stok Kartı / Malzeme", description: "Stok kalemleri, ürün kartları, malzeme ve ürün katalog yönetimi.", keywords: ["ürün","malzeme","stok kartı","item","ürünler","stok listesi"] },
  "/stock/item-group": { id: "stock_item_group", category: "Katalog", titleTr: "Ürün Grubu", description: "Stok kalemlerinin kategorize edildiği ürün grupları.", keywords: ["ürün grubu","kategori","stok grubu","item group"] },
  "/stock/product-bundle": { id: "stock_product_bundle", category: "Katalog", titleTr: "Ürün Ağacı / Set (Bundle)", description: "Birden fazla stok kaleminden oluşan paket ürünler ve ürün ağacı paketleri.", keywords: ["ürün ağacı","bundle","paket","set","ürün paketi"] },
  "/stock/item-price": { id: "stock_item_price", category: "Katalog", titleTr: "Ürün Fiyat Listesi", description: "Satış ve satın alma ürün fiyat tanımları.", keywords: ["fiyat","ürün fiyatı","fiyat listesi","item price"] },
  "/stock/shipping-rule": { id: "stock_shipping_rule", category: "Katalog", titleTr: "Kargo & Sevkiyat Kuralı", description: "Sevkiyat ve nakliye ücret hesaplama kuralları.", keywords: ["kargo","sevkiyat","nakliye","shipping"] },
  "/stock/pricing-rule": { id: "stock_pricing_rule", category: "Katalog", titleTr: "Fiyatlandırma & İndirim Kuralı", description: "Otomatik indirimler, kampanya ve özel fiyatlandırma kuralları.", keywords: ["indirim","kampanya","fiyat kuralı","pricing rule"] },
  "/stock/item-alternative": { id: "stock_item_alternative", category: "Katalog", titleTr: "Muadil / İkame Ürün", description: "Bir stok kaleminin yerine kullanılabilecek muadil ve alternatif malzemeler.", keywords: ["muadil","alternatif","ikame","eşdeğer"] },
  "/stock/item-manufacturer": { id: "stock_item_manufacturer", category: "Katalog", titleTr: "Ürün Üreticisi", description: "Stok kalemlerinin üretici ve tedarikçi marka eşleşmeleri.", keywords: ["üretici","manufacturer","tedarikçi marka"] },
  "/stock/material-request": { id: "stock_material_request", category: "İşlemler", titleTr: "Malzeme Talebi", description: "Depolar arası transfer veya satın alma için malzeme talep belgesi.", keywords: ["talep","malzeme talebi","satın alma talebi","transfer talebi"] },
  "/stock/stock-entry": { id: "stock_entry", category: "İşlemler", titleTr: "Stok Giriş / Çıkış / Transfer Fişi", description: "Depolar arası stok transferi, üretime malzeme çıkışı, zayiat ve stok giriş fişleri.", keywords: ["stok fişi","stok girişi","stok çıkışı","transfer fişi","zayiat"] },
  "/stock/delivery-note": { id: "stock_delivery_note", category: "İşlemler", titleTr: "Teslimat İrsaliyesi", description: "Müşteriye gönderilen ürünlerin çıkışını sağlayan sevk irsaliyesi.", keywords: ["irsaliye","teslimat","sevk irsaliyesi","delivery note"] },
  "/stock/purchase-receipt": { id: "stock_purchase_receipt", category: "İşlemler", titleTr: "Satın Alma Mal Kabul İrsaliyesi", description: "Tedarikçiden gelen malzemelerin depoya kabul irsaliyesi.", keywords: ["mal kabul","satın alma irsaliyesi","giriş irsaliyesi","purchase receipt"] },
  "/stock/pick-list": { id: "stock_pick_list", category: "İşlemler", titleTr: "Toplama Listesi (Pick List)", description: "Depodan siparişlerin hazırlanması için malzeme toplama emri.", keywords: ["toplama listesi","pick list","depo toplama","sipariş toplama"] },
  "/stock/delivery-trip": { id: "stock_delivery_trip", category: "İşlemler", titleTr: "Sevkiyat Rotalaması", description: "Araç sevkiyat rotaları ve teslimat tur planlaması.", keywords: ["sevkiyat rotası","teslimat rotası","araç rotası","delivery trip"] },
  "/stock/stock-ledger": { id: "stock_ledger", category: "Raporlar", titleTr: "Stok Hareket / Defteri Raporu", description: "Stok giriş, çıkış ve devir hareketlerinin detaylı kronolojik kaydı.", keywords: ["stok hareketi","ekstre","stok defteri","ledger","giriş çıkış"] },
  "/stock/stock-balance": { id: "stock_balance", category: "Raporlar", titleTr: "Stok Bakiye Raporu", description: "Depo bazında anlık stok miktarları, serbest stok ve bakiye değerleri.", keywords: ["stok bakiyesi","bakiye","depo stokları","kullanılabilir stok","stok durumu"] },
  "/stock/stock-analytics": { id: "stock_analytics", category: "Raporlar", titleTr: "Stok Analitik & Trend Raporu", description: "Aylık/yıllık stok giriş-çıkış trendleri, grafikler ve stok devir analizi.", keywords: ["analiz","stok analizi","trend","grafik","stok devir hızı"] },
  "/stock/retail-sales-report": { id: "stock_retail_sales_report", category: "Raporlar", titleTr: "Perakende Satış Raporu", description: "Perakende satışların tarih, mağaza, ürün ve tutar bazlı analizini yapar. Günlük, haftalık veya aylık satış trendlerini gösterir.", keywords: ["perakende satış","satış raporu","mağaza satış","retail sales"] },
  "/stock/stock-projected-qty": { id: "stock_projected_qty", category: "Raporlar", titleTr: "Gelecek / Tahmini Stok Miktarı", description: "Gelecek siparişler ve talepler dahil beklenen projeksiyon stok miktarları.", keywords: ["projeksiyon","tahmini stok","beklenen stok","projected qty"] },
  "/stock/stock-summary": { id: "stock_summary", category: "Raporlar", titleTr: "Stok Özet Raporu", description: "Ürün grubu ve depo bazında genel stok özeti.", keywords: ["stok özeti","genel bakiye özeti","özet"] },
  "/stock/stock-ageing": { id: "stock_ageing", category: "Raporlar", titleTr: "Stok Yaşlandırma Raporu", description: "Depoda bekleme süresine göre ölü ve yavaş hareket gören stok yaşlandırması.", keywords: ["yaşlandırma","ölü stok","bekleyen ürünler","ageing"] },
  "/stock/warehouse-wise-stock-balance": { id: "stock_warehouse_wise_balance", category: "Raporlar", titleTr: "Depo Bazlı Stok Bakiye Raporu", description: "Her bir depo için ayrı ayrı stok miktarları ve bakiye dağılımı.", keywords: ["depo bazlı stok","depo bakiyeleri","lokasyon stokları"] },
  "/stock/serial-no": { id: "stock_serial_no", category: "Seri & Parti", titleTr: "Seri Numaraları", description: "Tekil ürün seri numaralarının takibi ve kayıtları.", keywords: ["seri numarası","serial no","seri no takibi","cihaz seri no"] },
  "/stock/batch": { id: "stock_batch", category: "Seri & Parti", titleTr: "Parti / Lot Numaraları", description: "Üretim ve son kullanma tarihli parti/lot takibi.", keywords: ["parti","lot","batch","parti no","son kullanma tarihi"] },
  "/stock/serial-batch-traceability": { id: "stock_serial_batch_traceability", category: "Seri & Parti", titleTr: "Seri No ve Parti İzlenebilirlik Raporu", description: "Hangi seri no veya lot hangi müşteriye satıldı veya hangi tedarikçiden geldi izlenebilirliği.", keywords: ["izlenebilirlik","seri no takibi","lot takibi","traceability"] },
  "/stock/stock-settings": { id: "stock_settings", category: "Ayarlar", titleTr: "Stok Genel Ayarları", description: "Stok modülü varsayılan ayarları, değerleme yöntemi (FIFO/Ağırlıklı Ortalama) ve izinler.", keywords: ["stok ayarları","fifo","maliyet yöntemi","değerleme"] },
  "/stock/warehouse": { id: "stock_warehouse", category: "Ayarlar", titleTr: "Depolar / Lokasyonlar", description: "Depo ağacı, fiziksel ve mantıksal depo lokasyon tanımları.", keywords: ["depo","warehouse","lokasyon","antrepo","şube deposu"] },
  "/stock/unit-of-measure": { id: "stock_uom", category: "Ayarlar", titleTr: "Ölçü Birimleri (UOM)", description: "Adet, kg, metre, koli gibi stok ölçü birimleri tanımları.", keywords: ["birim","ölçü birimi","uom","adet","kg"] },
  "/stock/brand": { id: "stock_brand", category: "Ayarlar", titleTr: "Marka Tanımları", description: "Stok kalemlerine atanabilecek marka kataloğu.", keywords: ["marka","brand","ürün markası"] },
  "/stock/stock-reconciliation": { id: "stock_reconciliation", category: "Araçlar", titleTr: "Stok Sayım & Düzeltme Fişi", description: "Fiziksel sayım sonrası sistem stok miktarlarını güncelleme ve sayım farkı düzeltme.", keywords: ["sayım","stok sayımı","stok düzeltme","reconciliation","sayım farkı"] },
  "/stock/quick-stock-balance": { id: "stock_quick_balance", category: "Araçlar", titleTr: "Hızlı Stok Sayım Bakiyesi", description: "Anlık hızlı stok miktarı sorgulama ve kontrol ekranı.", keywords: ["hızlı sayım","anlık bakiye","hızlı bakiye"] },
  "/landed-cost-voucher": { id: "stock_landed_cost_voucher", category: "Araçlar", titleTr: "İthalat / Nakliye Maliyeti Dağıtımı", description: "Gümrük, kargo ve ek maliyetlerin ürün stok maliyetine yansıtılması.", keywords: ["maliyet dağıtımı","ithalat maliyeti","landed cost","gümrük"] },
  "/stock/reports": { id: "stk_reports_group", category: "Raporlar", titleTr: "Raporlar", description: "Stok raporları toplu modülü.", keywords: ["stok raporları","stock reports","stok analizi","trend"] },
  "/stock/purchase-receipt-trends": { id: "stk_purchase_receipt_trends", category: "Raporlar", titleTr: "Mal Kabul Trendleri", description: "Mal kabul hareketlerinin trend analizi.", keywords: ["mal kabul trend","purchase receipt","giriş trendi","mal kabul"] },
  "/stock/delivery-note-trends": { id: "stk_delivery_note_trends", category: "Raporlar", titleTr: "Teslimat Notu Trendleri", description: "Teslimat/irsaliye hareketlerinin trend analizi.", keywords: ["teslimat trend","delivery note","çıkış trendi","sevk"] },
  },
  accounting: {
// === accounting (12) ===
  "/accounting/general-ledger": { id: "acc_general_ledger", category: "Raporlar", titleTr: "Genel Defter / Muhasebe Ekstresi", description: "Tüm muhasebe hesaplarının borç-alacak hareketleri ve detaylı defter ekstreleri.", keywords: ["general ledger","defteri kebir","muhasebe ekstresi","borç alacak","hesap ekstresi"] },
  "/accounting/customer-ledger": { id: "acc_customer_ledger", category: "Raporlar", titleTr: "Müşteri Cari Hesap Ekstresi", description: "Müşteri cari hesap bakiyeleri, faturalar ve tahsilat hareketleri.", keywords: ["müşteri ekstresi","customer ledger","cari bakiye","alacak takibi"] },
  "/accounting/supplier-ledger": { id: "acc_supplier_ledger", category: "Raporlar", titleTr: "Tedarikçi Cari Hesap Ekstresi", description: "Tedarikçi borç bakiyeleri, satıcı faturaları ve ödeme hareketleri.", keywords: ["tedarikçi ekstresi","supplier ledger","borç takibi","satıcı ekstresi"] },
  "/accounting/balance-sheet": { id: "acc_balance_sheet", category: "Raporlar", titleTr: "Bilanço Tablosu", description: "Şirketin varlık, kaynak, aktif ve pasif durumunu gösteren finansal bilanço.", keywords: ["bilanço","balance sheet","aktif pasif","varlıklar","özkaynaklar"] },
  "/accounting/profit-and-loss": { id: "acc_profit_loss", category: "Raporlar", titleTr: "Kâr ve Zarar Tablosu (Gelir Tablosu)", description: "Dönemsel satış gelirleri, maliyetler, faaliyet giderleri ve net kâr/zarar analizi.", keywords: ["kâr zarar","profit loss","gelir tablosu","net kâr","gelir gider"] },
  "/accounting/trial-balance": { id: "acc_trial_balance", category: "Raporlar", titleTr: "Mizan Raporu", description: "Hesap planı bazında borç-alacak toplamları ve devir mizanalari.", keywords: ["mizan","trial balance","aylık mizan","genel mizan"] },
  "/accounting/cash-flow": { id: "acc_cash_flow", category: "Raporlar", titleTr: "Nakit Akım Raporu", description: "Kasa, banka ve nakit giriş-çıkış akışlarının takibi.", keywords: ["nakit akım","cash flow","kasa banka","finansal akış"] },
  "/accounting/financial-reports": { id: "acc_financial_reports", category: "Raporlar", titleTr: "Finansal Raporlar", description: "Bilanço, kâr-zarar, nakit akım ve mizan raporlarının toplu modülü.", keywords: ["finansal rapor","financial reports","bilanço","gelir tablosu","mizan"] },
  "/accounting": { id: "acc_consolidated_report", category: "Raporlar", titleTr: "Konsolide Rapor", description: "Tüm grup ve şirket birleşik (konsolide) raporları.", keywords: ["konsolide","birleşik rapor","group","konsolide bilanço"] },
  "/accounting/ledgers": { id: "acc_ledgers", category: "Raporlar", titleTr: "Defterler", description: "Genel, müşteri ve tedarikçi defterlerinin (ekstrelerin) toplu modülü.", keywords: ["defter","ledger","ekstre","muhasebe ekstresi","defterler"] },
  "/accounting/profitability": { id: "acc_profitability", category: "Raporlar", titleTr: "Kârlılık", description: "Kârlılık ve marj analizleri modülü.", keywords: ["kârlılık","kar marjı","profitability","marj analizi"] },
  "/accounting/other-reports": { id: "acc_other_reports", category: "Raporlar", titleTr: "Diğer Raporlar", description: "Diğer muhasebe raporları modülü.", keywords: ["diğer raporlar","other reports","muhtelif rapor"] },
  },
  manufacturing: {
// === manufacturing (17) ===
  "/manufacturing/bom": { id: "mfg_bom", category: "Katalog", titleTr: "Ürün Reçetesi / Malzeme Listesi", description: "Mamul ve yarı mamullerin hammadde bileşenleri ve operasyon reçeteleri.", keywords: ["bom","ürün reçetesi","malzeme listesi","üretim reçetesi"] },
  "/manufacturing/work-order": { id: "mfg_work_order", category: "İşlemler", titleTr: "Üretim İş Emri", description: "Üretim hattına verilen imalat emri ve miktar takibi.", keywords: ["iş emri","work order","üretim emri","imalat"] },
  "/manufacturing/job-card": { id: "mfg_job_card", category: "İşlemler", titleTr: "İş Kartı / Operasyon Kaydı", description: "İstasyon bazında operatör başlama-bitiş ve süre takipleri.", keywords: ["iş kartı","job card","operasyon","istasyon"] },
  "/manufacturing/production-plan": { id: "mfg_production_plan", category: "Araçlar", titleTr: "Üretim Planlama", description: "Sipariş ve tahminlere dayalı ana üretim planlaması.", keywords: ["üretim planı","production plan","kapasite planlama"] },
  "/manufacturing/warehouse": { id: "mfg_warehouse", category: "İşlemler", titleTr: "Depo", description: "Depo hareketleri, transfer ve stok sayım işlemleri.", keywords: ["depo","warehouse","depo transferi","stok sayım"] },
  "/manufacturing/stock-entry": { id: "mfg_stock_entry", category: "İşlemler", titleTr: "Stok Girişi", description: "Üretim, transfer ve düzeltme için stok giriş-çıkış kayıtları.", keywords: ["stok girişi","stock entry","stok hareketi","transfer kaydı"] },
  "/manufacturing/forecasting": { id: "mfg_forecasting", category: "İşlemler", titleTr: "Talep Tahmini", description: "Talep tahminleme ve planlama verileri.", keywords: ["talep tahmini","forecasting","tahminleme","demand"] },
  "/landed-cost-voucher": { id: "mfg_master_production_schedule", category: "İşlemler", titleTr: "Ana Üretim Programı", description: "Ana üretim programı (MPS) planı.", keywords: ["ana üretim programı","master production schedule","mps","üretim programı"] },
  "/manufacturing/sales-forecast": { id: "mfg_sales_forecast", category: "İşlemler", titleTr: "Satış Tahmini", description: "Satış tahminleri ve plan senaryoları.", keywords: ["satış tahmini","sales forecast","satış planı","tahmin"] },
  "/manufacturing/production-planning-report": { id: "mfg_production_planning_report", category: "Raporlar", titleTr: "Planlama Raporu", description: "Üretim planlama ve kapasite raporları.", keywords: ["planlama raporu","production planning","üretim planı","kapasite"] },
  "/manufacturing/tools": { id: "mfg_tools", category: "Araçlar", titleTr: "Araçlar", description: "Üretim yardımcı araçları modülü.", keywords: ["araçlar","tools","üretim araçları","yardımcı araç"] },
  "/manufacturing/reports": { id: "mfg_reports_group", category: "Raporlar", titleTr: "Raporlar", description: "Üretim raporları toplu modülü.", keywords: ["üretim raporları","manufacturing reports","iş emri özeti","duruş analizi"] },
  "/manufacturing/reports-production-planning": { id: "mfg_reports_production_planning", category: "Raporlar", titleTr: "Planlama Raporu", description: "Raporlar altında üretim planlama raporu.", keywords: ["planlama raporu","reports production planning","üretim plan raporu"] },
  "/manufacturing/work-order-summary": { id: "mfg_work_order_summary", category: "Raporlar", titleTr: "İş Emri Özeti", description: "İş emirleri özet ve durum raporu.", keywords: ["iş emri özeti","work order summary","iş emri","üretim emri"] },
  "/manufacturing/quality-inspection-summary": { id: "mfg_quality_inspection_summary", category: "Raporlar", titleTr: "Kalite Kontrol Özeti", description: "Kalite kontrol sonuçları özet raporu.", keywords: ["kalite kontrol","quality inspection","kalite raporu","kontrol"] },
  "/manufacturing/downtime-analysis": { id: "mfg_downtime_analysis", category: "Raporlar", titleTr: "Duruş Analizi", description: "Makine ve hat duruş analizi.", keywords: ["duruş analizi","downtime analysis","makine duruşu","hat duruşu"] },
  "/manufacturing/job-card-summary": { id: "mfg_job_card_summary", category: "Raporlar", titleTr: "İş Kartı Özeti", description: "İş kartı özet ve ilerleme raporu.", keywords: ["iş kartı özeti","job card summary","iş kartı","üretim kartı"] },
  },
  subcontracting: {
// === subcontracting (14) ===
  "/subcontracting/inward-subcontracting-order": { id: "sub_inward_order", category: "İşlemler", titleTr: "Fason Üretim Siparişi", description: "Fason tedarikçiye verilen hammadde gönderimli üretim emri.", keywords: ["fason","subcontracting","fason sipariş","fason emri"] },
  "/subcontracting/subcontracting-delivery": { id: "sub_delivery", category: "İşlemler", titleTr: "Fason Malzeme Çıkış İrsaliyesi", description: "Fason üreticiye gönderilen hammaddelerin sevk irsaliyesi.", keywords: ["fason teslimat","fason sevk","malzeme çıkışı"] },
  "/subcontracting/subcontracting-receipt": { id: "sub_receipt", category: "İşlemler", titleTr: "Fason Mal Kabul İrsaliyesi", description: "Fasoncudan tamamlanıp gelen ürünlerin depoya kabul irsaliyesi.", keywords: ["fason mal kabul","fason giriş","fason irsaliyesi"] },
  "/subcontracting/inward-subcontracting": { id: "sc_inward_subcontracting", category: "İşlemler", titleTr: "İşletme Dışı Giriş", description: "İşletme dışı (fason) giriş işlemleri modülü.", keywords: ["fason giriş","inward","işletme dışı","fason"] },
  "/subcontracting/outward-subcontracting": { id: "sc_outward_subcontracting", category: "İşlemler", titleTr: "İşletme Dışı Çıkış", description: "İşletme dışı (fason) çıkış işlemleri modülü.", keywords: ["fason çıkış","outward","hammadde sevk","işletme dışı"] },
  "/subcontracting/purchase-order": { id: "sc_purchase_order", category: "İşlemler", titleTr: "Satınalma Emri", description: "Fason tedarik satınalma emirleri.", keywords: ["satınalma emri","purchase order","fason satınalma","tedarik emri"] },
  "/subcontracting/subcontracting-raw-materials": { id: "sc_raw_materials", category: "İşlemler", titleTr: "İşletme Dışı Hammadde", description: "Fason üretim hammadde yönetimi.", keywords: ["hammadde","raw material","fason hammadde","hammadde sevk"] },
  "/subcontracting/operations": { id: "sc_ops_quality", category: "İşlemler", titleTr: "Operasyonlar & Kalite", description: "Fason operasyon ve kalite kontrol modülü.", keywords: ["operasyon","fason operasyon","fason kalite","kalite kontrol"] },
  "/subcontracting/inspection": { id: "sc_inspection", category: "İşlemler", titleTr: "Kontrol", description: "Fason teslimat kalite kontrolü.", keywords: ["kontrol","inspection","fason kontrol","kalite kontrol"] },
  "/subcontracting/job-work-register": { id: "sc_job_work_register", category: "Raporlar", titleTr: "İş Kayıt Defteri", description: "İşletme dışı iş kayıtları defteri.", keywords: ["iş kayıt defteri","job work register","fason kayıtları"] },
  "/subcontracting/tools": { id: "sc_tools", category: "Araçlar", titleTr: "Araçlar", description: "Fason yardımcı araçları modülü.", keywords: ["fason araçları","tools","yardımcı araç"] },
  "/subcontracting/reports": { id: "sc_reports_group", category: "Raporlar", titleTr: "Raporlar", description: "Fason raporları toplu modülü.", keywords: ["fason raporları","subcontracting reports","fason özet"] },
  "/subcontracting/subcontracting-order-summary": { id: "sc_order_summary", category: "Raporlar", titleTr: "İşletme Dışı Emri Özeti", description: "Fason emir özet raporu.", keywords: ["fason emri özeti","subcontracting order","fason emri"] },
  "/subcontracting/settings": { id: "sc_settings", category: "Ayarlar", titleTr: "Ayarlar", description: "Fason modülü parametre ayarları.", keywords: ["fason ayarları","subcontracting settings","parametre"] },
  },
  selling: {
// === selling (10) ===
  "/selling/sales-order": { id: "sell_sales_order", category: "İşlemler", titleTr: "Sipariş", description: "Satış siparişlerinin oluşturulması ve takibi.", keywords: ["sipariş","sales order","satış siparişi","so"] },
  "/selling/quotations": { id: "sell_quotations", category: "İşlemler", titleTr: "Teklifler", description: "Satış tekliflerinin hazırlanması.", keywords: ["teklif","quotation","satış teklifi","fiş"] },
  "/selling/customers": { id: "sell_customers", category: "Katalog", titleTr: "Müşteriler", description: "Müşteri kartları ve hesap listesi.", keywords: ["müşteri","customers","müşteri kartı","müşteri listesi"] },
  "/selling/sales-invoice": { id: "sell_sales_invoice", category: "İşlemler", titleTr: "Fatura", description: "Satış faturaları.", keywords: ["fatura","sales invoice","satış faturası","tahakkuk"] },
  "/selling/delivery-note": { id: "sell_delivery_note", category: "İşlemler", titleTr: "Teslimat Notu", description: "Teslimat ve sevkiyat kayıtları.", keywords: ["teslimat notu","delivery note","sevkiyat","satış irsaliyesi"] },
  "/selling/reports": { id: "sell_reports_group", category: "Raporlar", titleTr: "Raporlar", description: "Satış raporları toplu modülü.", keywords: ["satış raporları","sales reports","satış analizi"] },
  "/selling/sales-analytics": { id: "sell_sales_analytics", category: "Raporlar", titleTr: "Satış Analizleri", description: "Satış performans analizi.", keywords: ["satış analizi","sales analytics","gelir analizi","satış performansı"] },
  "/selling/sales-funnel": { id: "sell_sales_funnel", category: "Raporlar", titleTr: "Satış Hunisi", description: "Satış hunisi ve fırsat takibi.", keywords: ["satış hunisi","sales funnel","fırsat takibi","pipeline"] },
  "/selling/customer-ledger-summary": { id: "sell_customer_ledger_summary", category: "Raporlar", titleTr: "Müşteri Defteri Özeti", description: "Müşteri defteri (cari) özet raporu.", keywords: ["müşteri defteri","customer ledger","cari özet","cari ekstresi"] },
  "/selling/settings": { id: "sell_settings", category: "Ayarlar", titleTr: "Ayarlar", description: "Satış modülü parametre ayarları.", keywords: ["satış ayarları","selling settings","parametre"] },
  },
};

function mergeWithOverrides(
  base: WorkspaceMenuItem[],
  workspace: string,
): WorkspaceMenuItem[] {
  const overrides = SEARCH_ITEM_OVERRIDES[workspace] ?? {};
  const merged: WorkspaceMenuItem[] = base.map((item) => {
    const o = overrides[item.url];
    if (!o) return item;
    return {
      ...item,
      id: o.id ?? item.id,
      titleTr: o.titleTr ?? item.titleTr,
      category: o.category ?? item.category,
      description: o.description ?? item.description,
      keywords: o.keywords ?? item.keywords,
    };
  });

  // Nav'da olmayan ancak küratörlü overlay olarak tanımlanmış özel sayfalar
  // (ör. rapor ekranları): yalnız bu tablodaki kayıtlar kalıcıdır.
  for (const [url, o] of Object.entries(overrides)) {
    if (merged.some((i) => i.url === url)) continue;
    const lastSegment = url.replace(/^\//, "").split("/").pop() ?? url;
    const prettyTitle = lastSegment
      .split("-")
      .filter(Boolean)
      .map((w) => w[0]?.toUpperCase() + w.slice(1))
      .join(" ");
    merged.push({
      id: o.id ?? lastSegment,
      title: prettyTitle,
      titleTr: o.titleTr ?? "",
      url,
      category: o.category ?? "İşlemler",
      workspace,
      description: o.description ?? prettyTitle,
      keywords: o.keywords ?? [],
    });
  }
  return merged;
}

const CATALOG_SOURCES: Record<string, { base: WorkspaceMenuItem[]; items: WorkspaceMenuItem[] }> = {
  stock: (() => {
    const base = deriveBaseItems(NAV_SOURCES[0]);
    return { base, items: mergeWithOverrides(base, "stock") };
  })(),
  accounting: (() => {
    const base = deriveBaseItems(NAV_SOURCES[1]);
    return { base, items: mergeWithOverrides(base, "accounting") };
  })(),
  manufacturing: (() => {
    const base = deriveBaseItems(NAV_SOURCES[2]);
    return { base, items: mergeWithOverrides(base, "manufacturing") };
  })(),
  subcontracting: (() => {
    const base = deriveBaseItems(NAV_SOURCES[3]);
    return { base, items: mergeWithOverrides(base, "subcontracting") };
  })(),
  selling: (() => {
    const base = deriveBaseItems(NAV_SOURCES[4]);
    return { base, items: mergeWithOverrides(base, "selling") };
  })(),
};

export const STOCK_WORKSPACE_MENU_ITEMS: WorkspaceMenuItem[] = CATALOG_SOURCES.stock.items;
export const ACCOUNTING_WORKSPACE_MENU_ITEMS: WorkspaceMenuItem[] = CATALOG_SOURCES.accounting.items;
export const MANUFACTURING_WORKSPACE_MENU_ITEMS: WorkspaceMenuItem[] = CATALOG_SOURCES.manufacturing.items;
export const SUBCONTRACTING_WORKSPACE_MENU_ITEMS: WorkspaceMenuItem[] = CATALOG_SOURCES.subcontracting.items;
export const SELLING_WORKSPACE_MENU_ITEMS: WorkspaceMenuItem[] = CATALOG_SOURCES.selling.items;

export const ALL_WORKSPACE_MENU_ITEMS: WorkspaceMenuItem[] = [
  ...STOCK_WORKSPACE_MENU_ITEMS,
  ...ACCOUNTING_WORKSPACE_MENU_ITEMS,
  ...MANUFACTURING_WORKSPACE_MENU_ITEMS,
  ...SUBCONTRACTING_WORKSPACE_MENU_ITEMS,
  ...SELLING_WORKSPACE_MENU_ITEMS,
];

export interface WorkspaceSearchConfig {
  workspace: string;
  name: string;
  nameTr: string;
  examples: string[];
}

export const WORKSPACE_SEARCH_CONFIGS: Record<string, WorkspaceSearchConfig> = {
  all: {
    workspace: "all",
    name: "All Modules",
    nameTr: "Tüm Modüller",
    examples: ["stok bakiye", "genel defter", "iş emri"],
  },
  system: {
    workspace: "system",
    name: "All Modules",
    nameTr: "Tüm Modüller",
    examples: ["stok bakiye", "genel defter", "iş emri"],
  },
  stock: {
    workspace: "stock",
    name: "Stock",
    nameTr: "Stok",
    examples: ["stock balance", "malzeme talebi", "pick list"],
  },
  accounting: {
    workspace: "accounting",
    name: "Accounting",
    nameTr: "Muhasebe & Finans",
    examples: ["general ledger", "kasa & banka", "cari hesap"],
  },
  manufacturing: {
    workspace: "manufacturing",
    name: "Manufacturing",
    nameTr: "Üretim",
    examples: ["work order", "malzeme listesi", "iş kartı"],
  },
  subcontracting: {
    workspace: "subcontracting",
    name: "Subcontracting",
    nameTr: "Fason & Tedarik",
    examples: ["inward order", "fason teslimat", "purchase order"],
  },
  selling: {
    workspace: "selling",
    name: "Selling",
    nameTr: "Satış",
    // Satış araması kapsamı hem selling modüllerini hem fason (cross kural)
    // öğelerini içerir; örnekler iki kapsamı da temsil eder.
    examples: ["sipariş", "teklif", "fason teslimat"],
  },
};

/**
 * Arama paneli boş durum quick items — veri sahibi KATALOG; panel
 * (`workspace-search-panel.tsx`) yalnızca render eder. `icon` = Lucide ikon
 * adı (panel içindeki harita ile çözümlenir; bilinemeyen adı Package döner).
 * URL'ler `emptyModulePath` slug sözleşmesiyle (`/accounting/balance-sheet` vb.)
 * ve workspace root/dashboard rotalarıyla birebir eşleşmelidir.
 */
export interface WorkspaceQuickItem {
  title: string;
  url: string;
  icon?: string;
  /** Item'ın satır sonuna eklenen kısayol (örn. "↵"). */
  shortcut?: string;
}

export interface WorkspaceQuickItemGroup {
  heading: string;
  items: WorkspaceQuickItem[];
}

export const WORKSPACE_QUICK_ITEMS: Record<string, WorkspaceQuickItemGroup[]> = {
  accounting: [
    {
      heading: "FINANCIAL REPORTS PAGES",
      items: [
        { title: "Consolidated Report", url: "/accounting", icon: "BarChart2", shortcut: "↵" },
        { title: "Balance Sheet", url: "/accounting/balance-sheet", icon: "FileText" },
        { title: "Profit and Loss", url: "/accounting/profit-and-loss", icon: "TrendingUp" },
        { title: "Cash Flow", url: "/accounting/cash-flow", icon: "DollarSign" },
      ],
    },
  ],
  stock: [
    {
      heading: "STOK SAYFALARI",
      items: [
        { title: "Stock Dashboard", url: "/stock/dashboard", icon: "Package", shortcut: "↵" },
        { title: "Serial No and Batch Traceability", url: "/stock/serial-batch-traceability", icon: "Scale" },
        { title: "Stock Entry", url: "/stock/stock-entry", icon: "Receipt" },
        { title: "Delivery Note", url: "/stock/delivery-note", icon: "Truck" },
      ],
    },
    {
      heading: "STOK RAPORLARI",
      items: [
        { title: "Stock Ledger", url: "/stock/stock-ledger", icon: "BarChart2" },
        { title: "Stock Balance", url: "/stock/stock-balance", icon: "BarChart2" },
        { title: "Stock Analytics", url: "/stock/stock-analytics", icon: "BarChart2" },
      ],
    },
  ],
};

/** Workspace'i quick item tanımlamamışsa gösterilen genel gruplar. */
export const DEFAULT_WORKSPACE_QUICK_ITEMS: WorkspaceQuickItemGroup[] = [
  {
    heading: "GENEL SAYFALAR",
    items: [{ title: "Stock Main", url: "/stock", icon: "Package" }],
  },
];

/**
 * Bildirim popover'ı: workspace route'u → i18n başlık anahtarı
 * (namespace `Notifications`). Tanımsız route → `subcontracting_title`.
 */
export const WORKSPACE_NOTIFICATION_TITLE_KEYS: Record<string, string> = {
  "/accounting": "financial_title",
  "/stock": "stock_title",
  "/manufacturing": "manufacturing_title",
};
