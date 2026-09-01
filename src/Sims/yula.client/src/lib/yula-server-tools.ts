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
  /** Kolon → tip ("date"|"number"|"bool"|"text") — Arrow/DuckDB şemasından; LLM şema grounding'i */
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
        'Kullanıcı herhangi bir rapor istediğinde (örn: "stok bakiye raporu", "raporu hazırla", "stok bakiyesi göster", "geçen hafta itibarıyla hazırla"), kriterler tam verilsin veya verilmesin BU ARACI DERHAL ÇAĞIR.',
        "Kullanıcıya sohbet üzerinden tarih formatı veya kriter sorusu SORMA — aracı criteria:{} ile çağır; sistem varsayılan tarih ve kriterleri otomatik uygulayacaktır.",
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
        z.object({ status: z.literal("error"), error: z.string() }),
      ]),
    }),
    apply_criteria: tool({
      description: [
        "Önerilen kriterleri (ör. kayitTarihi, durum, tutarMiktar) aktif ekrandaki kriter formuna doldurur.",
        "Kullanıcı '1. öneriyi uygula', 'dünü seç', 'forma yaz' dediğinde bu aracı criteria objesi ile ÇAĞIR.",
        "Form doldurulur, ekranda vurgulanır ve kullanıcı ekrandaki 'Run' butonuna basarak işi kendisi çalıştırabilir.",
      ].join(" "),
      inputSchema: z.object({
        report: z.string().default("stock-balance").describe("Rapor scope'u (örn: stock-balance)"),
        criteria: z.record(z.string(), z.unknown()).describe("Forma doldurulacak kriterler"),
        presetTitle: z.string().optional().describe("Uygulanan öneri başlığı"),
      }),
      outputSchema: z.object({
        status: z.string(),
        updatedKeys: z.array(z.string()),
        message: z.string(),
      }),
    }),
    run_job: tool({
      description: [
        "Stok Bakiye veya aktif rapor için backend job başlatır ve execution ekranında yeni job'ı seçer (GUID sonuç sayfasına atlama).",
        "Kullanıcı önerilen bir seçeneği doğrudan çalıştırmak istediğinde veya 'run et' dediğinde zorunlu alanları (kayitTarihi) ve kriterleri belirterek BU ARACI ÇAĞIR.",
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
        "Açık veri kümesinde DuckDB analizi çalıştırır (KPI/toplam/grup).",
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
            description: "Salt-okunur tek SELECT sorgusu (tablo adı yukarıda)",
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
