import type { YulaReportCardConfig } from "@/components/layout/yula-components-data";
import { toolRegistry, type ToolDefinition, type ToolParameter } from "@/lib/tool-registry";
import { useDraftCriteriaStore } from "@/store/slices/draft-criteria-store";
import { parseCriteriaSchema, createInitialCriteriaRows } from "@/features/report-criteria";
import type { CriteriaFilterRow } from "@/features/report-criteria/types";
import { validateAndSanitizeSchemaArgs } from "./schema-validator-guard";
import { readCriteriaAiMetadata, readReportAiMetadata } from "./report-ai-metadata";
import { triggerReportRun } from "./report-run-bus";

/**
 * JENERİK RAPOR ARAÇLARI SÖZLEŞMESİ
 * ---------------------------------
 * Rapor başına araç ÜRETİLMEZ. İki sabit araç vardır ve `report` parametresi
 * kayıtlı rapor kapsamlarından (enum) seçilir:
 *
 *   prepare_report_criteria { report, criteria } → kriter formunu doldurur
 *   run_report              { report }           → Çalıştır tuşuna basar
 *
 * Doğrulama execution anında ilgili raporun JSON Schema'sı ile yapılır
 * (validateAndSanitizeSchemaArgs) — yani yüzlerce raporda ek kod gerekmez.
 */

function normalizeScope(v: unknown): string {
  return String(v ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^filter_/, "");
}

/** Bir raporun kriterlerini (AI argümanlarını) taslağa uygular ve kart sonucu üretir. */
export function executeReportCriteria(
  config: YulaReportCardConfig,
  rawArgs: Record<string, any>
): Record<string, any> {
  const toolName = `prepare_report_criteria(${config.scope})`;
  console.log(`[SchemaToolGenerator] ${toolName} raw args:`, rawArgs);

  // 0. JSON Schema Guard & Legal Enum Validator
  const validation = validateAndSanitizeSchemaArgs(config.schema, rawArgs);
  const sanitizedArgs = validation.validArgs;
  if (validation.rejectedFields.length > 0) {
    console.warn(
      `[SchemaToolGenerator] Rejected invalid args for ${config.scope}:`,
      validation.rejectedFields
    );
  }

  // 1-4. Varsayılanlar + mevcut taslak + AI değerlerini birleştir
  const parsed = parseCriteriaSchema(config.schema);
  const initialDefaultRows = createInitialCriteriaRows(parsed.fields);
  const currentRows =
    useDraftCriteriaStore.getState().rowsByScope[config.scope] || initialDefaultRows;

  const rowMap = new Map<string, CriteriaFilterRow>();
  for (const row of initialDefaultRows) {
    if (row.name) rowMap.set(row.name, { ...row });
  }
  for (const row of currentRows) {
    if (row.name && row.value !== "") rowMap.set(row.name, { ...row });
  }
  for (const [key, val] of Object.entries(sanitizedArgs)) {
    if (val !== undefined && val !== null && val !== "") {
      const stringVal = Array.isArray(val) ? val.join(", ") : String(val);
      const existing = rowMap.get(key);
      if (existing) {
        existing.value = stringVal;
      } else {
        rowMap.set(key, {
          id: `ai-${key}-${Date.now()}`,
          selected: false,
          name: key,
          value: stringVal,
        });
      }
    }
  }

  // Kullanıcı hiçbir tarih alanı vermediyse şemadaki x-ai.dateBehavior'a göre
  // varsayılanları uygula (tek alan → dün; aralık → son 30 gün .. bugün).
  const schemaProps = (config.schema.properties ?? {}) as Record<string, any>;
  const userDateCount = Object.keys(sanitizedArgs).filter((k) => {
    const ai = readCriteriaAiMetadata(schemaProps[k] ?? {});
    return Boolean(ai.dateBehavior);
  }).length;
  if (userDateCount === 0) {
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const todayD = new Date();
    const yesterday = iso(new Date(todayD.getTime() - 86_400_000));
    const last30 = iso(new Date(todayD.getTime() - 30 * 86_400_000));
    for (const [key, prop] of Object.entries(schemaProps)) {
      const ai = readCriteriaAiMetadata(prop ?? {});
      const dbh = ai.dateBehavior;
      if (!dbh) continue;
      const val =
        dbh === "range_start"
          ? last30
          : dbh === "range_end"
            ? iso(todayD)
            : dbh === "range_string"
              ? yesterday
              : undefined;
      if (!val) continue;
      const existing = rowMap.get(key);
      if (existing) existing.value = val;
      else
        rowMap.set(key, {
          id: `def-${key}-${Date.now()}`,
          selected: false,
          name: key,
          value: val,
        });
    }
  }

  useDraftCriteriaStore.getState().setRows(config.scope, Array.from(rowMap.values()));

  return {
    status: "success",
    customKind: config.kind,
    scope: config.scope,
    workspace: config.workspace,
    pagePath: config.pagePath,
    title: config.title,
    appliedFilters: sanitizedArgs,
    message: validation.notes.join("\n\n"),
  };
}

/**
 * Rapor meta satırı: scope{alias1|alias2}: alan1=v1/v2, alan2 — AI için.
 * `=değer/değer` bölümü enum seçenekleridir; Model prompt içinde geçen
 * enum değerini gördüğünde ilgili alana yazar (sözlüksüz doldurma).
 */
function reportMetaLine(config: YulaReportCardConfig): string {
  const meta = readReportAiMetadata(config.schema);
  const aliases = (meta.aliases ?? []).slice(0, 6);
  const props = config.schema.properties ?? {};
  const parts = Object.entries(props)
    .slice(0, 8)
    .map(([key, prop]) => {
      const p = Array.isArray(prop) ? prop[0] : prop;
      const ev = p?.enum ?? p?.items?.enum;
      return Array.isArray(ev) && ev.length > 0
        ? `${key}=${ev.slice(0, 6).map(String).join("/")}`
        : key;
    });
  return `${config.scope}{${aliases.join("|")}}: ${parts.join(", ")}`;
}

/**
 * Tüm kayıtlı raporlar için TEK çift jenerik araç kaydeder.
 * `configs` auto-report-registry'den gelir (şemalar glob ile keşfedilir).
 */
export function registerGenericReportTools(
  configs: YulaReportCardConfig[]
): () => void {
  const scopes = configs.map((c) => c.scope);
  const enumScopes = scopes.length > 0 ? scopes : ["unknown"];

  const aliasSet = new Set<string>();
  const quickSet = new Set<string>();
  let fieldDigest = "";
  for (const c of configs) {
    aliasSet.add(c.title);
    aliasSet.add(c.scope.replace(/[-_]/g, " "));
    const meta = readReportAiMetadata(c.schema);
    for (const a of meta.aliases ?? []) {
      if (aliasSet.size < 40) aliasSet.add(String(a));
    }
    for (const q of meta.quickPrompts ?? []) {
      if (quickSet.size < 12) quickSet.add(String(q));
    }
    if (fieldDigest) fieldDigest += " | ";
    fieldDigest += reportMetaLine(c);
  }

  const reportParam: ToolParameter = {
    type: "string",
    description: `Hedef raporun kapsamı. Değerlerden BİRİ olmalı: ${enumScopes.join(", ")}`,
    enum: enumScopes,
  };

  const prepareDef: ToolDefinition = {
    name: "prepare_report_criteria",
    // Description standardı (üçlü şablon): NE YAPAR / NE ZAMAN KULLANILMAZ / ÖRNEKLER.
    description:
      "Kullanıcının istediği raporun KRİTER FORMUNU doldurur (raporu çalıştırmaz). " +
      `Kayıtlı rapor alanları → ${fieldDigest}. ` +
      "'criteria' nesnesinin anahtarları seçilen raporun alan adlarıyla birebir aynı olmalıdır. " +
      "NE ZAMAN KULLANILMAZ: Rapor çalıştırılıp SONUÇ TABLOSU açıldıysa satır filtresi için bu araç çağrılmaz — araç listesinde 'filter_active_grid' varsa onu, özet/grafik için 'analyze_grid_data'yi kullan; kriterleri doldurup ÇALIŞTIRMAK isteniyorsa 'run_report' çağrılır. " +
      "ÖRNEKLER: 'stok bakiye raporu hazırla', 'geçen haftanın iptalleri için kriterleri doldur', '50.000 TL üzeri stoklar filtresini kur'.",
    ai: {
      aliases: [...aliasSet],
      quickPrompts: [...quickSet],
    },
    scope: { type: "global" },
    parameters: {
      type: "object",
      properties: {
        report: reportParam,
        criteria: {
          type: "object",
          description:
            "Seçilen raporun alan adları → değerleri. Kullanıcı cümlesinden çıkarılan alanlar.",
        },
      },
      required: ["report"],
    },
    execute: (args: Record<string, any>) => {
      const scope = normalizeScope(args?.report);
      const config =
        configs.find((c) => normalizeScope(c.scope) === scope) ??
        configs.find((c) =>
          normalizeScope(c.title).includes(scope)
        );
      if (!config) {
        return {
          status: "error",
          message: `Bilinmeyen rapor: "${args?.report}". Geçerli raporlar: ${enumScopes.join(", ")}`,
        };
      }
      return executeReportCriteria(config, args?.criteria ?? {});
    },
  }

  const runDef: ToolDefinition = {
    name: "run_report",
    // Description standardı (üçlü şablon): NE YAPAR / NE ZAMAN KULLANILMAZ / ÖRNEKLER.
    description:
      "Seçilen raporu mevcut kriterlerle ÇALIŞTIRIR ve sonuç ekranını açar (Çalıştır tuşu). " +
      `Kayıtlı raporlar → ${fieldDigest}. ` +
      "NE ZAMAN KULLANILMAZ: Sadece KRİTERLERİ değiştirmek isteniyorsa çağrılmaz — o durumda 'prepare_report_criteria' kullanılır. " +
      "ÖRNEKLER: 'stok bakiyesini getir', 'raporu çalıştır', 'analitik raporu son 30 günle göster'.",
    ai: { aliases: ["raporu çalıştır", "rapor çalıştır"] },
    scope: { type: "global" },
    parameters: {
      type: "object",
      properties: { report: reportParam },
      required: ["report"],
    },
    execute: (args: Record<string, any>) => {
      const scope = normalizeScope(args?.report);
      const config =
        configs.find((c) => normalizeScope(c.scope) === scope) ??
        configs.find((c) => normalizeScope(c.title).includes(scope));
      if (!config) {
        return {
          status: "error",
          message: `Bilinmeyen rapor: "${args?.report}". Geçerli raporlar: ${enumScopes.join(", ")}`,
        };
      }
      const started = triggerReportRun(config.scope);
      return started
        ? {
            status: "success",
            message: `${config.title} çalıştırıldı; sonuçlar hazırlanıyor.`,
            scope: config.scope,
            workspace: config.workspace,
            pagePath: config.pagePath,
            title: config.title,
          }
        : {
            status: "success",
            message: `${config.title} kriter ekranı açık değil; önce kriterlerini doldurun (prepare_report_criteria).`,
          };
    },
  };

  const unregs = [toolRegistry.register(prepareDef), toolRegistry.register(runDef)];
  return () => unregs.forEach((u) => u());
}
