/**
 * Kullanıcı tanımlı ajanlar (persona) — saf çekirdek.
 * Rehber karşılığı (cookbook Step 5/6): ajan = model-dışı kimlik katmanı;
 * talimat + araç erişimi + skill envanteri. Yürütme mevcut sohbet hattında
 * olur (route: LEVEL 0 persona + prepareStep kesişimi); bu modül yalnızca
 * veri + saf kuralları taşır. Store `lib/stores/user-agents.ts` içindedir.
 *
 * Kanonik belge biçimi `agent.md` (SKILL.md deseni): frontmatter'da kimlik
 * (name/description/scope/provider/model/tools/skills), gövdede persona
 * talimatları. Editörde gövde tek kaynaktır (AGENT.md sekmesi),
 * frontmatter Genel sekmesindeki alanlardan üretilir.
 */
import { load } from "js-yaml";
import { normalizeEffort, type YulaEffort } from "./yula-reasoning";
import { workspaceIdFromPath } from "./workspace-paths";
export interface UserAgent {
  id: string;
  name: string;
  description: string;
  /** Sistem promptuna eklenen persona talimatları */
  instructions: string;
  /**
   * Araç allowlist — BOŞ = tüm araçlar. "grid-tools" jetonu dinamik grid
   * araç grubunu açar; diğer girdiler statik araç adlarıdır.
   */
  tools: string[];
  /**
   * Skill daraltma — BOŞ = skill yok. Doluysa envanter bu slash listesine
   * iner (önsiz adlar). (Ajan seçili değilken = varsayılan Yula: kapsamdaki
   * tüm skill'ler.)
   */
  skills: string[];
  /** Kapsam: "global" (her yerde) veya workspace id. */
  scope?: string;
  /**
   * Çıkarım kimliği — boş = genel ayar. provider + model çift tutulur
   * (seçicide de kupliler; tek başına model/provider geçersiz eşleşmeye düşer).
   */
  provider?: string;
  model?: string;
  /**
   * Düşünme modu — undefined = genel ayar (sohbet anahtarı). Ajan pini
   * doluysa isteğe yazılır; sunucuda YULA_THINKING env'i üstündür.
   * (Eski alan; yeni ajanlar `effort` kullanır. `thinking: false` => efor off.)
   */
  thinking?: boolean;
  /**
   * Efor seviyesi — undefined/boş = genel ayar (miras). Doluysa thinking
   * bayrağından önceliklidir; sunucuda AI SDK `reasoning` parametresine
   * taşınır (provider destekliyorsa).
   */
  effort?: YulaEffort;
  /**
   * Ajan görseli (dataURL, cihaz içi). localStorage'da saklanır, agent.md
   * belgesine yazılmaz (boyut) ve sohbet bağlamına gönderilmez.
   */
  avatar?: string;
  /**
   * Ek referans dokümanlar (salt metin). LEVEL 0'a gömülür; agent.md
   * belgesine yazılmaz.
   */
  attachments?: UserAgentAttachment[];
  createdAt: number;
  updatedAt: number;
}

/** Ajan görseli üst sınırı (localStorage şişmesin) */
export const USER_AGENT_AVATAR_MAX_BYTES = 500 * 1024;

/**
 * Eski otomatik üretilmiş karo görsel mi? (tek harfli turuncu SVG —
 * artık baş harf yedeği kullanıldığı için kayıtlı kalırsa temizlenir).
 */
export function isGeneratedTileAvatar(value?: string | null): boolean {
  if (!value?.startsWith("data:image/svg+xml,")) return false;
  try {
    const svg = decodeURIComponent(value.slice("data:image/svg+xml,".length));
    return svg.includes("rx='20'") && svg.includes("font-size='44'");
  } catch {
    return false;
  }
}

/** Ajan ek dosya (salt metin referans doküman) */
export interface UserAgentAttachment {
  name: string;
  content: string;
}

/** Ek dosya uzantı allowlist'i (skill dosyalarıyla aynı) */
export const USER_AGENT_ATTACHMENT_EXTENSIONS = [
  ".md",
  ".markdown",
  ".txt",
  ".json",
] as const;
/** Tek dosya üst sınırı */
export const USER_AGENT_ATTACHMENT_MAX_CHARS = 32_000;
/** Ajan başına toplam üst sınır */
export const USER_AGENT_ATTACHMENTS_TOTAL_MAX_CHARS = 200_000;
/** Prompt'a (LEVEL 0) gömülen toplam üst sınır */
export const USER_AGENT_ATTACHMENTS_PROMPT_MAX_CHARS = 24_000;

/**
 * Dil bağımsız validasyon konusu: lib fonksiyonları dil nötr `code` döner,
 * ekran katmanı kodu `Validation` namespace'inden çözümleyerek yerelleştirir
 * (lib'de hook/i18n olmadığı için mesaj metni lib'de tutulmaz).
 */
export interface ValidationIssue {
  code: string;
  params?: Record<string, string | number>;
}

/** Validasyon konusunu `Validation` namespace'inden mesaj metnine çevirir. */
export function resolveValidationIssue(
  issue: ValidationIssue | null,
  t: (key: string, values?: Record<string, string | number>) => string,
): string | null {
  return issue ? t(issue.code, issue.params ?? {}) : null;
}

/** Ek dosya validasyonu — saf. */
export function validateAgentAttachmentFile(
  file: { name: string; content: string },
  existingNames: string[],
): ValidationIssue | null {
  const name = file.name.trim();
  if (!name) return { code: "file_name_empty" };
  if (name.length > 120)
    return { code: "file_name_too_long", params: { max: 120 } };
  if (/[/\\]/.test(name)) return { code: "file_name_no_folder" };
  const lower = name.toLowerCase();
  const okExt = USER_AGENT_ATTACHMENT_EXTENSIONS.some((e) =>
    lower.endsWith(e),
  );
  if (!okExt)
    return {
      code: "file_ext_only",
      params: { exts: USER_AGENT_ATTACHMENT_EXTENSIONS.join(", ") },
    };
  if (existingNames.map((n) => n.toLowerCase()).includes(lower))
    return { code: "file_already_added", params: { name } };
  if (!file.content.trim())
    return { code: "file_is_empty", params: { name } };
  if (file.content.length > USER_AGENT_ATTACHMENT_MAX_CHARS)
    return {
      code: "file_too_large",
      params: {
        name,
        max: USER_AGENT_ATTACHMENT_MAX_CHARS / 1024,
        size: (file.content.length / 1024).toFixed(1),
      },
    };
  return null;
}

/** Toplam boyut kontrolü — saf. */
export function agentAttachmentsSize(files: UserAgentAttachment[]): number {
  return files.reduce((acc, f) => acc + f.content.length, 0);
}

/**
 * Persona lint — saf. Talimatta faz duvarıyla çelişen dayatma varsa uyarı
 * döndürür (kaydetme engellenmez, yalnız uyarı); bulgular `Validation`
 * namespace kodlarıdır (dil bağımsız). Sabit kalıp listesi:
 * Türkçe + İngilizce kökler; noktalama/case duyarsız.
 */
export function lintAgentInstructions(instructions: string): string[] {
  const text = instructions.toLowerCase();
  const findings: string[] = [];
  const hits = (patterns: RegExp[]) => patterns.some((re) => re.test(text));
  if (
    hits([
      /onay(sız|siz| almadan| istemeden| beklemeden)/,
      // Olumsuzluk eki hariç: "sormadan çalıştırma / yapmayın" yasaklayıcıdır,
      // dayatma değildir (negation guard).
      /sormadan\s+(çalıştır|calistir|başlat|kos|koş|yap|uygula|sil|gönder)(?!m[ae](\b|y[ıiuü]n\b))/,
      /her\s+zaman\s+(çalıştır|calistir|başlat|kos|koş|yap|uygula)(?!m[ae](\b|y[ıiuü]n\b))/,
      /without\s+(asking|confirmation|approval)/,
      /always\s+(run|execute|start|apply|delete|send)/,
      /never\s+ask\b/,
      /skip\s+(confirmation|approval)/,
    ])
  ) {
    findings.push("lint_bypass");
  }
  if (
    hits([
      /araç\s+kullanma/,
      /tool\s*kullanma/,
      /do\s+not\s+use\s+(any\s+)?tools?/,
      /never\s+call\s+(any\s+)?tools?/,
    ])
  ) {
    findings.push("lint_tool_ban");
  }
  if (
    hits([
      /türkçe\s+(cevap\s+ver|yanıtla|yaz|konuş)/,
      /sadece\s+türkçe/,
      /respond\s+(only\s+)?in\s+turkish/,
      /always\s+(respond|reply|answer)\s+in\s+turkish/,
    ])
  ) {
    findings.push("lint_single_lang");
  }
  return findings;
}

/** Persona lint testleri için kök-cause listesi — saf. */
export const AGENT_LINT_SAMPLES = {
  approvalBypass: "Kullanıcı sormadan çalıştır, onaysız devam et.",
  toolBan: "Araç kullanma, yalnız metin yaz.",
  singleLanguage: "Her zaman Türkçe cevap ver.",
  clean: "Sen bir satış danışmanısın. Kısa yaz, sayıları grid verisinden al.",
} as const;

/** Ajan formundaki sağlayıcı seçenekleri (boş = genel ayar) */
export const AGENT_PROVIDER_OPTIONS: Array<{ id: string; label: string }> = [
  { id: "", label: "Genel ayar" },
  { id: "azure", label: "Azure Foundry" },
  { id: "ollama", label: "Ollama (yerel)" },
  { id: "openai", label: "OpenAI" },
  { id: "agnes", label: "Agnes" },
];

/** Dinamik grid araç grubunu temsil eden jeton */
export const GRID_TOOLS_TOKEN = "grid-tools";

/** Ajan formundaki araç çoklu-seçimi için katalog (statik araçlar + grup jetonu) */
export const AGENT_TOOL_CATALOG: Array<{ name: string; label: string }> = [
  { name: "run_job", label: "Rapor çalıştırma" },
  { name: "apply_criteria", label: "Kriter uygulama" },
  { name: "find_matching_report", label: "Mevcut rapor arama" },
  { name: "open_last_report", label: "Son raporu açma" },
  { name: "list_report_executions", label: "Çalışma geçmişi" },
  { name: "cancel_job", label: "İşi iptal etme" },
  { name: "navigate_to_page", label: "Sayfa gezinmesi" },
  { name: "get_report_schema", label: "Şema okuma" },
  { name: "validate_criteria_input", label: "Kriter doğrulama" },
  { name: "get_current_criteria", label: "Form okuma" },
  { name: "ask_user_question", label: "Kullanıcıya soru sorma" },
  { name: "suggest_next_steps", label: "Öneri sunma" },
  { name: "request_user_confirmation", label: "Onay isteme" },
  { name: "run_user_skill", label: "Skill çalıştırma" },
  { name: "run_skill_script", label: "Skill betiği" },
  { name: "read_skill_file", label: "Skill dosyası okuma" },
  { name: GRID_TOOLS_TOKEN, label: "Grid araçları (tablo/SQL/grafik)" },
];

/**
 * Katalog label'larını render anında yerelleştirir (model katmanındaki tool
 * `name` ve provider `id` dil bağımsız kalır; yalnızca görünen label
 * `AgentCatalog` namespace'inden çözülür). `t`, AgentCatalog namespace'inden
 * gelir.
 */
export function localizeAgentToolCatalog(
  catalog: Array<{ name: string; label: string }>,
  t: (key: string) => string,
): Array<{ name: string; label: string }> {
  return catalog.map((item) => ({ ...item, label: t(`tool_${item.name}`) }));
}

/** Boş `id` (genel ayar) çevrilemez — çağıran taraf özel durumunu korur. */
export function localizeProviderOptions(
  options: Array<{ id: string; label: string }>,
  t: (key: string) => string,
): Array<{ id: string; label: string }> {
  return options.map((o) => (o.id ? { ...o, label: t(`provider_${o.id}`) } : o));
}

/** Editor validasyonu — saf. */
export function validateUserAgent(
  draft: { name: string; instructions: string },
  takenNames: string[],
): ValidationIssue | null {
  const name = draft.name.trim();
  if (!name) return { code: "agent_name_empty" };
  if (
    takenNames.map((n) => n.toLowerCase()).includes(name.toLowerCase())
  ) {
    return { code: "agent_name_taken", params: { name } };
  }
  if (!draft.instructions.trim())
    return { code: "agent_instructions_empty" };
  return null;
}

/**
 * Ajan kapsamı için sayfa kimliği. System workspace'ü (kök "/" ve tüm
 * "/system/*" yönetim sayfaları) daima yalnız ana Yula AI ile çalışır:
 * "system" kapsamı `filterAgentsByScope`'ta [] döner, böylece global/user
 * ajanlar ana sayfa dock'unda da görünmez. Diğer workspace'lerde global +
 * o workspace'e özel ajanlar geçerlidir.
 */
export function agentScopeWorkspaceId(pathname: string): string {
  return workspaceIdFromPath(pathname);
}

/**
 * Kapsam filtresi — saf. System yönetim alanında ajan kimliği seçilemez
 * (hiçbir ajan system kapsamlı olamaz); global = tüm çalışma alanları.
 */
export function filterAgentsByScope(
  agents: UserAgent[],
  workspaceId?: string | null,
): UserAgent[] {
  if (workspaceId === "system") return [];
  return agents.filter((a) => {
    const scope = a.scope ?? "global";
    if (scope === "global") return true;
    return !!workspaceId && scope === workspaceId;
  });
}

/**
 * prepareStep kesişimi — saf. Boş allowlist = tüm faz araçları.
 * "grid-tools" jetonu, fazın dinamik grid araçlarını topluca açar.
 */
export function filterActiveToolsByAgent(
  phaseTools: string[],
  gridToolNames: string[],
  agentTools: string[] | undefined,
): string[] {
  if (!agentTools || agentTools.length === 0) return phaseTools;
  const allowed = new Set(agentTools);
  const grid = new Set(gridToolNames);
  return phaseTools.filter(
    (t) =>
      allowed.has(t) ||
      (grid.has(t) && allowed.has(GRID_TOOLS_TOKEN)),
  );
}

/** agent.md gövdesi ayrıştırma sonucu (frontmatter + talimat gövdesi) — saf. */
export interface ParsedAgentFile {
  name: string;
  description: string;
  scope: string;
  provider: string;
  model: string;
  thinking?: boolean;
  effort?: YulaEffort;
  tools: string[];
  skills: string[];
  /** Frontmatter'sız gövde = persona talimatları */
  instructions: string;
}

function parseAgentFrontmatter(content: string): Record<string, unknown> {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match?.[1]) return {};
  try {
    const doc = load(match[1]) as Record<string, unknown> | null;
    if (!doc || typeof doc !== "object") return {};
    return doc;
  } catch {
    return {};
  }
}

function frontmatterStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === "string");
  }
  if (typeof value === "string" && value.trim()) {
    return value
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return [];
}

/** agent.md içeriğini ayrıştırır (yoksa varsayılanlarla boş talimat) — saf. */
export function parseAgentFile(
  content: string,
  fallbackName = "ajan",
): ParsedAgentFile {
  const fm = parseAgentFrontmatter(content);
  const bodyMatch = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  const instructions = bodyMatch
    ? content.slice(bodyMatch[0].length).trim()
    : content.trim();
  const name =
    typeof fm.name === "string" && fm.name.trim()
      ? fm.name.trim()
      : fallbackName;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const thinkingRaw = str(fm.thinking).toLowerCase();
  return {
    name,
    description: str(fm.description),
    scope: str(fm.scope) || "global",
    provider: str(fm.provider),
    model: str(fm.model),
    thinking:
      ["on", "1", "true", "açık"].includes(thinkingRaw) ||
      fm.thinking === true
        ? true
        : ["off", "0", "false", "kapalı"].includes(thinkingRaw) ||
            fm.thinking === false
          ? false
          : undefined,
    effort: normalizeEffort(fm.effort ?? ""),
    tools: frontmatterStringList(fm.tools),
    skills: frontmatterStringList(fm.skills).map((s) => s.toLowerCase()),
    instructions,
  };
}

/** Ajan form durumundan agent.md üretir (dışa aktarım/önizleme) — saf. */
export function buildUserAgentMarkdown(draft: {
  name: string;
  description: string;
  scope?: string;
  provider?: string;
  model?: string;
  thinking?: boolean;
  effort?: YulaEffort;
  tools?: string[];
  skills?: string[];
  instructions: string;
}): string {
  const name = draft.name.trim() || "ajan";
  const list = (items: string[] | undefined) =>
    !items || items.length === 0 ? "[]" : `[${items.join(", ")}]`;
  const effort = normalizeEffort(draft.effort ?? "") ?? "auto";
  return [
    "---",
    `name: ${name}`,
    `description: ${draft.description.trim()}`,
    `scope: ${draft.scope?.trim() || "global"}`,
    `provider: ${draft.provider?.trim() || ""}`,
    `model: ${draft.model?.trim() || ""}`,
    `thinking: ${draft.thinking === undefined ? "auto" : draft.thinking ? "on" : "off"}`,
    `effort: ${effort}`,
    `tools: ${list(draft.tools)}`,
    `skills: ${list(draft.skills)}`,
    "---",
    "",
    draft.instructions.trim(),
    "",
  ].join("\n");
}
