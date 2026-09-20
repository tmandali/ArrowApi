"use client";

import { useTranslations } from "next-intl";
import { useScreenAgentContext } from "@/hooks/use-screen-agent-context";
import { useAgentComponent } from "@my-agent/react";
import type { PlaybookEntry } from "@my-agent/core";

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

  useScreenAgentContext({
    screenId: "my-playbooks",
    screenTitle,
    workspaceId: "my",
    activeDataSummary: {
      isViewingResults: false,
      jobId: undefined,
    },
    quickPrompts: [
      t("prompt_list_playbooks"),
      t("prompt_create_playbook"),
    ],
    stateExtra: {
      workspace,
      searchQuery,
      rulesCount: screenRules.length,
      workflowsCount: workflowRecipes.length,
      selectedWorkflowTitle: activeWorkflow?.title ?? null,
      viewMode: workflowViewMode,
    },
  });

  useAgentComponent({
    id: "entity_form:playbook_manager",
    meta: {
      entity: "playbook_manager",
      screenTitle,
      workspace,
      searchQuery,
      rulesCount: screenRules.length,
      workflowsCount: workflowRecipes.length,
      selectedWorkflow: activeWorkflow
        ? { id: activeWorkflow.id, title: activeWorkflow.title, summary: activeWorkflow.contentMarkdown?.slice(0, 120) || "" }
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
    actions: {
      READ: {
        description:
          "Reads the current procedural rules and workflow recipes loaded on screen.",
        whenToCall:
          "When inspecting or listing company procedural memory, screen rules, or workflows.",
        whenNotToCall: "When searching or modifying rules.",
      },
      SEARCH: {
        description:
          "Filters the on-screen rules and workflows by search query ({ query: string }).",
        whenToCall:
          "When the user asks to filter or find rules matching a keyword.",
        whenNotToCall: "When clearing filter (pass query='' to reset).",
      },
      SELECT_WORKFLOW: {
        description:
          "Selects a specific workflow recipe to display on the canvas ({ id?: string, title?: string }).",
        whenToCall:
          "When the user asks to open or inspect a specific workflow diagram.",
        whenNotToCall: "When the requested workflow is already active.",
      },
      SWITCH_VIEW: {
        description:
          "Toggles between graph canvas and cards view for workflow recipes ({ mode: 'graph' | 'cards' }).",
        whenToCall:
          "When the user asks to switch between the interactive graph and card list.",
        whenNotToCall: "When the requested view mode is already active.",
      },
      DELETE_RULE: {
        description:
          "Removes a verified procedural rule from the playbook ({ id: string }).",
        whenToCall:
          "When the user explicitly asks to remove or delete a rule.",
        whenNotToCall: "When inspecting rules.",
      },
      REFRESH: {
        description: "Reloads rules and workflow recipes from the storage service.",
        whenToCall: "When refreshing procedural memory.",
        whenNotToCall: "When data is already up to date.",
      },
    },
    onAction: async (action, payload) => {
      if (action === "READ") {
        return {
          success: true,
          rulesCount: screenRules.length,
          workflowsCount: workflowRecipes.length,
          searchQuery,
          activeWorkflow: activeWorkflow ? activeWorkflow.title : null,
        };
      }
      if (action === "SEARCH" && typeof payload?.query === "string") {
        setSearchQuery(payload.query);
        return { success: true, query: payload.query, message: `Filtered by '${payload.query}'` };
      }
      if (action === "SELECT_WORKFLOW" && payload) {
        const query = (
          (payload.id as string) ||
          (payload.title as string) ||
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
      }
      if (action === "SWITCH_VIEW" && (payload?.mode === "graph" || payload?.mode === "cards")) {
        setWorkflowViewMode(payload.mode);
        return { success: true, mode: payload.mode };
      }
      if (action === "DELETE_RULE" && typeof payload?.id === "string") {
        const ok = await removeRule(payload.id);
        return { success: ok, id: payload.id };
      }
      if (action === "REFRESH") {
        await refresh();
        return { success: true, message: "Playbook reloaded." };
      }
      return { success: false, error: `Unknown action: ${action}` };
    },
  });
}
