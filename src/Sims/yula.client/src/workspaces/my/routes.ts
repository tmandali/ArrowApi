import { Settings2, Sparkles, Bot, Blocks, Brain, BookOpen } from "lucide-react";
import type { WorkspaceNavItem } from "@/types";

export const myDashboardPath = "/my/settings";

/**
 * `my` workspace navigasyonu — KİŞİSEL çalışma alanı.
 *
 * Workspace OTURUM ZORUNLUDUR: `my/*` sayfaları `RequireSession` kapısıyla
 * korunur; hiç giriş yapmamış kullanıcı `/sign-in`'e yönlendirilir
 * (bkz. `app/my/settings/page.tsx`).
 */
export const myNav: WorkspaceNavItem[] = [
  {
    title: "Hesabım & Ayarlarım",
    url: "/my/settings",
    icon: Settings2,
  },
  {
    title: "Beceriler & Komutlar",
    url: "/my/skills",
    icon: Sparkles,
  },
  {
    title: "Personalar & Ajanlar",
    url: "/my/agents",
    icon: Bot,
  },
  {
    title: "Kurumsal Eklentiler",
    url: "/my/plugins",
    icon: Blocks,
  },
  {
    title: "Kalıcı Bellek & Tercihler",
    url: "/my/memory",
    icon: Brain,
  },
  {
    title: "Playbook & Prosedürel Hafıza",
    url: "/my/playbooks",
    icon: BookOpen,
  },
];
