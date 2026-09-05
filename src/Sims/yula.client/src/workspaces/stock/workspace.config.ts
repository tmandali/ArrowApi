import { PackageIcon } from "lucide-react";
import type { WorkspaceDefinition } from "@/types";
import { stockNav, stockDashboardPath } from "./routes";

export const stockWorkspace: WorkspaceDefinition = {
  id: "stock",
  name: "Stock",
  title: "Stok Yönetimi",
  icon: PackageIcon,
  rootPath: "/stock",
  dashboardPath: stockDashboardPath,
  navigation: stockNav,
};
