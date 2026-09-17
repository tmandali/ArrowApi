import {
  UserCheckIcon,
  BotIcon,
  SparklesIcon,
} from "lucide-react";
import type { WorkspaceNavItem } from "@/types";

export const systemDashboardPath = "/";

export const systemNav: WorkspaceNavItem[] = [
  {
    title: "Tüm Kullanıcılar",
    url: "/system/users",
    icon: UserCheckIcon,
    adminOnly: true,
  },
  {
    title: "Ajan Ayarları",
    url: "/system/agents",
    icon: BotIcon,
    adminOnly: true,
  },
  {
    title: "Skill Ayarları",
    url: "/system/skills",
    icon: SparklesIcon,
    adminOnly: true,
  },
];
