import { dynamicTool, jsonSchema, type ToolSet } from "ai";
import { looksLikeIdentifierValues } from "@/lib/grid-column-values";
import type { YulaGridToolContext } from "./tool-context";
import {
  reportSchemaTool,
  askUserQuestionTool,
  suggestNextStepsTool,
  runUserSkillTool,
  runSkillScriptTool,
  readSkillFileTool,
  readUserFileTool,
} from "./shared-tools";

/**
 * Grid bağlamına göre koşullu dinamik araçlar (runtime kolon enum'ları) —
 * sonuç evresi (results fazı). Tanımlar `yula-server-tools.ts` ile birebirdir.
 */
export function gridTools(grid: YulaGridToolContext): ToolSet {
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
    ask_user_question: askUserQuestionTool,
    suggest_next_steps: suggestNextStepsTool,
    run_user_skill: runUserSkillTool,
    run_skill_script: runSkillScriptTool,
    read_skill_file: readSkillFileTool,
    read_user_file: readUserFileTool,
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
            description: "top için grup sayısı (varsayılan 5, en fazla 10)",
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
        "SQL uzmanının yazdığı TEK salt-okunur SELECT'i çalıştırır; ilk 10 satırı MODELE döner (grid DEĞİŞTİRMEZ).",
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
        "SIRALAMA: 'ilk N' / 'first N' / 'mağaza sırasında' / 'depo sırasında' → orderMode:'label_asc'. Grid satır sırasındaki ilk N → 'appearance'. 'en yüksek N' / 'top N' / 'en çok' → orderMode:'value_desc' (varsayılan). 'en düşük' → value_asc.",
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
        orderMode?:
          | "value_desc"
          | "value_asc"
          | "label_asc"
          | "label_desc"
          | "appearance";
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
          orderMode: {
            type: "string",
            enum: [
              "value_desc",
              "value_asc",
              "label_asc",
              "label_desc",
              "appearance",
            ],
            description:
              "Dilim/çubuk sırası. 'ilk 5 mağaza' / mağaza sırasında → label_asc. Grid sırası → appearance. 'en yüksek 5' → value_desc. Varsayılan value_desc.",
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
