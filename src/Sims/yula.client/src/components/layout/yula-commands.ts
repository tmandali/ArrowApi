import {
  SquarePen,
  Paperclip,
  FileText,
  BarChart2,
  Database,
  RotateCcw,
  Package,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";
import { REGISTERED_REPORTS as DEMO_REPORTS } from "@/features/reports/report-registry";

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

export const SYSTEM_COMMANDS: YulaCommand[] = [
  {
    id: "new",
    slash: "yeni",
    label: "Yeni sohbet",
    description: "Mevcut konuşmayı ve sohbet geçmişini sıfırla",
    prompt: "/new",
    icon: SquarePen,
  },
  {
    id: "attach",
    slash: "dosya",
    label: "Dosya ekle",
    description: "Sohbete belge veya dosya ekle",
    prompt: "/dosya",
    icon: Paperclip,
  },
];

export function getAllYulaCommands(hasGrid = false): YulaCommand[] {
  const commands: YulaCommand[] = [...SYSTEM_COMMANDS];

  if (hasGrid) {
    // Grid (Tablo) evresi komutları — çakışan /sql ve /anomali birleştirildi
    commands.push(
      {
        id: "grid-analiz",
        slash: "analiz",
        label: "Tablo Analizi & Anomali",
        description: "Tablo profili çıkar, anomali/riskleri tespit et ve önerileri paylaş",
        prompt:
          "Tabloyu derinlemesine analiz et: profili çıkar, anomali ve risk taşıyan kayıtları tespit et, önerilerini ve doğrulama sorgularını paylaş.",
        icon: Database,
      },
      {
        id: "grid-top5",
        slash: "top5",
        label: "En Yüksek 5 Grafik",
        description: "En yüksek ilk 5 kaydı grafikle özetle",
        prompt: "En yüksek ilk 5 kaydı grafikle özetle",
        icon: BarChart2,
      },
      {
        id: "grid-kolonlar",
        slash: "kolonlar",
        label: "Kolon Açıklamaları",
        description: "Bu raporun kolonlarını ve şema detaylarını açıkla",
        prompt: "Bu raporun kolonlarını ve şema detaylarını açıkla",
        icon: FileText,
      },
      {
        id: "grid-temizle",
        slash: "temizle",
        label: "Filtreleri Sıfırla",
        description: "Aktif filtreleri temizle ve tabloyu sıfırla",
        prompt: "Aktif filtreleri temizle ve tabloyu sıfırla",
        icon: RotateCcw,
      },
    );
  } else {
    // Workspace evresi komutları — rapora bağımsız dinamik komutlar
    DEMO_REPORTS.forEach((r) => {
      commands.push({
        id: `report-${r.scope}`,
        slash: r.scope,
        label: r.title,
        description: `${r.workspace ? `[${r.workspace.toUpperCase()}] ` : ""}${r.title} hazırlama komutu`,
        prompt: `${r.title} hazırla`,
        icon: Package,
      });
    });

    commands.push({
      id: "workspace-anomali",
      slash: "anomali",
      label: "Anomali & Risk Analizi",
      description: "Aktif raporda anomali ve risk analizi başlat",
      prompt:
        "Aktif raporda anomali ve risk taşıyan kritik kayıtlar var mı? Önce raporu çalıştır.",
      icon: ShieldAlert,
    });
  }

  return commands;
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
