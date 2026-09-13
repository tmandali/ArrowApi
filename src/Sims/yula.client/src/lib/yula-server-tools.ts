import type { ToolSet } from "ai";
import type { YulaGridToolContext } from "./server-tools/tool-context";
import { STATIC_TOOLS } from "./server-tools/static-tools";
import { gridTools } from "./server-tools/grid-tools";

export type { YulaGridToolContext, ReportToolContext } from "./server-tools/tool-context";
export { reportToolContextSchema } from "./server-tools/tool-context";
export { STATIC_TOOLS, type YulaStaticTools } from "./server-tools/static-tools";

/**
 * Tam SDK uyumu (cookbook: call-tools):
 *  - Statik araçlar **zod** ile tanımlanır → `tool-<ad>` tipli UI parçaları
 *    ve `InferUITools` üzerinden uçtan uca tip güvenliği.
 *  - Çalışma anı kolon enum'ı gerektiren grid araçları resmi `dynamicTool()`
 *    ile bildirilir → `dynamic-tool` parçaları.
 *  - execute YOKTUR: yürütme tarayıcıdadır (DuckDB/OPFS istemcide yaşar);
 *    çıktı `addToolOutput` ile geri verilir, `sendAutomaticallyWhen` akışı sürer.
 *
 * İnce barrel: tanımlar kendi katman modülünde yaşar —
 * `tool-context`, `shared-tools`, `static-tools`, `grid-tools`.
 * Dış API (`STATIC_TOOLS`, `YulaStaticTools`, `buildServerTools`,
 * `reportToolContextSchema`, tipler) değişmedi.
 */

/**
 * İstek başına birleşik set — **evre değişimi** (State-Driven Tool Swapping):
 *  - Grid açık (Sonuç evresi) → yalnız grid araçları; kriter/run araçları
 *    modelin eline hiç verilmez (yanlış evreye sapma imkânsızlaşır).
 *  - Grid yok (Kriter evresi) → yalnız rapor hazırlama/çalıştırma araçları.
 *
 * Overload'lar literal tool tiplerini korur; böylece AI SDK `toolsContext`
 * (contextSchema'lı araçlar) ve `prepareStep.activeTools` tip-güvenli kalır.
 */
export function buildServerTools(grid: YulaGridToolContext): ToolSet;
export function buildServerTools(grid?: null | undefined): typeof STATIC_TOOLS;
export function buildServerTools(
  grid?: YulaGridToolContext | null,
): typeof STATIC_TOOLS | ToolSet {
  if (!grid || grid.columns.length === 0) return STATIC_TOOLS;
  return gridTools(grid);
}
