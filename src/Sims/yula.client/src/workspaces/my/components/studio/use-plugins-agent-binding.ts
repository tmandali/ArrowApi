"use client";

import { useScreenContract } from "@/hooks/use-screen-contract";
import type { AgentPlugin } from "@/lib/plugins/yula-plugins";
import { PluginsRegistryContract } from "./plugins-registry.contract";

export interface UsePluginsAgentBindingOptions {
  plugins: AgentPlugin[];
  screenTitle?: string;
}

/**
 * Headless UI-Agent binding hook for Plugins Registry (`id: "entity_form:plugin_registry"`).
 */
export function usePluginsAgentBinding({
  plugins,
  screenTitle = "Kurumsal Eklentiler & Modüller",
}: UsePluginsAgentBindingOptions) {
  useScreenContract(PluginsRegistryContract, {
    runtimeMeta: {
      entity: "plugin_registry",
      screenTitle,
      workspace: "my",
      pluginsCount: plugins.length,
      plugins: plugins.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        version: p.version || "1.0.0",
        tools: Object.keys(p.tools ?? {}),
      })),
    },
    handlers: {
      READ: async () => {
        return {
          success: true,
          pluginsCount: plugins.length,
          plugins: plugins.map((p) => ({
            id: p.id,
            name: p.name,
            description: p.description,
            version: p.version || "1.0.0",
            tools: Object.keys(p.tools ?? {}),
          })),
        };
      },
    },
  });
}
