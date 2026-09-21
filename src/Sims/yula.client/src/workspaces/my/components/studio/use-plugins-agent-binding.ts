"use client";

import { useAgentComponent } from "@my-agent/react";
import type { ActionContract } from "@my-agent/core";
import { z } from "zod";
import type { AgentPlugin } from "@/lib/plugins/yula-plugins";

export interface UsePluginsAgentBindingOptions {
  plugins: AgentPlugin[];
  screenTitle?: string;
}

export const PLUGINS_READ_CONTRACT = {
  description: "Reads the list of registered corporate plugins and their tools.",
  inputSchema: z.object({}).optional(),
  outputSchema: z.object({
    success: z.boolean(),
    pluginsCount: z.number(),
    plugins: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        description: z.string(),
        version: z.string(),
        tools: z.array(z.string()),
      }),
    ),
  }),
  whenToCall: "When inspecting plugins or checking tool availability.",
  whenNotToCall: "When not on plugins screen.",
} satisfies ActionContract;

/**
 * Headless UI-Agent binding hook for Plugins Registry (`id: "entity_form:plugin_registry"`).
 */
export function usePluginsAgentBinding({
  plugins,
  screenTitle = "Kurumsal Eklentiler & Modüller",
}: UsePluginsAgentBindingOptions) {
  useAgentComponent({
    id: "entity_form:plugin_registry",
    meta: {
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
    actions: {
      READ: PLUGINS_READ_CONTRACT,
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
