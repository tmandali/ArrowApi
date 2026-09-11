import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { UserAgent, UserAgentAttachment } from "@/lib/yula-user-agent";
import { isGeneratedTileAvatar } from "@/lib/yula-user-agent";
import type { YulaEffort } from "@/lib/yula-reasoning";
import { normalizeEffort } from "@/lib/yula-reasoning";
import { parseSeededLocales, withSeededLocale } from "./seed-flags";

export type { UserAgent, UserAgentAttachment };

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
    thinking?: boolean;
    effort?: YulaEffort;
    avatar?: string | null;
    attachments?: UserAgentAttachment[];
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
        // Resim yoksa saklanmaz; baş harfli standart avatar yedeği
        // render anında gösterilir (AgentAvatar).
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
          thinking: draft.thinking,
          effort: normalizeEffort(draft.effort ?? "") ?? undefined,
          avatar: draft.avatar || undefined,
          attachments:
            draft.attachments && draft.attachments.length > 0
              ? [...draft.attachments]
              : undefined,
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

const AGENT_SEED_FLAG = "yula-user-agents-seeded-v2";

/**
 * Seed ajan locale varyantı (gösterim metni); prompt gövdesi dil
 * politikası gereği TR kaynak metin olarak kalır.
 */
const SEED_AGENT_TEXT: Record<"tr" | "en", { name: string; description: string }> = {
  tr: {
    name: "Satış Danışmanı",
    description: "Satış sorularında kısa, sayı odaklı yanıt verir",
  },
  en: {
    name: "Sales Consultant",
    description: "Answers sales questions with short, number-focused replies",
  },
};

/** Eski tohum metni (değiştirilmemişse yeni kimlikli metne yükseltilir). */
const LEGACY_SEED_INSTRUCTIONS =
  "Kısa yaz. Önce sonuç cümlesi, sonra en fazla 3 maddelik bulgu listesi ver. Sayıları grid verisinden al, tahmin üretme. Emin olmadığın filtreyi sormadan çalıştırma; önce sor.";

/** Örnek ajan talimatı — kimlik + selamlaşma davranışı içerir. */
const SEED_INSTRUCTIONS =
  "Sen bir satış danışmanısın: satış raporları, ciro, müşteri ve ürün sorularında uzmansın. Selamlaşmalarda bile bu kimlikle karşıla; kendini kısaca tanıt ve hangi satış verilerinde yardımcı olabileceğini söyle. Kısa yaz. Önce sonuç cümlesi, sonra en fazla 3 maddelik bulgu listesi ver. Sayıları grid verisinden al, tahmin üretme. Emin olmadığın filtreyi sormadan çalıştırma; önce sor.";

/**
 * İlk açılışta örnek ajan üretir (locale başına tek seferlik; kullanıcı
 * silerse aynı locale'de yeniden eklenmez, dil değişince yeni locale'de
 * eklenir). Eski tohum metni hiç değiştirilmeden duruyorsa yeni kimlikli
 * metne yükseltilir; kullanıcının kendi düzenlemesine dokunulmaz.
 * Yönetim ekranı ilk bağlanışta çağırır.
 *
 * Gövde (`instructions`) dil politikası gereği TR kaynak metin olarak
 * kalır; yalnız isim/açıklama locale varyantındır.
 */
export function ensureExampleAgent(locale: "tr" | "en" = "tr") {
  if (typeof localStorage === "undefined") return;
  const { agents, upsertAgent } = useUserAgentsStore.getState();
  const seedText = SEED_AGENT_TEXT[locale];
  const untouchedSeed = agents.find(
    (a) =>
      (a.name === SEED_AGENT_TEXT.tr.name || a.name === SEED_AGENT_TEXT.en.name) &&
      (a.instructions === LEGACY_SEED_INSTRUCTIONS ||
        a.instructions === SEED_INSTRUCTIONS),
  );
  const rawFlag = localStorage.getItem(AGENT_SEED_FLAG);
  if (
    untouchedSeed &&
    (untouchedSeed.instructions === LEGACY_SEED_INSTRUCTIONS ||
      isGeneratedTileAvatar(untouchedSeed.avatar))
  ) {
    upsertAgent({
      ...untouchedSeed,
      instructions: SEED_INSTRUCTIONS,
      // Eski tek harfli karo temizlenir → 2 harfli standart yedek görünür.
      avatar: isGeneratedTileAvatar(untouchedSeed.avatar)
        ? undefined
        : untouchedSeed.avatar,
    });
  } else if (agents.length === 0 && !parseSeededLocales(rawFlag).includes(locale)) {
    upsertAgent({
      name: seedText.name,
      description: seedText.description,
      instructions: SEED_INSTRUCTIONS,
      tools: [],
      skills: [],
      scope: "global",
      provider: "",
      model: "",
    });
  }
  localStorage.setItem(AGENT_SEED_FLAG, withSeededLocale(rawFlag, locale));
}
