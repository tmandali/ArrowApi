import { load } from "js-yaml";
import {
  SquarePen,
  RotateCcw,
  ShieldAlert,
  HelpCircle,
  Download,
  Sparkles,
  ListTodo,
  Minimize2,
  Cpu,
  Brain,
  Layers,
  LogIn,
  Server,
  RefreshCw,
  Globe,
  type LucideIcon,
} from "lucide-react";
import systemAgentYaml from "@/features/system/agents/system.agent.yaml";
import gridAgentYaml from "@/features/reports/agents/grid.agent.yaml";
import { useUserSkillsStore } from "@/lib/stores/user-skills";
import type { UserSkill } from "@/lib/stores/user-skills";
import { BUILT_IN_USER_SKILLS } from "@/lib/built-in-skills";
import { getAllUserSkillsInventory, getEffectiveUserSkills } from "@/lib/yula-user-skill";

export type YulaCommand = {
  id: string;
  /** Slash trigger (önsiz, örn: "analiz") */
  slash: string;
  label: string;
  description: string;
  /** İstemciye eklenen veya gönderilen prompt metni */
  prompt: string;
  icon: LucideIcon;
  /** Bu raporu zaten açıkken slash paletinden gizlenir (kriter evresi). */
  pagePath?: string;
  /** Kullanıcı skill'i ise "user" — gönderimde {{input}} şablonu uygulanır. */
  source?: "user";
  phase?: "system" | "grid" | "report";
  /** Ayrıştırıcı durum rozeti (örn: "Aktif", "Giriş yapıldı", "Giriş gerekli") */
  badge?: string;
  /** Rozet rengi/stili */
  badgeVariant?: "active" | "success" | "muted" | "default";
  /** Sağlayıcının oturumu/yetkisi doğrulanmış mı */
  isLoggedIn?: boolean;
};

export type YulaCommandYamlItem = {
  id: string;
  slash: string;
  label: string;
  description: string;
  prompt: string;
  icon: string;
  phase?: "system" | "grid" | "report";
  pagePath?: string;
};

export type YulaCommandYamlManifest = {
  commands: YulaCommandYamlItem[];
};

/** İkon metin isimlerini Lucide React bileşenlerine dönüştüren dinamik harita */
const ICON_MAP: Record<string, LucideIcon> = {
  SquarePen,
  RotateCcw,
  ShieldAlert,
  Download,
  ListTodo,
  Minimize2,
  Cpu,
  HelpCircle,
  Layers,
  LogIn,
  Server,
};

function resolveIcon(iconName: string): LucideIcon {
  return ICON_MAP[iconName] ?? HelpCircle;
}

function parseYamlCommands(yamlSource: string): YulaCommand[] {
  try {
    const doc = (load(yamlSource) || {}) as YulaCommandYamlManifest;
    if (!doc || !Array.isArray(doc.commands)) return [];
    return doc.commands.map((cmd) => ({
      id: cmd.id,
      slash: cmd.slash,
      label: cmd.label,
      description: cmd.description,
      prompt: cmd.prompt,
      icon: resolveIcon(cmd.icon),
      pagePath: cmd.pagePath,
      phase: cmd.phase,
    }));
  } catch (error) {
    console.error("YAML Command Parse Error:", error);
    return [];
  }
}

/** Sistem Evresi Komutları (features/system manifest'i — Public API) */
export const SYSTEM_COMMANDS: YulaCommand[] = parseYamlCommands(systemAgentYaml);

/** Sonuç Evresi Komutları (features/reports manifest'i — Public API) */
export const GRID_COMMANDS: YulaCommand[] = parseYamlCommands(gridAgentYaml);

/**
 * Slash paleti komut listesi:
 * - Sonuç (GUID / grid) → /analiz, /temizle, /indir ve sistem komutları
 * - Kriter / workspace → Sistem komutları (/yeni, /dump)
 * Kullanıcı skill'leri (`extra`) her iki evrede de listelenir (kapsamına göre).
 */
export function getAllYulaCommands(
  isViewingResults = false,
  _pathname = "/",
  extra: YulaCommand[] = [],
): YulaCommand[] {
  if (isViewingResults) {
    return [...SYSTEM_COMMANDS, ...GRID_COMMANDS, ...extra];
  }
  return [...SYSTEM_COMMANDS, ...extra];
}

/**
 * Kullanıcı skill'lerini YulaCommand borusuna dönüştürür (yerleşikler dahil).
 * `allowedSlashes` verilirse (ajan seçimi) kapsam filtresi uygulanmaz —
 * ajanın açık seçimi kapsamı ezer; boş dizi = skill komutu yok.
 */
export function userSkillsToCommands(
  skills: UserSkill[],
  workspaceId?: string | null,
  allowedSlashes?: string[],
  t?: (key: string) => string,
): YulaCommand[] {
  const inScope =
    allowedSlashes !== undefined
      ? (() => {
          const allowed = new Set(allowedSlashes.map((s) => s.toLowerCase()));
          return getAllUserSkillsInventory(skills, BUILT_IN_USER_SKILLS).filter(
            (s) => allowed.has(s.slash.toLowerCase()),
          );
        })()
      : getEffectiveUserSkills(skills, BUILT_IN_USER_SKILLS, workspaceId);
  return inScope.map((s) => ({
    id: s.id,
    slash: s.slash,
    label: s.label,
    description: s.description || t?.("user_skill_default") || "User skill",
    prompt: s.prompt,
    icon: Sparkles,
    source: "user" as const,
  }));
}

/** Cihaz-içi skill anlık görüntüsü (hook'suz; saf resolver'lar için). */
export function getUserSkillCommandsSnapshot(): YulaCommand[] {
  try {
    return userSkillsToCommands(useUserSkillsStore.getState().skills);
  } catch {
    return [];
  }
}

/** Manifestteki tüm slash komutları (tam eşleşme için). */
export function getRegisteredYulaCommands(
  extra: YulaCommand[] = getUserSkillCommandsSnapshot(),
): YulaCommand[] {
  const seen = new Set<string>();
  const out: YulaCommand[] = [];
  for (const cmd of [...SYSTEM_COMMANDS, ...GRID_COMMANDS, ...extra]) {
    const key = cmd.slash.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cmd);
  }
  return out;
}

/**
 * Komut metinlerini yerel dilde çözümleyerek döndürür:
 * `Commands` next-intl ad alanından id bazlı label/description/prompt
 * alınır; slash tetikleyici token'ları dil-bağımsız (stable key) olarak
 * değişmeden kalır.
 * `source === "user"` komutları (kullanıcı skill'leri) içerik olarak
 * çevrilemez → olduğu gibi geçer.
 */
export function localizeYulaCommands(
  commands: YulaCommand[],
  t: (key: string) => string,
): YulaCommand[] {
  return commands.map((cmd) => {
    if (cmd.source === "user") return cmd;
    return {
      ...cmd,
      label: t(`${cmd.id}.label`),
      description: t(`${cmd.id}.description`),
      prompt: t(`${cmd.id}.prompt`),
    };
  });
}

/** `/analiz foo` → kayıtlı komut; `/4` veya bilinmeyen slash → null. */
export function resolveYulaSlashCommand(
  input: string,
  commands: YulaCommand[] = getRegisteredYulaCommands(),
): YulaCommand | null {
  if (!input.startsWith("/")) return null;
  const token = input.slice(1).trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  if (!token) return null;
  const normToken = token.replace(/ı/g, "i");
  return (
    commands.find((c) => {
      const slash = c.slash.toLowerCase();
      return slash === token || slash.replace(/ı/g, "i") === normToken;
    }) ?? null
  );
}

export function isYulaGridSlashPrompt(
  text: string,
  commands: YulaCommand[] = GRID_COMMANDS,
): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (resolveYulaSlashCommand(trimmed, commands)) return true;
  const lower = trimmed.toLowerCase();
  return commands.some((cmd) => cmd.prompt.trim().toLowerCase() === lower);
}

export function matchYulaCommands(
  input: string,
  allCommands: YulaCommand[] = getAllYulaCommands(),
): YulaCommand[] | null {
  if (!input.startsWith("/")) return null;
  const query = input.slice(1).trim().toLowerCase().replace(/ı/g, "i");
  if (!query) return allCommands;
  return allCommands.filter((command) => {
    const slash = command.slash.toLowerCase().replace(/ı/g, "i");
    const label = command.label.toLowerCase().replace(/ı/g, "i");
    const desc = (command.description || "").toLowerCase().replace(/ı/g, "i");
    return (
      slash.includes(query) ||
      label.includes(query) ||
      desc.includes(query)
    );
  });
}

export const PROVIDER_SUBCOMMANDS: YulaCommand[] = [
  {
    id: "provider-azure",
    slash: "azure",
    label: "Azure OpenAI",
    description: "Kurumsal Azure Foundry modelleri",
    prompt: "azure",
    icon: Layers,
    phase: "system",
  },
  {
    id: "provider-ollama",
    slash: "ollama",
    label: "Ollama",
    description: "Yerel makinede çalışan açık kaynak modeller",
    prompt: "ollama",
    icon: Server,
    phase: "system",
  },
  {
    id: "provider-openai",
    slash: "openai",
    label: "OpenAI / Uyumlu",
    description: "OpenAI API'leri",
    prompt: "openai",
    icon: Cpu,
    phase: "system",
  },
  {
    id: "provider-agnes",
    slash: "agnes",
    label: "Agnes AI",
    description: "Agnes kurumsal ajan modelleri",
    prompt: "agnes",
    icon: Sparkles,
    phase: "system",
  },
  {
    id: "provider-openrouter",
    slash: "openrouter",
    label: "OpenRouter",
    description: "Çoklu model ve sağlayıcı ağ geçidi",
    prompt: "openrouter",
    icon: Globe,
    phase: "system",
  },
  {
    id: "provider-nvidia",
    slash: "nvidia",
    label: "NVIDIA NIM",
    description: "NVIDIA kurumsal AI mikroservisleri",
    prompt: "nvidia",
    icon: Cpu,
    phase: "system",
  },
  {
    id: "provider-opencode",
    slash: "opencode",
    label: "OpenCode",
    description: "Açık kaynak kod zekası modelleri",
    prompt: "opencode",
    icon: Layers,
    phase: "system",
  },
];

export interface ProviderMatchOptions {
  availableProviderIds?: string[];
  activeProvider?: string;
  activeLabel?: string;
  loggedInLabel?: string;
  notConfiguredLabel?: string;
}

export function matchProviderSubcommands(
  query: string,
  providersOrOptions?: YulaCommand[] | ProviderMatchOptions,
  maybeOptions?: ProviderMatchOptions,
): YulaCommand[] {
  const providers = Array.isArray(providersOrOptions)
    ? providersOrOptions
    : PROVIDER_SUBCOMMANDS;
  const options = Array.isArray(providersOrOptions)
    ? maybeOptions
    : providersOrOptions;

  const availableSet = new Set(
    (options?.availableProviderIds ?? []).map((id) => id.toLowerCase()),
  );
  const activeProv = (options?.activeProvider ?? "").toLowerCase();

  const decorated: YulaCommand[] = providers.map((p) => {
    const provId = p.slash.toLowerCase();
    const isActive = activeProv ? provId === activeProv : false;
    const isLoggedIn = availableSet.has(provId);

    let badge: string | undefined;
    let badgeVariant: YulaCommand["badgeVariant"];

    if (isActive) {
      badge = options?.activeLabel || "Aktif";
      badgeVariant = "active";
    } else if (isLoggedIn) {
      badge = options?.loggedInLabel || "Giriş yapıldı";
      badgeVariant = "success";
    } else if (options?.availableProviderIds && options.availableProviderIds.length > 0) {
      badge = options?.notConfiguredLabel || "Giriş gerekli";
      badgeVariant = "muted";
    }

    return {
      ...p,
      badge,
      badgeVariant,
      isLoggedIn: isActive || isLoggedIn,
    };
  });

  // Sıralama: Aktif sağlayıcı başta, ardından giriş yapılmışlar, en son diğerleri
  const sorted = [...decorated].sort((a, b) => {
    if (a.badgeVariant === "active") return -1;
    if (b.badgeVariant === "active") return 1;
    if (a.isLoggedIn && !b.isLoggedIn) return -1;
    if (!a.isLoggedIn && b.isLoggedIn) return 1;
    return 0;
  });

  const q = query.trim().toLowerCase().replace(/ı/g, "i");
  if (!q) return sorted;
  return sorted.filter((p) =>
    p.slash.toLowerCase().replace(/ı/g, "i").includes(q) ||
    p.label.toLowerCase().replace(/ı/g, "i").includes(q) ||
    p.description.toLowerCase().replace(/ı/g, "i").includes(q)
  );
}

export const DEFAULT_AUTHORIZED_MODELS = [
  { id: "gpt-5.6-luna", name: "GPT-5.6 Luna", provider: "azure", providerLabel: "Azure Foundry", hasThinking: true, isConfigured: true },
  { id: "gpt-5.4", name: "GPT-5.4", provider: "azure", providerLabel: "Azure Foundry", hasThinking: true, isConfigured: true },
  { id: "gpt-4o", name: "GPT-4o", provider: "azure", providerLabel: "Azure / OpenAI", hasThinking: false, isConfigured: true },
  { id: "o3-mini", name: "o3-mini", provider: "azure", providerLabel: "Reasoning", hasThinking: true, isConfigured: true },
  { id: "gemma4:12b-mlx", name: "Gemma 4 12B MLX", provider: "ollama", providerLabel: "Ollama (Yerel)", hasThinking: true, isConfigured: true },
  { id: "llama3.3:70b", name: "Llama 3.3 70B", provider: "ollama", providerLabel: "Ollama (Yerel)", hasThinking: true, isConfigured: true },
  { id: "qwen2.5:32b", name: "Qwen 2.5 32B", provider: "ollama", providerLabel: "Ollama (Yerel)", hasThinking: true, isConfigured: true },
  { id: "deepseek-r1:14b", name: "DeepSeek R1 14B", provider: "ollama", providerLabel: "Ollama (Yerel)", hasThinking: true, isConfigured: true },
  { id: "meta/llama-3.3-70b-instruct", name: "Llama 3.3 70B", provider: "nvidia", providerLabel: "NVIDIA NIM", hasThinking: false, isConfigured: true },
  { id: "deepseek-ai/deepseek-r1", name: "DeepSeek R1", provider: "nvidia", providerLabel: "NVIDIA NIM", hasThinking: true, isConfigured: true },
  { id: "anthropic/claude-sonnet-4", name: "Claude Sonnet 4", provider: "openrouter", providerLabel: "OpenRouter", hasThinking: false, isConfigured: true },
  { id: "agnes-3.0-flash", name: "Agnes 3.0 Flash", provider: "agnes", providerLabel: "Agnes AI", hasThinking: true, isConfigured: true },
  { id: "opencode-default", name: "OpenCode Default", provider: "opencode", providerLabel: "OpenCode", hasThinking: false, isConfigured: true },
];

export function matchModelSubcommands(
  query: string,
  models?: Array<{
    id: string;
    name: string;
    provider: string;
    providerLabel?: string;
    hasThinking?: boolean;
    isConfigured?: boolean;
  }>,
  isRefreshing?: boolean,
  activeProvider?: string,
): YulaCommand[] {
  const source = models && models.length > 0 ? models : DEFAULT_AUTHORIZED_MODELS;
  const q = query.trim().toLowerCase().replace(/ı/g, "i");
  const actProv = (activeProvider || "").toLowerCase();

  const filtered = q
    ? source.filter(
        (m) =>
          m.id.toLowerCase().replace(/ı/g, "i").includes(q) ||
          m.name.toLowerCase().replace(/ı/g, "i").includes(q) ||
          m.provider.toLowerCase().replace(/ı/g, "i").includes(q) ||
          (m.providerLabel && m.providerLabel.toLowerCase().replace(/ı/g, "i").includes(q))
      )
    : source;

  // Sıralama: Aktif sağlayıcının modelleri en başta gelir
  const sorted = [...filtered].sort((a, b) => {
    if (actProv) {
      const aAct = a.provider.toLowerCase() === actProv;
      const bAct = b.provider.toLowerCase() === actProv;
      if (aAct && !bAct) return -1;
      if (!aAct && bAct) return 1;
    }
    return 0;
  });

  const results: YulaCommand[] = sorted.map((m) => {
    const isAct = actProv ? m.provider.toLowerCase() === actProv : false;
    const badges = [m.providerLabel || m.provider];
    if (m.isConfigured) badges.push("Config");
    if (m.hasThinking) badges.push("Reasoning");

    return {
      id: `model-${m.provider}-${m.id}`,
      slash: m.id,
      label: m.name,
      description: badges.join(" · "),
      prompt: m.id,
      icon: m.hasThinking ? Brain : Cpu,
      phase: "system",
      pagePath: m.provider,
      badge: isAct ? "Aktif" : undefined,
      badgeVariant: isAct ? "active" : undefined,
    };
  });

  if (!q || "refresh".includes(q) || "yenile".includes(q) || "guncelle".includes(q)) {
    results.push({
      id: "model:refresh",
      slash: "refresh",
      label: isRefreshing ? "Modeller Çekiliyor..." : "Modelleri Yenile (Sağlayıcılardan Canlı Çek)",
      description: isRefreshing
        ? "Sağlayıcılardan güncel modeller sorgulanıyor..."
        : "Önbelleği temizleyip sağlayıcılardan güncel modelleri sorgular",
      prompt: "refresh",
      icon: RefreshCw,
      phase: "system",
      pagePath: "refresh",
    });
  }

  return results;
}
