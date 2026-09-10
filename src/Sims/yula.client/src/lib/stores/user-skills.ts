import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { UserSkill, UserSkillFile } from "@/lib/yula-user-skill";

export type { UserSkill };

function makeId() {
  return `u-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

interface UserSkillsState {
  skills: UserSkill[];
  upsertSkill: (draft: {
    id?: string;
    slash: string;
    label: string;
    description: string;
    prompt: string;
    scope?: string;
    files?: UserSkillFile[];
  }) => UserSkill;
  deleteSkill: (id: string) => void;
}

export const useUserSkillsStore = create<UserSkillsState>()(
  persist(
    (set) => ({
      skills: [],
      upsertSkill: (draft) => {
        const now = Date.now();
        const skill: UserSkill = {
          id: draft.id ?? makeId(),
          slash: draft.slash.trim().toLowerCase(),
          label: draft.label.trim(),
          description: draft.description.trim(),
          prompt: draft.prompt.trim(),
          scope: draft.scope && draft.scope !== "global" ? draft.scope : "global",
          files:
            draft.files && draft.files.length > 0 ? [...draft.files] : undefined,
          createdAt: now,
          updatedAt: now,
        };
        set((s) => {
          const idx = s.skills.findIndex((k) => k.id === skill.id);
          if (idx >= 0) {
            const prev = s.skills[idx];
            const next = [...s.skills];
            next[idx] = { ...skill, createdAt: prev.createdAt };
            return { skills: next };
          }
          return { skills: [...s.skills, skill] };
        });
        return skill;
      },
      deleteSkill: (id) =>
        set((s) => ({ skills: s.skills.filter((k) => k.id !== id) })),
    }),
    { name: "yula-user-skills" },
  ),
);

const SKILL_SEED_FLAG = "yula-user-skills-seeded-v1";

/**
 * İlk açılışta örnek skill üretir (tek seferlik; kullanıcı silerse
 * yeniden eklenmez). Yönetim ekranı ilk bağlanışta çağırır.
 */
export function ensureExampleSkill() {
  if (typeof localStorage === "undefined") return;
  if (localStorage.getItem(SKILL_SEED_FLAG)) return;
  localStorage.setItem(SKILL_SEED_FLAG, "1");
  const { skills, upsertSkill } = useUserSkillsStore.getState();
  if (skills.length > 0) return;
  upsertSkill({
    slash: "gunluk-ozet",
    label: "Günlük özet",
    description: "Açık raporun güncel verisinden günün öne çıkanlarını özetler",
    prompt:
      "Açık raporun güncel verisine bak: bugünün en kritik 3 hareketini bul, her birini tek cümleyle yaz. Kısa ol, sayı uydurma.\n{{input}}",
    scope: "global",
    files: [],
  });
}
