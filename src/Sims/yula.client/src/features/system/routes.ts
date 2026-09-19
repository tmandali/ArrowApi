import { UserCheckIcon } from "lucide-react";
import type { WorkspaceNavItem } from "@/types";

export const systemDashboardPath = "/";

export const systemNav: WorkspaceNavItem[] = [
  {
    title: "Tüm Kullanıcılar",
    url: "/system/users",
    icon: UserCheckIcon,
    adminOnly: true,
  },
];
