import { z } from "zod";
import { defineScreenContract } from "@/lib/contracts/screen-contract";

export const SelectSkillInputSchema = z.object({
  slash: z.string().optional(),
  id: z.string().optional(),
});

export const SwitchSkillTabInputSchema = z.object({
  tab: z.string(),
});

export const TestSkillInputSchema = z.object({
  sampleInput: z.string().optional(),
});

export const SkillEditorContract = defineScreenContract({
  screenId: "entity_form:skill_editor",
  screenTitle: "Beceriler & Komutlar (Skills)",
  workspace: "my",
  category: "interactive_operator",
  aiEnabled: true,
  actions: {
    READ: {
      description:
        "Reads the currently selected skill details, metadata, and SKILL.md prompt content.",
      whenToCall:
        "When inspecting or asking about the active skill, its purpose, prompt, or configuration.",
      whenNotToCall: "When changing values or switching skills.",
    },
    SELECT_SKILL: {
      description:
        "Selects a skill from the list to view or edit on screen ({ slash?: string, id?: string }).",
      inputSchema: SelectSkillInputSchema,
      whenToCall:
        "When the user commands to open, view, inspect, or switch to a specific skill (e.g. 'open xlsx skill', 'skill-creator'a geç').",
      whenNotToCall: "When the requested skill is already selected.",
    },
    SWITCH_TAB: {
      description:
        "Switches the active detail tab in the skill editor ({ tab: 'genel' | 'skillmd' | string }).",
      inputSchema: SwitchSkillTabInputSchema,
      whenToCall:
        "When the user asks to inspect the SKILL.md markdown or return to general settings.",
      whenNotToCall: "When the requested tab is already active.",
    },
    TEST_SKILL: {
      description:
        "Provides testing instructions or executes test flow for the active skill ({ sampleInput?: string }).",
      inputSchema: TestSkillInputSchema,
      whenToCall:
        "When the user asks 'how do I test this skill', 'test this skill', 'bu skili nasıl test ederim', etc.",
      whenNotToCall: "When editing or saving fields.",
    },
    SAVE: {
      description: "Saves changes made to the currently active user skill.",
      whenToCall: "When the user asks to save the skill edits.",
      whenNotToCall: "When viewing a read-only system skill or when no edits were made.",
    },
  },
});

export type SkillEditorAction = keyof typeof SkillEditorContract.actions;
