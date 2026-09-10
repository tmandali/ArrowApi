import {
  HomeIcon,
  Settings2Icon,
  UserCheckIcon,
  BotIcon,
  SparklesIcon,
} from "lucide-react";
import type { WorkspaceNavItem } from "@/types";

export const systemDashboardPath = "/";

export const systemNav: WorkspaceNavItem[] = [
  {
    title: "Ana Ekran & Yula AI",
    url: "/",
    icon: HomeIcon,
  },
  {
    title: "Hesabım & Ayarlarım",
    url: "/my/settings",
    icon: Settings2Icon,
  },
  {
    title: "Tüm Kullanıcılar (Admin)",
    url: "/system/users",
    icon: UserCheckIcon,
  },
  {
    title: "Ajan Ayarları",
    url: "/system/agents",
    icon: BotIcon,
  },
  {
    title: "Skill Ayarları",
    url: "/system/skills",
    icon: SparklesIcon,
  },
];
