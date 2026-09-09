import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { UserAgent } from "@/lib/yula-user-agent";

export type { UserAgent };

function makeId() {
  return `a-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

interface UserAgentsState {
  agents: UserAgent[];
  /** Seçili ajan id'si (boş = varsayılan Yula). Global; sohbet başına değil. */
  activeAgentId: string | null;
  upsertAgent: (draft: {
    id?: string;
    name: string;
    description: string;
    instructions: string;
    tools: string[];
    skills: string[];
    scope?: string;
    provider?: string;
    model?: string;
  }) => UserAgent;
  deleteAgent: (id: string) => void;
  setActiveAgentId: (id: string | null) => void;
}

export const useUserAgentsStore = create<UserAgentsState>()(
  persist(
    (set) => ({
      agents: [],
      activeAgentId: null,
      upsertAgent: (draft) => {
        const now = Date.now();
        const agent: UserAgent = {
          id: draft.id ?? makeId(),
          name: draft.name.trim(),
          description: draft.description.trim(),
          instructions: draft.instructions.trim(),
          tools: [...draft.tools],
          skills: draft.skills.map((s) => s.trim().toLowerCase()).filter(Boolean),
          scope:
            draft.scope && draft.scope !== "global" ? draft.scope : "global",
          provider: draft.provider?.trim() || undefined,
          model: draft.model?.trim() || undefined,
          createdAt: now,
          updatedAt: now,
        };
        set((s) => {
          const idx = s.agents.findIndex((a) => a.id === agent.id);
          if (idx >= 0) {
            const prev = s.agents[idx];
            const next = [...s.agents];
            next[idx] = { ...agent, createdAt: prev.createdAt };
            return { agents: next };
          }
          return { agents: [...s.agents, agent] };
        });
        return agent;
      },
      deleteAgent: (id) =>
        set((s) => ({
          agents: s.agents.filter((a) => a.id !== id),
          activeAgentId: s.activeAgentId === id ? null : s.activeAgentId,
        })),
      setActiveAgentId: (id) => set({ activeAgentId: id }),
    }),
    { name: "yula-user-agents" },
  ),
);
