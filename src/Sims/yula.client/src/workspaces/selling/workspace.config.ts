import { ShoppingCartIcon } from "lucide-react";
import type { WorkspaceDefinition } from "@/types";
import { sellingNav, sellingDashboardPath } from "./routes";

export const sellingWorkspace: WorkspaceDefinition = {
  id: "selling",
  name: "Selling",
  title: "Satış Yönetimi",
  icon: ShoppingCartIcon,
  rootPath: "/selling",
  dashboardPath: sellingDashboardPath,
  navigation: sellingNav,
};
