import {
  dynamicTool,
  jsonSchema,
  tool,
  type ToolSet,
} from "ai";
import { z } from "zod";
import { REGISTERED_REPORTS as DEMO_REPORTS } from "@/features/reports/report-registry";
import { looksLikeIdentifierValues } from "@/lib/grid-column-values";

export interface YulaGridToolContext {
  tableName: string;
  columns: string[];
  rowCount?: number | null;
  /** Kolon → tip ("date"|"number"|"bool"|"text") — Arrow/şemasından; LLM şema grounding'i */
  columnTypes?: Record<string, string>;
  /** Düşük kardinaliteli kolon değerleri — benzersiz kimlik kolonlarını ayıklamak için */
  columnValues?: Record<string, string[]>;
}

/**
 * Tam SDK uyumu (cookbook: call-tools):
 *  - Statik araçlar **zod** ile tanımlanır → `tool-<ad>` tipli UI parçaları
 *    ve `InferUITools` üzerinden uçtan uca tip güvenliği.
 *  - Çalışma anı kolon enum'ı gerektiren grid araçları resmi `dynamicTool()`
 *    ile bildirilir → `dynamic-tool` parçaları.
 *  - execute YOKTUR: yürütme tarayıcıdadır (DuckDB/OPFS istemcide yaşar);
 *    çıktı `addToolOutput` ile geri verilir, `sendAutomaticallyWhen` akışı sürer.
 */

/**
 * get_report_schema — aktif raporun JSON şemasını (kriter alanları, tipler,
 * seçenekler, kolon tanımları) döndürür. Yürütme istemcidedir (yula-client-tools).
 */
const reportSchemaTool = tool({
  description: [
    "Aktif raporun JSON şemasını döndürür: kriter alanları (ad, tip, zorunluluk, seçenekler),",
    "kolon tanımları (rapor sahibi açıklamaları) ve rapor üstverisi.",
    "Kullanıcı 'şema', 'hangi kriterler', 'rapor tanımı', 'kolonlar ne anlama gelir' derse ÇAĞIR.",
    "Çıktıyı kullanıcıya markdown tablo ile özetle; kriter alan adlarını run_report criteria'sında aynen kullan.",
  ].join(" "),
  inputSchema: z.object({}),
  outputSchema: z.object({
    status: z.string(),
    report: z
      .object({
        scope: z.string(),
        title: z.string(),
        pagePath: z.string().optional(),
        mode: z.string().optional(),
        isViewingResults: z.boolean().optional(),
      })
      .optional(),
    activeGrid: z
      .object({
        tableName: z.string().optional(),
        title: z.string().optional(),
        columns: z.array(z.string()).optional(),
        rowCount: z.number().nullable().optional(),
        columnTypes: z.record(z.string(), z.string()).optional(),
        sampleRows: z.array(z.record(z.string(), z.unknown())).optional(),
        columnValues: z.record(z.string(), z.array(z.string())).optional(),
      })
      .optional(),
    criteria: z
      .array(
        z.object({
          name: z.string(),
          title: z.string().optional(),
          type: z.string().optional(),
          required: z.boolean().optional(),
          options: z.array(z.string()).optional(),
          description: z.string().optional(),
          dateBehavior: z.string().optional(),
        }),
      )
      .optional(),
    columnDescriptions: z.record(z.string(), z.string()).optional(),
    aliases: z.array(z.string()).optional(),
    directive: z.string().optional(),
    error: z.string().optional(),
    hint: z.string().optional(),
  }),
})

/** STATİK istemci-yürütülebilir araç seti (tipli parça üretir). */
export const STATIC_TOOLS = {
    get_report_schema: reportSchemaTool,
    run_report: tool({
      description: [
        "Bir raporu GERÇEKLEŞTİRİR (backend job başlatır) ve execution ekranında yeni job'ı seçili/çalışır gösterir.",
        `Kullanılabilir raporlar: ${DEMO_REPORTS.map((r) => r.scope).join(", ")}.`,
        "YALNIZ açık çalıştırma fiili varsa çağır: 'raporu çalıştır', 'çalıştır', 'calistir', 'run', 'execute', 'job başlat' (örn: 'geçen hafta için çalıştır').",
        "'hazırla', 'göster', 'getir', yalnız 'geçen hafta' / 'dün' gibi slot ifadeleri YETERLİ DEĞİLDİR — bu aracı ÇAĞIRMA; öneri sun veya apply_criteria için onay bekle.",
        "MEVCUT bir job'ı/sonuçları GÖRME isteklerinde (örn: 'son çalışan raporu aç', 'son sonuçlar', 'en son job') BU ARACI ÇAĞIRMA — 'open_last_report' aracını kullan.",
        "YALNIZ yeni rapor çalıştırma isteğinde kullan; açık tabloyu süzme istekleri için DEĞİL.",
      ].join(" "),
      inputSchema: z.object({
        report: z.enum(DEMO_REPORTS.map((r) => r.scope) as [string, ...string[]]),
        criteria: z
          .record(z.string(), z.unknown())
          .optional()
          .describe("Rapora özgü kriter alanları (schema anahtarlarıyla)"),
      }),
      // İstemci yürütür; çıktı tipi SDK zincirine buradan akar.
      outputSchema: z.discriminatedUnion("status", [
        z.object({
          status: z.literal("executed"),
          jobId: z.string(),
          jobStatus: z.string(),
          navigateTo: z.string(),
          message: z.string().optional(),
        }),
        z.object({
          status: z.literal("validation-error"),
          errors: z.array(z.string()),
          hint: z.string().optional(),
        }),
        z.object({
          status: z.literal("blocked"),
          reason: z.literal("incomplete-intent"),
          hint: z.string(),
          message: z.string().optional(),
        }),
        z.object({ status: z.literal("error"), error: z.string() }),
      ]),
    }),
    apply_criteria: tool({
      description: [
        "Önerilen kriterleri (ör. kayitTarihi, durum, tutarMiktar) aktif ekrandaki kriter formuna doldurur; job BAŞLATMAZ.",
        "YALNIZ açık doldurma/onay niyeti varsa çağır: '1. öneriyi uygula', 'forma doldur', 'forma yaz', 'dünü seç', 'uygula'.",
        "Yalnız 'geçen hafta', 'dün', 'AKTIF' gibi eksik ifadelerde BU ARACI ÇAĞIRMA — önce 1-2 yula-criteria öneri chip'i sun.",
        "Form doldurulur, ekranda vurgulanır ve kullanıcı ekrandaki 'Run' butonuna basarak işi kendisi çalıştırabilir.",
      ].join(" "),
      inputSchema: z.object({
        report: z.string().default("stock-balance").describe("Rapor scope'u (örn: stock-balance)"),
        criteria: z.record(z.string(), z.unknown()).describe("Forma doldurulacak kriterler"),
        presetTitle: z.string().optional().describe("Uygulanan öneri başlığı"),
      }),
      outputSchema: z.object({
        status: z.string(),
        updatedKeys: z.array(z.string()).optional(),
        message: z.string().optional(),
        reason: z.string().optional(),
        hint: z.string().optional(),
      }),
    }),
    run_job: tool({
      description: [
        "Aktif rapor için backend job başlatır ve execution ekranında yeni job'ı seçer (GUID sonuç sayfasına atlama).",
        "YALNIZ açık çalıştırma fiili varsa çağır: 'raporu çalıştır', 'çalıştır', 'calistir', 'run', 'execute', 'job başlat'.",
        "'hazırla' / 'göster' / 'getir' veya yalnız tarih/durum slotu (örn: 'geçen hafta') YETERLİ DEĞİLDİR — job başlatma; öneri sun.",
      ].join(" "),
      inputSchema: z.object({
        report: z.string().default("stock-balance").describe("Rapor scope'u (örn: stock-balance)"),
        criteria: z.record(z.string(), z.unknown()).default({}).describe("Rapor kriterleri (örn. kayitTarihi, durum)"),
        presetTitle: z.string().optional().describe("Çalıştırılan öneri / preset başlığı"),
      }),
      outputSchema: z.discriminatedUnion("status", [
        z.object({
          status: z.literal("executed"),
          jobId: z.string(),
          jobStatus: z.string(),
          navigateTo: z.string(),
          presetTitle: z.string().optional(),
          message: z.string().optional(),
        }),
        z.object({
          status: z.literal("validation-error"),
          errors: z.array(z.string()),
          hint: z.string().optional(),
        }),
        z.object({
          status: z.literal("blocked"),
          reason: z.literal("incomplete-intent"),
          hint: z.string(),
          message: z.string().optional(),
        }),
        z.object({ status: z.literal("error"), error: z.string() }),
      ]),
    }),
    request_user_confirmation: tool({
      description: [
        "Kritik, yüksek maliyetli veya veri değiştiren işlemler öncesinde kullanıcıdan İNSAN ONAYI (Human-in-the-Loop) ister.",
        "Kullanıcı 'toplu güncelle', 'sil', 'yüksek hacimli sorgu', '%... indirim uygula', 'stok düzeltme' derse veya işlem onay gerektiriyorsa ÇAĞIR.",
        "Arayüzde etkileşimli [Onayla] / [İptal] onay kartı açılır. Kullanıcı yanıt verene kadar işlem yürütülmez.",
      ].join(" "),
      inputSchema: z.object({
        title: z.string().describe("Onay kartının kısa başlığı (örn: 'Toplu İndirim İşlemi')"),
        message: z.string().describe("Yapılacak işlemin detaylı açıklaması ve etki özeti"),
        actionType: z.enum(["mutation", "heavy_query", "bulk_update", "general"]).default("general").describe("İşlemin önem ve risk türü"),
        details: z.record(z.string(), z.unknown()).optional().describe("İşleme özgü detay parametreleri"),
      }),
      outputSchema: z.object({
        confirmed: z.boolean(),
        message: z.string(),
        userNote: z.string().optional(),
      }),
    }),
    navigate_to_page: tool({
      description: [
        "Uygulama içinde belirtilen bir sayfaya, çalışma alanına (workspace) veya rapora yönlendirir (In-App Client Navigation).",
        "Kullanıcı '... ekranını aç', '... sayfasına git', 'beni ... raporuna götür' dediğinde veya aktif ekranda bulunmayan bir rapor/sayfa istendiğinde BU ARACI ÇAĞIR.",
        "Kullanılabilir standart rotalar: '/stock/stock-balance' (Stok Bakiye Raporu), '/stock/stock-analytics' (Stok Analiz Raporu), '/stock' (Stok Modülü), '/accounting' (Muhasebe), '/selling' (Satış), '/manufacturing' (Üretim).",
      ].join(" "),
      inputSchema: z.object({
        path: z.string().describe("Hedef sayfa yolu (örn: '/stock/stock-balance', '/stock', '/accounting')"),
        title: z.string().optional().describe("Hedef sayfa veya rapor adı"),
        reason: z.string().optional().describe("Yönlendirme nedeni"),
      }),
      outputSchema: z.object({
        status: z.enum(["navigated", "already_on_page", "error"]),
        navigateTo: z.string().optional(),
        message: z.string(),
      }),
    }),
    open_last_report: tool({
      description: [
        "Kullanıcının EN SON çalıştırdığı rapor job'ını YENİDEN ÇALIŞTIRMADAN açar: kayıtlı job bulunur ve sonuç tablosuna yönlendirilir.",
        "Kullanıcı 'son çalışan raporu aç', 'son raporu göster', 'son sonuçlar', 'en son job', 'önceki rapor' gibi isteklerde BU ARACI ÇAĞIR.",
        "Bu araç YENİ JOB BAŞLATMAZ — mevcut job'ın sonuç ekranına gider. Yeni çalıştırma isteniyorsa run_report kullanılır.",
      ].join(" "),
      inputSchema: z.object({
        report: z.string().optional().describe("Rapor scope'u (örn: stock-balance); verilmezse en son job seçilir"),
      }),
      outputSchema: z.discriminatedUnion("status", [
        z.object({
          status: z.literal("navigated"),
          jobId: z.string(),
          navigateTo: z.string(),
          message: z.string(),
        }),
        z.object({
          status: z.literal("not_found"),
          message: z.string(),
        }),
        z.object({ status: z.literal("error"), error: z.string() }),
      ]),
    }),
    validate_criteria_input: tool({
      description: [
        "Kullanıcının belirttiği veya formdaki kriterleri şemaya ve D365/BC kurallarına göre doğrular (Criteria Input Engine).",
        "Tarih ve sayı aralıkları ('..', '10..20', '2026-01-01..2026-08-31'), göreli tarihler ('dün', 'bugün', 'geçen hafta'),",
        "seçenekler (enum) ve zorunlu alan kontrolü yapar. Hata, uyarı ve önerileri döner.",
        "Kullanıcı kriter girdiğinde, 'doğrula', 'kontrol et', 'bu kriter doğru mu?' dediğinde veya çalıştırmadan önce denetlemek için ÇAĞIR.",
      ].join(" "),
      inputSchema: z.object({
        report: z.string().default("stock-balance").describe("Rapor scope'u (örn: stock-balance)"),
        criteria: z.record(z.string(), z.unknown()).default({}).describe("Doğrulanacak kriterler"),
        partial: z.boolean().default(false).describe("Yalnız girilen alanları kontrol et (zorunlu alan eksikliklerini hata sayma)"),
      }),
      outputSchema: z.object({
        valid: z.boolean(),
        scope: z.string(),
        reportTitle: z.string(),
        summary: z.string(),
        sanitizedCriteria: z.record(z.string(), z.unknown()).optional(),
        errors: z.array(
          z.object({
            field: z.string(),
            fieldTitle: z.string(),
            message: z.string(),
            received: z.unknown().optional(),
          }),
        ),
        warnings: z.array(
          z.object({
            field: z.string(),
            fieldTitle: z.string(),
            message: z.string(),
            suggestion: z.string().optional(),
          }),
        ),
      }),
    }),
    get_current_criteria: tool({
      description: [
        "Aktif raporun ekranındaki canlı kriter formu taslağını (current draft criteria) okur ve doğrulama durumunu döner.",
        "Kullanıcı 'formda ne var?', 'ekrandaki kriterler neler?', 'kriterleri kontrol et', 'şu anki form geçerli mi?' dediğinde ÇAĞIR.",
        "Kullanıcıya formdaki mevcut değerleri, eksik zorunlu alanları ve format hatalarını bildir.",
      ].join(" "),
      inputSchema: z.object({
        report: z.string().default("stock-balance").describe("Rapor scope'u (örn: stock-balance)"),
      }),
      outputSchema: z.object({
        status: z.string(),
        scope: z.string(),
        reportTitle: z.string(),
        valid: z.boolean(),
        summary: z.string(),
        instance: z.record(z.string(), z.unknown()),
        errors: z.array(
          z.object({
            field: z.string(),
            fieldTitle: z.string(),
            message: z.string(),
            received: z.unknown().optional(),
          }),
        ),
        warnings: z.array(
          z.object({
            field: z.string(),
            fieldTitle: z.string(),
            message: z.string(),
            suggestion: z.string().optional(),
          }),
        ),
      }),
    }),
    list_report_executions: tool({
      description: [
        "Aktif veya belirtilen raporun geçmiş ve çalışan işlerini (job execution history) listeler.",
        "Kullanıcı 'önceki çalıştırmalar', 'çalışan işler', 'iş listesi', 'hangi raporlar çalıştı' dediğinde ÇAĞIR.",
      ].join(" "),
      inputSchema: z.object({
        report: z.string().default("stock-balance").describe("Rapor scope'u (örn: stock-balance)"),
        limit: z.number().default(10).describe("Maksimum listelenecek iş adedi"),
      }),
      outputSchema: z.object({
        status: z.string(),
        executions: z.array(
          z.object({
            jobId: z.string(),
            status: z.string(),
            createdAt: z.string().optional(),
            rowCount: z.number().optional(),
            href: z.string().optional(),
          }),
        ),
        message: z.string().optional(),
      }),
    }),
    cancel_job: tool({
      description: [
        "Çalışmakta olan bir backend rapor işini (running job) iptal eder.",
        "Kullanıcı 'işi durdur', 'iptal et', 'job'ı kes', 'raporu durdur' dediğinde ÇAĞIR.",
      ].join(" "),
      inputSchema: z.object({
        jobId: z.string().describe("İptal edilecek iş GUID'i"),
        report: z.string().optional().describe("Rapor scope'u"),
      }),
      outputSchema: z.object({
        status: z.string(),
        jobId: z.string(),
        message: z.string(),
      }),
    }),
  } satisfies ToolSet;

export type YulaStaticTools = typeof STATIC_TOOLS;

/** Grid bağlamına göre koşullu dinamik araçlar (runtime kolon enum'ları). */
function gridTools(grid: YulaGridToolContext): ToolSet {
  const cols = [...grid.columns];
  const numericCols = cols.filter(
    (c) => grid.columnTypes?.[c] === "number",
  );
  const measureHint = cols.filter((c) =>
    /quantity|balance|price|amount|total|count|qty|tutar|miktar|bakiye/i.test(c),
  );
  // Şema doğrusu (columnTypes) regex ipucunu ezer; ikisi de yoksa tüm kolonlar.
  const measureCols =
    numericCols.length > 0
      ? numericCols
      : measureHint.length > 0
        ? measureHint
        : cols;
  const categoryCols = cols.filter(
    (c) =>
      (grid.columnTypes?.[c] === "text" || grid.columnTypes?.[c] === "bool") &&
      // Id gibi benzersiz kimlik kolonları kategori olamaz (ilk değerleri düz sayı)
      !looksLikeIdentifierValues(grid.columnValues?.[c]),
  );

  return {
    get_report_schema: reportSchemaTool,
    analyze_grid_data: dynamicTool({
      description: [
        "Açık veri kümesinde analizi çalıştırır (KPI/toplam/grup).",
        "Sayı/sayaç/toplam sorularında ÇAĞIR. top için byColumn (kategori kolonu) ver; verilmezse sistem en uygun kategori kolonunu seçer (benzersiz kimlikler hariç).",
        "Kolon listesi ve tipleri sistem bağlamındadır.",
      ].join(" "),
      inputSchema: jsonSchema<{
        operation: "count" | "sum" | "avg" | "min" | "max" | "top";
        column?: string;
        byColumn?: string;
        topN?: number;
      }>({
        type: "object",
        properties: {
          operation: {
            type: "string",
            enum: ["count", "sum", "avg", "min", "max", "top"],
            description:
              "top: byColumn'a göre column toplamının en yüksek N grubu",
          },
          column: {
            type: "string",
            enum: cols,
            description: "Analiz edilecek ölçü kolonu (count için gerekmez)",
          },
          byColumn: {
            type: "string",
            enum: cols,
            description: "top işlemi için grup kolonu",
          },
          topN: {
            type: "number",
            description: "top için grup sayısı (varsayılan 5)",
          },
        },
        required: ["operation"],
      }),
    }),
    profile_grid_table: dynamicTool({
      description: [
        "Açık tabloyu PROFİLLER: satır sayısı, kolon tipleri, null, kardinalite, min/max/avg/sum, en sık değerler.",
        "'analiz et/profille/anomali/veri kalitesi' isteklerinde ÖNCE bunu çağır; bulguları run_expert_sql ile doğrula. Sayı/toplam için analyze_grid_data yeter.",
      ].join(" "),
      inputSchema: jsonSchema<Record<string, never>>({
        type: "object",
        properties: {},
      }),
    }),
    run_expert_sql: dynamicTool({
      description: [
        "SQL uzmanının yazdığı TEK salt-okunur SELECT'i çalıştırır; ilk 50 satırı MODELE döner (grid DEĞİŞTİRMEZ).",
        "KAPSAM: yalnız gridin ifade EDEMEYECEĞİ sorgular — aggregate, karşılaştırmalı kolonlar (Qty > UnitPrice), oran/hesap, window.",
        "DUCKDB VIEW: Ekrandaki süzülmüş/aktif görünümü sorgulamak için 'FROM active_view', ham tablonun tümünü sorgulamak için aktif tablo adını kullanabilirsiniz.",
        "Basit kolon filtreleri (değer/aralık/boş-dolu) için BU ARACI KULLANMA — filter_current_grid ile filtrele; aksi halde grid hücreleri ve tablo senkron dışı kalır.",
        "display: 'silent' = keşif/doğrulama sorgusu, ekrana tablo basılmaz (varsayılan keşiflerde BUNU kullan) · 'card' = kullanıcıdan 'göster/show' istenirse tablo kartı basılır.",
        "Sonuç satırları card modunda ekranda otomatik tablo olur; satırları metinde TEKRAR yazma — yalnız bulgu/yorum yaz.",
        "Guard hatası dönerse hint'i oku, sorguyu düzelt ve en fazla 2 kez yeniden dene.",
      ].join(" "),
      inputSchema: jsonSchema<{ sql: string; display?: "card" | "silent" }>({
        type: "object",
        properties: {
          sql: {
            type: "string",
            description: "Salt-okunur tek SELECT sorgusu (aktif süzülmüş liste için 'active_view', tüm ham veri için tablo adı)",
          },
          display: {
            type: "string",
            enum: ["card", "silent"],
            description:
              "silent: keşif/doğrulama sorgusu — ekrana tablo çizilmez · card: kullanıcıdan 'göster' istendiyse tablo kartı basılır",
          },
        },
        required: ["sql"],
      }),
    }),
    set_grid_query: dynamicTool({
      description: [
        "Kullanıcının AÇIK tablosunu yazdığın salt-okunur SELECT'in sonucuyla YENİDEN görüntüler (gruplama/toplam görünümleri).",
        "LIMIT ASLA YAZMA; aggregate kolonlara AS ile okunur takı adı ver; sorgu tabloya FROM/JOIN ile referans vermeli.",
        "TEK ÇAĞRI KURALI: sql ve reset'i BİRLİKTE gönderme — yeni görünüm için yalnız sql; temel görüne dönmek için yalnız {reset:true}.",
      ].join(" "),
      inputSchema: jsonSchema<{
        sql?: string;
        title?: string;
        reset?: boolean;
      }>({
        type: "object",
        properties: {
          sql: {
            type: "string",
            description:
              "Salt-okunur tek SELECT sorgusu (FROM/JOIN ile tablo adı yukarıda)",
          },
          title: {
            type: "string",
            description: "Yeni görünüm için kısa başlık (örn. 'Depo Bazlı Qty Toplamı')",
          },
          reset: {
            type: "boolean",
            description: "true ise özel sorgu kaldırılır ve temel tablo görünümüne dönülür",
          },
        },
      }),
    }),
    visualize_grid_data: dynamicTool({
      description: [
        "Açık tabloyu GRAFİK olarak görselleştirir; 'grafikle göster/pasta çiz/dağılımı göster' isteklerinde ÇAĞIR.",
        "Yalnız BOYUTLARI bildir: veri DuckDB'den hesaplanır, kart otomatik çizilir; satır verisini ASLA metinde yazma.",
        "bar yatay çizilir (kategori adı solda okunur). Id gibi benzersiz kimlik kolonları kategori OLAMAZ. title + takeaway mutlaka doldur.",
      ].join(" "),
      inputSchema: jsonSchema<{
        title?: string;
        description?: string;
        takeaway?: string;
        chartType: "bar" | "line" | "pie";
        dimensionX: string;
        dimensionY: string[];
        aggregation?: "sum" | "avg" | "min" | "max" | "count";
        limit?: number;
      }>({
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Kısa grafik başlığı (örn. 'Depo Bazlı Toplam Miktar')",
          },
          description: {
            type: "string",
            description: "Grafik ne gösteriyor? Önce bunu yaz.",
          },
          takeaway: {
            type: "string",
            description: "Verinin ana çıkarımı/öne çıkan bulgu (tek cümle)",
          },
          chartType: {
            type: "string",
            enum: ["bar", "line", "pie"],
            description:
              "bar = yatay çubuk (uzun kategori adları için ideal) · pie = pay dağılımı · line = trend",
          },
          dimensionX: {
            type: "string",
            enum: categoryCols.length > 0 ? categoryCols : cols,
            description: "Kategori ekseni kolonu (X)",
          },
          dimensionY: {
            type: "array",
            items: {
              type: "string",
              enum: measureCols,
              description: "Sayısal ölçü kolonu",
            },
            minItems: 1,
            description: "Ölçü ekseni kolonları (Y)",
          },
          aggregation: {
            type: "string",
            enum: ["sum", "avg", "min", "max", "count"],
            description: "Ölçü kolonlarına uygulanacak agregasyon (varsayılan sum)",
          },
          limit: {
            type: "number",
            description: "Gösterilecek maksimum grup sayısı. Kullanıcı 'ilk N', 'en yüksek 5', 'top 10' gibi bir sınır belirttiğinde veya sohbet bağlamında N adet istendiyse limit: N parametresini MUTLAKA yaz (varsayılan 30'a bırakma).",
          },
        },
        required: ["chartType", "dimensionX", "dimensionY"],
      }),
    }),
    filter_current_grid: dynamicTool({
      description: [
        "Kullanıcının açık tablosunu filtreler; grid anında yenilenir.",
        "value'ya D365 ifadesini OLDUĞU GİBİ yaz: '>59' · '100..500' · 'SKU*' · '!A&!B' · 'A|B' · '@abc'.",
        "'boş olanlar' → op:'empty' · 'dolu olanlar' → op:'notEmpty' · value:\"\" yalnız filtre KALDIRIR · tümünü temizlemek için field:\"*\".",
        "eq = BİREBİR eşit (örn. tam kod: BATCH-003) · contains = içeren (kısmi arama) · gt/lt eşik.",
        "eq/contains/gt/lt yalnız basit ayrım; D365 karakterli value verildiğinde yok sayılır.",
        "Filtreler birbirine AND ile eklenir: çok koşullu isteklerde (örn. IsActive=false VE Qty>0) aracı koşul başına bir kez ardışık çağır.",
      ].join(" "),
      inputSchema: jsonSchema<{
        field: string;
        op?: "eq" | "contains" | "gt" | "lt" | "empty" | "notEmpty";
        value: string;
      }>({
        type: "object",
        properties: {
          field: {
            type: "string",
            enum: ["*", ...cols],
            description: 'Hedef kolon; TÜM filtreleri temizlemek için "*"',
          },
          op: {
            type: "string",
            enum: ["eq", "contains", "gt", "lt", "empty", "notEmpty"],
            description:
              'empty: NULL/boş metin kayıtlar · notEmpty: dolu kayıtlar · varsayılan eq · D365 karakterli value verildiğinde yok sayılır',
          },
          value: { type: "string", description: "D365 filtre ifadesi (raw); boş string \"\" = filtre kaldır" },
        },
        required: ["field", "value"],
      }),
    }),
    set_grid_sort: dynamicTool({
      description: [
        "Kullanıcının açık tablosunu belirtilen kolona göre sıralar (ASC/DESC/none).",
        "DuckDB seviyesinde pencereli ORDER BY çalışır, anında yenilenir.",
        "direction: 'asc' (küçükten büyüğe / A-Z) · 'desc' (büyükten küçüğe / Z-A) · 'none' (sıralamayı kaldır / doğal sıra).",
      ].join(" "),
      inputSchema: jsonSchema<{
        column: string;
        direction: "asc" | "desc" | "none";
      }>({
        type: "object",
        properties: {
          column: {
            type: "string",
            enum: cols,
            description: "Sıralanacak hedef kolon adı.",
          },
          direction: {
            type: "string",
            enum: ["asc", "desc", "none"],
            description: "asc: artan · desc: azalan · none: sıralamayı sıfırla",
          },
        },
        required: ["column", "direction"],
      }),
    }),
    configure_grid_columns: dynamicTool({
      description: [
        "Grid kolonlarının görünürlüğünü, gizliliğini ve sırasını düzenler.",
        "Kullanıcı 'sadece X, Y, Z kolonlarını göster' dediğinde visibleColumns ver (diğerleri gizlenir).",
        "Kullanıcı 'X ve Y kolonlarını gizle' dediğinde hiddenColumns ver.",
        "Kullanıcı kolon sırasını değiştirmek istediğinde order ver.",
      ].join(" "),
      inputSchema: jsonSchema<{
        visibleColumns?: string[];
        hiddenColumns?: string[];
        order?: string[];
      }>({
        type: "object",
        properties: {
          visibleColumns: {
            type: "array",
            items: { type: "string" },
            description: "Yalnızca bu kolonlar görünür kalır, diğer tüm kolonlar gizlenir.",
          },
          hiddenColumns: {
            type: "array",
            items: { type: "string" },
            description: "Gizlenecek kolon adları listesi.",
          },
          order: {
            type: "array",
            items: { type: "string" },
            description: "Kolonların soldan sağa gösterim sırası.",
          },
        },
      }),
    }),
    pin_grid_columns: dynamicTool({
      description: [
        "Grid kolonlarını tablonun soluna sabitler (sticky pinned columns).",
        "Kullanıcı tabloyu sağa kaydırırken bu kolonlar daima görünür kalır.",
      ].join(" "),
      inputSchema: jsonSchema<{
        columns: string[];
      }>({
        type: "object",
        properties: {
          columns: {
            type: "array",
            items: { type: "string" },
            description: "Sola sabitlenecek kolon adları.",
          },
        },
        required: ["columns"],
      }),
    }),
    apply_grid_filters: dynamicTool({
      description: [
        "Grid tablosuna tek seferde birden fazla kolon filtresi uygular.",
        "filters: Kolon adı ve D365 ifadesi eşlemesi (örn: { 'InventLocationId': 'MERKEZ', 'QtyOnHand': '>10' }).",
        "clearOthers: true verilirse diğer aktif filtreleri temizleyip yalnız belirtilen filtreleri uygular.",
      ].join(" "),
      inputSchema: jsonSchema<{
        filters: Record<string, string>;
        clearOthers?: boolean;
      }>({
        type: "object",
        properties: {
          filters: {
            type: "object",
            description: "Kolon adı -> D365 filtre değeri eşleme objesi (örn: { QtyOnHand: '>0', InventLocationId: 'MERKEZ' }).",
          },
          clearOthers: {
            type: "boolean",
            description: "Diğer mevcut filtreler temizlensin mi? (varsayılan: false — mevcutlarla birleştirir)",
          },
        },
        required: ["filters"],
      }),
    }),
    reset_grid_layout: dynamicTool({
      description: [
        "Grid görünümünü varsayılan ayarlara döndürür: gizli kolonları açar, sıralamayı sıfırlar, pinleri kaldırır ve/veya filtreleri temizler.",
        "Kullanıcı 'görünümü sıfırla', 'tüm kolonları geri getir', 'tabloyu eski haline getir' dediğinde kullanılır.",
      ].join(" "),
      inputSchema: jsonSchema<{
        resetFilters?: boolean;
        resetSort?: boolean;
        resetColumns?: boolean;
      }>({
        type: "object",
        properties: {
          resetFilters: { type: "boolean", description: "Filtreler temizlensin mi (varsayılan true)" },
          resetSort: { type: "boolean", description: "Sıralama sıfırlansın mı (varsayılan true)" },
          resetColumns: { type: "boolean", description: "Gizli kolonlar açılıp sıra sıfırlansın mı (varsayılan true)" },
        },
      }),
    }),
    export_grid_data: dynamicTool({
      description: [
        "Açık grid verisini kullanıcının tarayıcısına doğrudan dosya olarak indirir (Excel, Parquet, GZIP CSV).",
        "Kullanıcı 'bu veriyi Excel/CSV/Parquet olarak indir / dışa aktar' dediğinde bu aracı çağır.",
      ].join(" "),
      inputSchema: jsonSchema<{
        format: "xlsx" | "parquet" | "csv" | "gz";
      }>({
        type: "object",
        properties: {
          format: {
            type: "string",
            enum: ["xlsx", "parquet", "csv", "gz"],
            description: "İndirme formatı: xlsx (Excel) · parquet · csv · gz (Sıkıştırılmış CSV.gz)",
          },
        },
        required: ["format"],
      }),
    }),
  };
}

/**
 * İstek başına birleşik set — **evre değişimi** (State-Driven Tool Swapping):
 *  - Grid açık (Sonuç evresi) → yalnız grid araçları; kriter/run araçları
 *    modelin eline hiç verilmez (yanlış evreye sapma imkânsızlaşır).
 *  - Grid yok (Kriter evresi) → yalnız rapor hazırlama/çalıştırma araçları.
 */
export function buildServerTools(
  grid?: YulaGridToolContext | null,
): ToolSet {
  if (!grid || grid.columns.length === 0) return STATIC_TOOLS;
  return gridTools(grid);
}
