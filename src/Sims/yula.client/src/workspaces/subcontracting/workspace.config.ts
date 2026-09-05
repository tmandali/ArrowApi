import { RefreshCwIcon } from "lucide-react";
import type { WorkspaceDefinition } from "@/types";
import { subcontractingNav, subcontractingDashboardPath } from "./routes";

export const subcontractingWorkspace: WorkspaceDefinition = {
  id: "subcontracting",
  name: "Subcontracting",
  title: "Fason ve Alt İşveren",
  icon: RefreshCwIcon,
  rootPath: "/subcontracting",
  dashboardPath: subcontractingDashboardPath,
  navigation: subcontractingNav,
};
