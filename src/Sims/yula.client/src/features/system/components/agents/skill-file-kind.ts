/** Skill dosya sekmeleri tip renklendirmesi (uzantı/tür → renk). */

export type SkillFileKind = "markdown" | "script" | "json" | "text";

export function skillFileKindForName(name: string): SkillFileKind {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "mjs" || ext === "js" || ext === "cjs") return "script";
  if (ext === "json") return "json";
  if (ext === "md" || ext === "markdown") return "markdown";
  return "text";
}

export const SKILL_FILE_KIND_LABEL: Record<SkillFileKind, string> = {
  markdown: "md",
  script: "betik",
  json: "json",
  text: "metin",
};

export function skillFileDotClass(kind: SkillFileKind): string {
  switch (kind) {
    case "markdown":
      return "bg-sky-500";
    case "script":
      return "bg-emerald-500";
    case "json":
      return "bg-amber-500";
    case "text":
      return "bg-zinc-400";
  }
}

export function skillFileChipClass(kind: SkillFileKind): string {
  switch (kind) {
    case "markdown":
      return "bg-sky-500/15 text-sky-700 dark:text-sky-400";
    case "script":
      return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400";
    case "json":
      return "bg-amber-500/15 text-amber-700 dark:text-amber-400";
    case "text":
      return "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400";
  }
}
