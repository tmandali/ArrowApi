import { useEffect, useRef, useMemo } from "react";
import { toolRegistry, type ToolDefinition } from "@/lib/tool-registry";
import { useAgentBridgeStore, type ScreenContext } from "@/hooks/useAgentBridge";

export interface ScreenAgentToolOptions {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, any>;
    required?: string[];
  };
  execute: (args: Record<string, any>) => Promise<any> | any;
}

export interface UseScreenAgentContextOptions {
  screenId: string;
  screenTitle: string;
  workspaceId?: string;
  activeDataSummary?: Record<string, any>;
  activeFilters?: Record<string, any>;
  quickPrompts?: string[];
  resultsPrompts?: string[];
  criteriaDigest?: Array<Record<string, unknown>>;
  activeReportScope?: string;
  tools?: ScreenAgentToolOptions[];
}

/**
 * useScreenAgentContext
 * 
 * Herhangi bir React ekranını veya raporunu Yula AI asistanına bağlar.
 * Ekrana özel araçları (Screen-scoped tools) dinamik olarak kaydeder,
 * aktif ekran bağlamını AI tarafına bildirir ve ekran kapandığında (unmount)
 * tüm araçları otomatik olarak temizler.
 */
export function useScreenAgentContext({
  screenId,
  screenTitle,
  workspaceId,
  activeDataSummary,
  activeFilters,
  quickPrompts,
  resultsPrompts,
  tools = [],
}: UseScreenAgentContextOptions) {
  const setScreenContext = useAgentBridgeStore((s) => s.setScreenContext);
  const clearScreenContext = useAgentBridgeStore((s) => s.clearScreenContext);

  const toolsRef = useRef(tools);
  toolsRef.current = tools;

  const dataSummaryKey = JSON.stringify(activeDataSummary);
  const filtersKey = JSON.stringify(activeFilters);
  const quickPromptsKey = JSON.stringify(quickPrompts);
  const resultsPromptsKey = JSON.stringify(resultsPrompts);

  const summaryObj = useMemo(() => (dataSummaryKey ? JSON.parse(dataSummaryKey) : undefined), [dataSummaryKey]);
  const filtersObj = useMemo(() => (filtersKey ? JSON.parse(filtersKey) : undefined), [filtersKey]);
  const promptsArr = useMemo(() => (quickPromptsKey ? JSON.parse(quickPromptsKey) : undefined), [quickPromptsKey]);
  const resultsPromptsArr = useMemo(() => (resultsPromptsKey ? JSON.parse(resultsPromptsKey) : undefined), [resultsPromptsKey]);

  // 1. Canlı state ve bağlam güncellemesi (araçları bozmadan sürekli günceller)
  useEffect(() => {
    const contextData: ScreenContext = {
      screenId,
      screenTitle,
      workspaceId,
      activeDataSummary: summaryObj,
      activeFilters: filtersObj,
      quickPrompts: promptsArr,
      resultsPrompts: resultsPromptsArr,
    };
    setScreenContext(contextData);
  }, [screenId, screenTitle, workspaceId, summaryObj, filtersObj, promptsArr, resultsPromptsArr, setScreenContext]);

  // 2. Ekran araçlarının ToolRegistry'ye kaydı (Sadece screenId değiştikçe veya mount/unmount sırasında çalışır)
  useEffect(() => {
    const unregisterFns: Array<() => void> = [];

    for (const tool of toolsRef.current) {
      const fullToolDef: ToolDefinition = {
        ...tool,
        scope: {
          type: "screen",
          id: screenId,
        },
        execute: async (args) => {
          // Her zaman en güncel execute fonksiyonunu çağır
          const currentTool = toolsRef.current.find((t) => t.name === tool.name);
          return currentTool ? await currentTool.execute(args) : await tool.execute(args);
        },
      };

      const unregister = toolRegistry.register(fullToolDef);
      unregisterFns.push(unregister);
    }

    return () => {
      unregisterFns.forEach((unreg) => unreg());
      clearScreenContext(screenId);
    };
  }, [screenId, clearScreenContext]);
}
