"use client";

import { useTranslations } from "next-intl";
import { useScreenContract } from "@/hooks/use-screen-contract";
import type { PlaybookEntry } from "@my-agent/core";
import { PlaybooksManagementContract } from "./playbook-management.contract";

export function usePlaybookAgentBinding({
  workspace,
  searchQuery,
  setSearchQuery,
  screenRules,
  workflowRecipes,
  selectedWorkflowId,
  setSelectedWorkflowId,
  workflowViewMode,
  setWorkflowViewMode,
  removeRule,
  refresh,
  screenTitle,
}: {
  workspace: string;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  screenRules: PlaybookEntry[];
  workflowRecipes: PlaybookEntry[];
  selectedWorkflowId: string | null;
  setSelectedWorkflowId: (id: string | null) => void;
  workflowViewMode: "graph" | "cards";
  setWorkflowViewMode: (mode: "graph" | "cards") => void;
  removeRule: (id: string) => Promise<boolean>;
  refresh: () => Promise<void>;
  screenTitle: string;
}) {
  const t = useTranslations("Playbooks");
  const activeWorkflow =
    workflowRecipes.find((w) => w.id === selectedWorkflowId) ||
    workflowRecipes[0];

  useScreenContract(PlaybooksManagementContract, {
    quickPrompts: [
      t("prompt_list_playbooks"),
      t("prompt_create_playbook"),
    ],
    state: {
      workspace,
      searchQuery,
      rulesCount: screenRules.length,
      workflowsCount: workflowRecipes.length,
      selectedWorkflowId,
      selectedWorkflowTitle: activeWorkflow?.title ?? null,
      viewMode: workflowViewMode,
    },
    getExitSnapshot: () => ({
      workspace,
      searchQuery,
      selectedWorkflowId,
      viewMode: workflowViewMode,
    }),
    stateExtra: {
      workspace,
      searchQuery,
      rulesCount: screenRules.length,
      workflowsCount: workflowRecipes.length,
      selectedWorkflowTitle: activeWorkflow?.title ?? null,
      viewMode: workflowViewMode,
    },
    runtimeMeta: {
      entity: "playbook_manager",
      screenTitle,
      workspace,
      searchQuery,
      rulesCount: screenRules.length,
      workflowsCount: workflowRecipes.length,
      selectedWorkflow: activeWorkflow
        ? {
            id: activeWorkflow.id,
            title: activeWorkflow.title,
            summary: activeWorkflow.contentMarkdown?.slice(0, 120) || "",
          }
        : null,
      rules: screenRules.map((r) => ({
        id: r.id,
        title: r.title,
        targetPath: r.targetPath,
        summary: r.contentMarkdown?.slice(0, 120) || "",
      })),
      workflows: workflowRecipes.map((w) => ({
        id: w.id,
        title: w.title,
        summary: w.contentMarkdown?.slice(0, 120) || "",
      })),
    },
    handlers: {
      READ: async () => {
        return {
          success: true,
          rulesCount: screenRules.length,
          workflowsCount: workflowRecipes.length,
          searchQuery,
          activeWorkflow: activeWorkflow ? activeWorkflow.title : null,
        };
      },
      SEARCH: async (payload) => {
        const query = payload?.query ?? "";
        setSearchQuery(query);
        return { success: true, query, message: `Filtered by '${query}'` };
      },
      SELECT_WORKFLOW: async (payload) => {
        const query = (
          (payload?.id as string) ||
          (payload?.title as string) ||
          ""
        ).toLowerCase();
        const match = workflowRecipes.find(
          (w) =>
            w.id.toLowerCase() === query ||
            w.title.toLowerCase().includes(query),
        );
        if (match) {
          setSelectedWorkflowId(match.id);
          return { success: true, selectedWorkflow: match.title };
        }
        return { success: false, error: `Workflow '${query}' not found.` };
      },
      SWITCH_VIEW: async (payload) => {
        const mode = payload?.mode ?? "graph";
        setWorkflowViewMode(mode);
        return { success: true, mode };
      },
      DELETE_RULE: async (payload) => {
        if (payload?.id) {
          const ok = await removeRule(payload.id);
          return { success: ok, id: payload.id };
        }
        return { success: false, error: "Missing rule id" };
      },
      REFRESH: async () => {
        await refresh();
        return { success: true, message: "Playbook reloaded." };
      },
    },
  });
}
