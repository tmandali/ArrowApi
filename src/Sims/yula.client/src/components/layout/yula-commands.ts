import { load } from "js-yaml";
import {
  SquarePen,
  Paperclip,
  FileText,
  BarChart2,
  Database,
  RotateCcw,
  Package,
  ShieldAlert,
  HelpCircle,
  type LucideIcon,
} from "lucide-react";
import systemCommandsYaml from "@/features/system/agents/system.agent.yaml";
import gridCommandsYaml from "@/features/reports/agents/grid.agent.yaml";
import reportCommandsYaml from "@/features/stock/agents/report.agent.yaml";

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
  Paperclip,
  FileText,
  BarChart2,
  Database,
  RotateCcw,
  Package,
  ShieldAlert,
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
    }));
  } catch (error) {
    console.error("YAML Command Parse Error:", error);
    return [];
  }
}

/** Sistem Evresi Komutları (src/features/system/agents/system.agent.yaml) */
export const SYSTEM_COMMANDS: YulaCommand[] = parseYamlCommands(systemCommandsYaml);

/** Sonuç Evresi Komutları (src/features/reports/agents/grid.agent.yaml) */
export const GRID_COMMANDS: YulaCommand[] = parseYamlCommands(gridCommandsYaml);

/** Kriter Evresi Komutları (src/features/stock/agents/report.agent.yaml) */
export const REPORT_COMMANDS: YulaCommand[] = parseYamlCommands(reportCommandsYaml);

/**
 * Slash paleti yalnızca eylem komutlarıdır (rapor adı değil).
 * - Sonuç (GUID / grid) → /analiz, /top5, /sorgu, /kolonlar, /temizle
 * - Kriter / workspace → /run-job ve sistem komutları
 */
export function getAllYulaCommands(
  isViewingResults = false,
  pathname = "/",
): YulaCommand[] {
  if (isViewingResults) {
    return [...SYSTEM_COMMANDS, ...GRID_COMMANDS];
  }
  const path = pathname.split("?")[0] || "/";
  const reportCommands = REPORT_COMMANDS.filter((cmd) => {
    if (!cmd.pagePath) return true;
    return path !== cmd.pagePath && !path.startsWith(`${cmd.pagePath}/`);
  });
  return [...SYSTEM_COMMANDS, ...reportCommands];
}

/** Manifestteki tüm slash komutları (evre karışık; tam eşleşme için). */
export function getRegisteredYulaCommands(): YulaCommand[] {
  const seen = new Set<string>();
  const out: YulaCommand[] = [];
  for (const cmd of [...SYSTEM_COMMANDS, ...GRID_COMMANDS, ...REPORT_COMMANDS]) {
    const key = cmd.slash.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cmd);
  }
  return out;
}

/** `/analiz foo` → kayıtlı komut; `/4` veya bilinmeyen slash → null. */
export function resolveYulaSlashCommand(
  input: string,
  commands: YulaCommand[] = getRegisteredYulaCommands(),
): YulaCommand | null {
  if (!input.startsWith("/")) return null;
  const token = input.slice(1).trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  if (!token) return null;
  return commands.find((c) => c.slash.toLowerCase() === token) ?? null;
}

export function isYulaGridSlashPrompt(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (resolveYulaSlashCommand(trimmed, GRID_COMMANDS)) return true;
  const lower = trimmed.toLowerCase();
  return GRID_COMMANDS.some((cmd) => cmd.prompt.trim().toLowerCase() === lower);
}

export function matchYulaCommands(
  input: string,
  allCommands: YulaCommand[] = getAllYulaCommands(),
): YulaCommand[] | null {
  if (!input.startsWith("/")) return null;
  const query = input.slice(1).trim().toLowerCase();
  if (!query) return allCommands;
  return allCommands.filter(
    (command) =>
      command.slash.toLowerCase().includes(query) ||
      command.label.toLowerCase().includes(query) ||
      command.description.toLowerCase().includes(query),
  );
}
