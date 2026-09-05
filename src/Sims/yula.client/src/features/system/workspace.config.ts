import { HomeIcon } from "lucide-react";
import type { WorkspaceDefinition } from "@/types";
import { systemNav, systemDashboardPath } from "./routes";

export const systemWorkspace: WorkspaceDefinition = {
  id: "system",
  name: "System",
  title: "Sistem & Ana Ekran",
  icon: HomeIcon,
  rootPath: "/",
  dashboardPath: systemDashboardPath,
  navigation: systemNav,
};
