"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { useScreenAgentContext } from "@/hooks/use-screen-agent-context";
import { useAgentComponent } from "@my-agent/react";
import type { UserSkill } from "@/lib/yula-user-skill";
import type { SkillEditorHandle, SkillEditorMode } from "./skill-editor";

type Selection = { id: string | null; readOnly?: boolean } | null;

export function useSkillAgentBinding({
  selectedSkill,
  selection,
  setSelection,
  mode,
  isReadOnly,
  userSkills,
  systemSkills,
  listed,
  tab,
  setTab,
  activeDetailTab,
  setActiveDetailTab,
  editorRef,
  screenTitle,
}: {
  selectedSkill: UserSkill | null;
  selection: Selection;
  setSelection: (sel: Selection) => void;
  mode: SkillEditorMode | null;
  isReadOnly: boolean;
  userSkills: UserSkill[];
  systemSkills: Array<UserSkill & { readOnly: boolean }>;
  listed: UserSkill[];
  tab: "user" | "system";
  setTab: (tab: "user" | "system") => void;
  activeDetailTab: string;
  setActiveDetailTab: (tab: string) => void;
  editorRef: React.RefObject<SkillEditorHandle | null>;
  screenTitle: string;
}) {
  const t = useTranslations("SkillManagement");

  useScreenAgentContext({
    screenId: "my-skills",
    screenTitle: selectedSkill
      ? `${t("title")} - /${selectedSkill.slash}`
      : screenTitle,
    workspaceId: "my",
    activeDataSummary: {
      isViewingResults: false,
      jobId: undefined,
    },
    quickPrompts: selectedSkill
      ? [
          t("prompt_test_skill", { slash: selectedSkill.slash }),
          t("prompt_explain_skill", { slash: selectedSkill.slash }),
          t("prompt_inspect_skill"),
        ]
      : [
          t("prompt_create_skill"),
          t("prompt_list_skills"),
        ],
    stateExtra: {
      activeSkill: selectedSkill?.slash ?? null,
      selectedId: selection?.id ?? null,
      mode,
      isReadOnly,
      userSkillsCount: userSkills.length,
      systemSkillsCount: systemSkills.length,
    },
  });

  useAgentComponent({
    id: "entity_form:skill_editor",
    meta: {
      entity: "user_skill",
      screenTitle: selectedSkill
        ? `Skill Ayarları - /${selectedSkill.slash}`
        : screenTitle,
      workspace: "my",
      activeSkill: selectedSkill?.slash ?? null,
      skillId: selectedSkill?.id ?? null,
      label: selectedSkill?.label ?? "",
      description: selectedSkill?.description ?? "",
      scope: selectedSkill?.scope ?? "global",
      prompt: selectedSkill?.prompt ?? "",
      mode,
      isReadOnly,
      activeTab: activeDetailTab,
      availableSkills: listed.map((s) => ({
        id: s.id,
        slash: s.slash,
        label: s.label,
        description: s.description || s.label,
        scope: s.scope ?? "global",
        readOnly: "readOnly" in s && s.readOnly === true,
      })),
    },
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
        whenToCall:
          "When the user commands to open, view, inspect, or switch to a specific skill (e.g. 'open xlsx skill', 'skill-creator'a geç').",
        whenNotToCall: "When the requested skill is already selected.",
      },
      SWITCH_TAB: {
        description:
          "Switches the active detail tab in the skill editor ({ tab: 'genel' | 'skillmd' | string }).",
        whenToCall:
          "When the user asks to inspect the SKILL.md markdown or return to general settings.",
        whenNotToCall: "When the requested tab is already active.",
      },
      TEST_SKILL: {
        description:
          "Provides testing instructions or executes test flow for the active skill ({ sampleInput?: string }).",
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
    onAction: async (action, payload) => {
      if (action === "READ") {
        return {
          success: true,
          activeSkill: selectedSkill
            ? {
                slash: selectedSkill.slash,
                label: selectedSkill.label,
                description: selectedSkill.description,
                prompt: selectedSkill.prompt,
                scope: selectedSkill.scope ?? "global",
                isReadOnly,
                files: (selectedSkill.files ?? []).map((f) => f.name),
              }
            : null,
          mode,
          activeTab: activeDetailTab,
          tab,
        };
      }
      if (action === "SELECT_SKILL" && payload) {
        const query = (
          (payload.slash as string) ||
          (payload.id as string) ||
          ""
        ).toLowerCase().replace(/^\//, "");
        const all = [
          ...userSkills.map((s) => ({ ...s, isSystem: false })),
          ...systemSkills.map((s) => ({ ...s, isSystem: true })),
        ];
        const match = all.find(
          (s) =>
            s.slash.toLowerCase() === query ||
            s.id.toLowerCase() === query ||
            s.label.toLowerCase().includes(query),
        );
        if (match) {
          setTab(match.isSystem ? "system" : "user");
          setSelection({ id: match.id, readOnly: match.isSystem });
          setActiveDetailTab("genel");
          return {
            success: true,
            message: `Selected /${match.slash}`,
            skill: { slash: match.slash, label: match.label },
          };
        }
        return { success: false, error: `Skill '${query}' not found.` };
      }
      if (action === "SWITCH_TAB" && typeof payload?.tab === "string") {
        const targetTab = payload.tab;
        setActiveDetailTab(targetTab);
        return { success: true, activeTab: targetTab, message: `Switched to tab ${targetTab}` };
      }
      if (action === "TEST_SKILL") {
        if (!selectedSkill) {
          return { success: false, error: "No skill currently selected." };
        }
        const samplePrompt =
          (payload?.sampleInput as string) ||
          (selectedSkill.slash === "skill-creator"
            ? "Bana Excel fatura kontrolü yapan yeni bir beceri tasarla"
            : `/${selectedSkill.slash} ile örnek test isteği`);
        return {
          success: true,
          activeSkill: selectedSkill.slash,
          slashCommand: `/${selectedSkill.slash}`,
          guidance: `Bu beceriyi (${selectedSkill.label}) test etmek için Yula chat girişine '/${selectedSkill.slash} <istek>' yazabilirsiniz. Örneğin: '/${selectedSkill.slash} ${samplePrompt}'.`,
          skillDescription: selectedSkill.description || selectedSkill.label,
        };
      }
      if (action === "SAVE") {
        if (isReadOnly) {
          return { success: false, error: "Cannot save read-only system skill." };
        }
        editorRef.current?.save();
        return { success: true, message: "Skill saved successfully." };
      }
      return { success: false, error: `Unknown action: ${action}` };
    },
  });
}
