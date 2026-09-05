import { FactoryIcon } from "lucide-react";
import type { WorkspaceDefinition } from "@/types";
import { manufacturingNav, manufacturingDashboardPath } from "./routes";

export const manufacturingWorkspace: WorkspaceDefinition = {
  id: "manufacturing",
  name: "Manufacturing",
  title: "Üretim ve İmalat",
  icon: FactoryIcon,
  rootPath: "/manufacturing",
  dashboardPath: manufacturingDashboardPath,
  navigation: manufacturingNav,
};
