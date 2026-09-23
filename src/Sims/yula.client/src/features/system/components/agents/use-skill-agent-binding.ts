"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { useScreenContract } from "@/hooks/use-screen-contract";
import type { UserSkill } from "@/lib/yula-user-skill";
import type { SkillEditorHandle, SkillEditorMode } from "./skill-editor";
import { SkillEditorContract } from "./skill-editor.contract";

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

  useScreenContract(SkillEditorContract, {
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
    state: {
      activeSkill: selectedSkill?.slash ?? null,
      selectedId: selection?.id ?? null,
      mode,
      isReadOnly,
      userSkillsCount: userSkills.length,
      systemSkillsCount: systemSkills.length,
      activeTab: activeDetailTab,
    },
    getExitSnapshot: () => ({
      activeSkill: selectedSkill?.slash ?? null,
      activeTab: activeDetailTab,
      mode,
    }),
    stateExtra: {
      activeSkill: selectedSkill?.slash ?? null,
      selectedId: selection?.id ?? null,
      mode,
      isReadOnly,
      userSkillsCount: userSkills.length,
      systemSkillsCount: systemSkills.length,
    },
    runtimeMeta: {
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
    handlers: {
      READ: async () => {
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
      },
      SELECT_SKILL: async (payload) => {
        const query = (
          (payload?.slash as string) ||
          (payload?.id as string) ||
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
      },
      SWITCH_TAB: async (payload) => {
        const targetTab = payload?.tab ?? "genel";
        setActiveDetailTab(targetTab);
        return { success: true, activeTab: targetTab, message: `Switched to tab ${targetTab}` };
      },
      TEST_SKILL: async (payload) => {
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
      },
      SAVE: async () => {
        if (isReadOnly) {
          return { success: false, error: "Cannot save read-only system skill." };
        }
        editorRef.current?.save();
        return { success: true, message: "Skill saved successfully." };
      },
    },
  });
}
