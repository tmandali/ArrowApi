import type { LucideIcon } from "lucide-react";

export type WorkspaceId =
  | "system"
  | "stock"
  | "accounting"
  | "selling"
  | "manufacturing"
  | "subcontracting";

export interface WorkspaceNavSubItem {
  title: string;
  url: string;
  icon?: LucideIcon;
  label?: string;
}

export interface WorkspaceNavItem {
  title: string;
  url: string;
  icon: LucideIcon;
  isActive?: boolean;
  items?: WorkspaceNavSubItem[];
  /**
   * Rol kapısı: yalnızca yönetici (etkin rol `System Administrator`)
   * görebilir. Non-admin kullanıcılar (Viewer/Guest) nav'de görmez,
   * doğrudan URL ile gelirse `RequireAdmin` ana ekrana yönlendirir.
   */
  adminOnly?: boolean;
}

export interface WorkspaceDefinition {
  id: WorkspaceId;
  name: string;
  title: string;
  icon: LucideIcon;
  rootPath: string;
  dashboardPath: string;
  navigation: WorkspaceNavItem[];
}
