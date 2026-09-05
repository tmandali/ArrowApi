import { BarChart2Icon } from "lucide-react";
import type { WorkspaceDefinition } from "@/types";
import { accountingNav, accountingDashboardPath } from "./routes";

export const accountingWorkspace: WorkspaceDefinition = {
  id: "accounting",
  name: "Accounting",
  title: "Muhasebe ve Finans",
  icon: BarChart2Icon,
  rootPath: "/accounting",
  dashboardPath: accountingDashboardPath,
  navigation: accountingNav,
};
