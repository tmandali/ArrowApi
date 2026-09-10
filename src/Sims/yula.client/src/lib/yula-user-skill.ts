/**
 * Kullanıcı skill çekirdek tipleri + saf yardımcılar (test edilebilir).
 * Persist/store tarafı `lib/stores/user-skills.ts` içindedir.
 * Yerleşik skill gövdeleri `lib/built-in-skills.ts` içindedir (bundler-only).
 */
export interface UserSkill {
  id: string;
  /** Slash tetikleyici (önsiz, örn: "haftalik-ozet") */
  slash: string;
  label: string;
  description: string;
  /**
   * Gönderilecek prompt şablonu. `{{input}}` varsa kullanıcının ek metni
   * oraya yerleşir; yoksa ek metin sona eklenir.
   */
  prompt: string;
  createdAt: number;
  updatedAt: number;
  /**
   * Kapsam: "global" (her yerde) veya workspace id ("stock", "selling"…).
   * Eski kayıtlarda tanımsız → global sayılır.
   */
  scope?: string;
  /**
   * Kullanıcı ekli referans dosyaları (salt-okunur dokümanlar).
   * Betik (.mjs) KABUL EDİLMEZ — kullanıcı kodu çalıştırılmaz (güvenlik);
   * betikler yerleşik skill'lere özeldir. İçerik localStorage'da saklanır.
   */
  files?: UserSkillFile[];
}

/** Kullanıcı ekli referans dosya (salt metin). */
export interface UserSkillFile {
  name: string;
  content: string;
}

/** Referans dosya uzantı allowlist'i */
export const USER_SKILL_FILE_EXTENSIONS = [".md", ".markdown", ".txt", ".json"] as const;
/** Tek dosya üst sınırı */
export const USER_SKILL_FILE_MAX_CHARS = 32_000;
/** Skill başına toplam üst sınır */
export const USER_SKILL_FILES_TOTAL_MAX_CHARS = 200_000;

/** Dosya validasyonu — saf. */
export function validateUserSkillFile(
  file: { name: string; content: string },
  existingNames: string[],
): string | null {
  const name = file.name.trim();
  if (!name) return "Dosya adı boş olamaz.";
  if (name.length > 120) return "Dosya adı 120 karakteri geçemez.";
  if (/[/\\]/.test(name)) return "Dosya adı klasör içeremez.";
  const lower = name.toLowerCase();
  const okExt = USER_SKILL_FILE_EXTENSIONS.some((e) => lower.endsWith(e));
  if (!okExt)
    return `Yalnızca ${USER_SKILL_FILE_EXTENSIONS.join(", ")} okunur.`;
  if (existingNames.map((n) => n.toLowerCase()).includes(lower))
    return `"${name}" zaten ekli — başka ad seçin.`;
  if (!file.content.trim()) return `"${name}" boş dosya.`;
  if (file.content.length > USER_SKILL_FILE_MAX_CHARS)
    return `"${name}" 32K karakteri geçemez (${(file.content.length / 1024).toFixed(1)}K).`;
  return null;
}

/** Toplam boyut kontrolü — saf. */
export function userSkillFilesSize(files: UserSkillFile[]): number {
  return files.reduce((acc, f) => acc + f.content.length, 0);
}

/** Form durumundan SKILL.md önizlemesi üretir (kaydedilmez) — saf. */
export function buildUserSkillMarkdown(draft: {
  slash: string;
  label: string;
  description: string;
  scope?: string;
  prompt: string;
}): string {
  const slash = draft.slash.trim().toLowerCase() || "yeni-skill";
  const scope = draft.scope?.trim() || "global";
  return [
    "---",
    `name: ${slash}`,
    `slash: ${slash}`,
    `label: ${draft.label.trim() || slash}`,
    `description: ${draft.description.trim()}`,
    `scope: ${scope}`,
    "---",
    "",
    draft.prompt.trim(),
    "",
  ].join("\n");
}

/** Dosya uzantısına göre shiki dili (CodeBlock renklendirmesi için) — saf. */
export function languageForPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "md":
    case "markdown":
      return "markdown";
    case "mjs":
    case "js":
    case "cjs":
      return "javascript";
    case "ts":
      return "typescript";
    case "json":
      return "json";
    case "sql":
      return "sql";
    case "sh":
      return "bash";
    default:
      return "plaintext";
  }
}

/** Önizleme dili: markdown dosyaları formatlı basılır, gerisi kod bloğudur — saf. */
export function isMarkdownPath(path: string): boolean {
  const ext = path.split(".").pop()?.toLowerCase();
  return ext === "md" || ext === "markdown";
}

/** Palet/envanter için kapsam filtresi — saf. */
export function filterSkillsByScope(
  skills: UserSkill[],
  workspaceId?: string | null,
): UserSkill[] {
  return skills.filter((s) => {
    const scope = s.scope ?? "global";
    if (scope === "global") return true;
    return !!workspaceId && scope === workspaceId;
  });
}

/** Mağaza + yerleşik birleşimi, kapsama göre filtreli — saf. */
export function getEffectiveUserSkills(
  storeSkills: UserSkill[],
  builtIns: UserSkill[],
  workspaceId?: string | null,
): UserSkill[] {
  return filterSkillsByScope([...builtIns, ...storeSkills], workspaceId);
}

const SLASH_RE = /^[a-z0-9][a-z0-9-_çğıöşü]*$/i;

/** Editor validasyonu — saf. */
export function validateUserSkill(
  draft: { slash: string; label: string; prompt: string },
  takenSlashes: string[],
): string | null {
  const slash = draft.slash.trim().toLowerCase();
  if (!slash) return "Slash adı boş olamaz (örn: haftalik-ozet).";
  if (!SLASH_RE.test(slash))
    return "Slash adı harf, rakam, tire ve alt çizgi içerebilir.";
  if (takenSlashes.includes(slash))
    return `/${slash} zaten kullanımda — başka bir ad seçin.`;
  if (!draft.label.trim()) return "Başlık boş olamaz.";
  if (!draft.prompt.trim()) return "Prompt metni boş olamaz.";
  return null;
}

/** Gönderim metni: {{input}} varsa yerine koy, yoksa sona ekle — saf. */
export function buildUserSkillPrompt(
  skill: Pick<UserSkill, "prompt">,
  args: string,
): string {
  const prompt = skill.prompt.trim();
  const cleanArgs = args.trim();
  if (prompt.includes("{{input}}")) {
    return prompt
      .replaceAll("{{input}}", cleanArgs)
      .replace(/[ \t]{2,}/g, " ")
      .trim();
  }
  if (!cleanArgs) return prompt;
  return `${prompt} ${cleanArgs}`;
}
