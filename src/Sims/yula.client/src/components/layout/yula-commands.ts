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
};

export type YulaCommandYamlItem = {
  id: string;
  slash: string;
  label: string;
  description: string;
  prompt: string;
  icon: string;
  phase?: "system" | "grid" | "report";
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
 * Ekran evresine ve çalışma alanına (pathname) göre komut listesi:
 * - isViewingResults = true  (GUID URL / DuckDB Sonuç Ekranı) → Veri Analiz Komutları (/analiz, /top5, /kolonlar, /temizle)
 * - pathname === "/" (Ana Sayfa) → Yalnızca Sistem Komutları (/yeni, /dosya)
 * - Diğer Workspace Yolları (/stock vb.) → Workspace Ajan Komutları (/stok-bakiye, /stok-analiz, /anomali)
 */
export function getAllYulaCommands(
  isViewingResults = false,
  _pathname = "/"
): YulaCommand[] {
  if (isViewingResults) {
    return [...SYSTEM_COMMANDS, ...GRID_COMMANDS];
  }
  return [...SYSTEM_COMMANDS, ...REPORT_COMMANDS];
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
