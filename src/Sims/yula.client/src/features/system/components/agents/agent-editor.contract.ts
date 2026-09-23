import { z } from "zod";
import { defineScreenContract } from "@/lib/contracts/screen-contract";

export const SelectAgentInputSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
});

export const SwitchTabInputSchema = z.object({
  tab: z.enum(["genel", "agentmd"]),
});

export const SetActiveInputSchema = z.object({
  agentId: z.string().optional(),
});

export const AgentEditorContract = defineScreenContract({
  screenId: "entity_form:agent_editor",
  screenTitle: "Personalar & Ajanlar Yönetimi",
  workspace: "my",
  category: "interactive_operator",
  aiEnabled: true,
  actions: {
    READ: {
      description:
        "Reads the currently selected agent details, persona configuration, and AGENT.md instructions.",
      whenToCall:
        "When inspecting or asking about the active agent, its instructions, tools, or model settings.",
      whenNotToCall: "When modifying values or switching agents.",
    },
    SELECT_AGENT: {
      description:
        "Selects an agent from the list to view or edit on screen ({ name?: string, id?: string }).",
      inputSchema: SelectAgentInputSchema,
      whenToCall:
        "When the user commands to open, view, or switch to a specific agent.",
      whenNotToCall: "When the requested agent is already selected.",
    },
    SWITCH_TAB: {
      description:
        "Switches the active detail tab in the agent editor ({ tab: 'genel' | 'agentmd' }).",
      inputSchema: SwitchTabInputSchema,
      whenToCall:
        "When the user asks to inspect the AGENT.md markdown or return to general settings.",
      whenNotToCall: "When the requested tab is already active.",
    },
    SET_ACTIVE: {
      description:
        "Sets the selected agent as the active persona for the user ({ agentId?: string }).",
      inputSchema: SetActiveInputSchema,
      whenToCall:
        "When the user asks to activate or start using this agent as their active assistant persona.",
      whenNotToCall: "When only viewing or editing configuration.",
    },
    TEST_AGENT: {
      description:
        "Opens or navigates to a live chat session with the selected agent persona.",
      whenToCall:
        "When the user asks to test, chat with, or try out this agent.",
      whenNotToCall: "When editing settings.",
    },
    SAVE: {
      description: "Saves changes made to the currently active agent.",
      whenToCall: "When the user commands to save the agent edits.",
      whenNotToCall: "When viewing without changes.",
    },
  },
});

export type AgentEditorAction = keyof typeof AgentEditorContract.actions;
