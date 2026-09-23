"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { useScreenContract } from "@/hooks/use-screen-contract";
import type { UserAgent } from "@/lib/yula-user-agent";
import type { AgentEditorHandle, AgentEditorMode } from "./agent-editor";
import { AgentEditorContract } from "./agent-editor.contract";

type Selection = { id: string | null } | null;

export function useAgentManagementBinding({
  selectedAgent,
  selection,
  setSelection,
  mode,
  agents,
  activeAgentId,
  setActiveAgentId,
  activeDetailTab,
  setActiveDetailTab,
  editorRef,
  screenTitle,
  onTestAgent,
}: {
  selectedAgent: UserAgent | null;
  selection: Selection;
  setSelection: (sel: Selection) => void;
  mode: AgentEditorMode | null;
  agents: UserAgent[];
  activeAgentId: string | null;
  setActiveAgentId: (id: string | null) => void;
  activeDetailTab: string;
  setActiveDetailTab: (tab: string) => void;
  editorRef: React.RefObject<AgentEditorHandle | null>;
  screenTitle: string;
  onTestAgent?: (agentId: string) => void;
}) {
  const t = useTranslations("AgentManagement");

  useScreenContract(AgentEditorContract, {
    quickPrompts: selectedAgent
      ? [
          t("prompt_test_agent", { name: selectedAgent.name }),
          t("prompt_explain_agent", { name: selectedAgent.name }),
        ]
      : [
          t("prompt_create_agent"),
          t("prompt_list_agents"),
        ],
    state: {
      activeAgentName: selectedAgent?.name ?? null,
      selectedId: selection?.id ?? null,
      mode,
      isActivePersona: selectedAgent ? selectedAgent.id === activeAgentId : false,
      agentsCount: agents.length,
      activeTab: activeDetailTab,
    },
    getExitSnapshot: () => ({
      activeAgentName: selectedAgent?.name ?? null,
      activeTab: activeDetailTab,
      mode,
    }),
    stateExtra: {
      activeAgentName: selectedAgent?.name ?? null,
      selectedId: selection?.id ?? null,
      mode,
      isActivePersona: selectedAgent ? selectedAgent.id === activeAgentId : false,
      agentsCount: agents.length,
    },
    runtimeMeta: {
      entity: "user_agent",
      screenTitle: selectedAgent
        ? `Ajan Ayarları - ${selectedAgent.name}`
        : screenTitle,
      activeAgentName: selectedAgent?.name ?? null,
      agentId: selectedAgent?.id ?? null,
      description: selectedAgent?.description ?? "",
      instructions: selectedAgent?.instructions ?? "",
      model: selectedAgent?.model ?? "",
      effort: selectedAgent?.effort ?? "",
      tools: selectedAgent?.tools ?? [],
      skills: selectedAgent?.skills ?? [],
      scope: selectedAgent?.scope ?? "global",
      isActivePersona: selectedAgent ? selectedAgent.id === activeAgentId : false,
      mode,
      activeTab: activeDetailTab,
      availableAgents: agents.map((a) => ({
        id: a.id,
        name: a.name,
        description: a.description,
        scope: a.scope,
        isActive: a.id === activeAgentId,
      })),
    },
    onAction: async (action, payload) => {
      if (action === "READ") {
        return {
          success: true,
          activeAgent: selectedAgent
            ? {
                id: selectedAgent.id,
                name: selectedAgent.name,
                description: selectedAgent.description,
                instructions: selectedAgent.instructions,
                model: selectedAgent.model,
                effort: selectedAgent.effort,
                tools: selectedAgent.tools,
                skills: selectedAgent.skills,
                scope: selectedAgent.scope,
                isActivePersona: selectedAgent.id === activeAgentId,
              }
            : null,
          mode,
          activeTab: activeDetailTab,
        };
      }
      if (action === "SELECT_AGENT" && payload) {
        const query = (
          (payload.name as string) ||
          (payload.id as string) ||
          ""
        ).toLowerCase();
        const match = agents.find(
          (a) =>
            a.id.toLowerCase() === query ||
            a.name.toLowerCase() === query ||
            a.name.toLowerCase().includes(query),
        );
        if (match) {
          setSelection({ id: match.id });
          setActiveDetailTab("genel");
          return {
            success: true,
            message: `Selected agent: ${match.name}`,
            agent: { id: match.id, name: match.name },
          };
        }
        return { success: false, error: `Agent '${query}' not found.` };
      }
      if (action === "SWITCH_TAB" && typeof payload?.tab === "string") {
        const targetTab = payload.tab;
        setActiveDetailTab(targetTab);
        return { success: true, activeTab: targetTab, message: `Switched to tab ${targetTab}` };
      }
      if (action === "SET_ACTIVE") {
        const targetId = (payload?.agentId as string) || selectedAgent?.id;
        if (!targetId) {
          return { success: false, error: "No agent selected to activate." };
        }
        setActiveAgentId(targetId);
        return {
          success: true,
          message: `Activated agent ${selectedAgent?.name || targetId} as current persona.`,
        };
      }
      if (action === "TEST_AGENT") {
        if (!selectedAgent) {
          return { success: false, error: "No agent selected to test." };
        }
        onTestAgent?.(selectedAgent.id);
        return {
          success: true,
          message: `Testing agent ${selectedAgent.name}. Navigating to agent session.`,
          agentId: selectedAgent.id,
        };
      }
      if (action === "SAVE") {
        editorRef.current?.save();
        return { success: true, message: "Agent saved successfully." };
      }
      return { success: false, error: `Unknown action: ${action}` };
    },
  });
}
