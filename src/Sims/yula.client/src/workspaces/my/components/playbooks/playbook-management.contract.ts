import { z } from "zod";
import { defineScreenContract } from "@/lib/contracts/screen-contract";

export const PlaybookSearchInputSchema = z.object({
  query: z.string(),
});

export const PlaybookSelectWorkflowInputSchema = z.object({
  id: z.string().optional(),
  title: z.string().optional(),
});

export const PlaybookSwitchViewInputSchema = z.object({
  mode: z.enum(["graph", "cards"]),
});

export const PlaybookDeleteRuleInputSchema = z.object({
  id: z.string(),
});

export const PlaybooksManagementContract = defineScreenContract({
  screenId: "entity_form:playbook_manager",
  screenTitle: "Prosedürel Hafıza & Playbook (LLM Wiki)",
  workspace: "my",
  category: "interactive_operator",
  aiEnabled: true,
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
      inputSchema: PlaybookSearchInputSchema,
      whenToCall:
        "When the user asks to filter or find rules matching a keyword.",
      whenNotToCall: "When clearing filter (pass query='' to reset).",
    },
    SELECT_WORKFLOW: {
      description:
        "Selects a specific workflow recipe to display on the canvas ({ id?: string, title?: string }).",
      inputSchema: PlaybookSelectWorkflowInputSchema,
      whenToCall:
        "When the user asks to open or inspect a specific workflow diagram.",
      whenNotToCall: "When the requested workflow is already active.",
    },
    SWITCH_VIEW: {
      description:
        "Toggles between graph canvas and cards view for workflow recipes ({ mode: 'graph' | 'cards' }).",
      inputSchema: PlaybookSwitchViewInputSchema,
      whenToCall:
        "When the user asks to switch between the interactive graph and card list.",
      whenNotToCall: "When the requested view mode is already active.",
    },
    DELETE_RULE: {
      description:
        "Removes a verified procedural rule from the playbook ({ id: string }).",
      inputSchema: PlaybookDeleteRuleInputSchema,
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
});

export type PlaybooksManagementAction =
  keyof typeof PlaybooksManagementContract.actions;
