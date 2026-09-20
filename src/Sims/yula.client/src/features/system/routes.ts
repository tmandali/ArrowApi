import { UserCheckIcon, ShieldCheck } from "lucide-react";
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
    title: "Kural & Akış Onayları",
    url: "/system/playbooks",
    icon: ShieldCheck,
    adminOnly: true,
  },
];
