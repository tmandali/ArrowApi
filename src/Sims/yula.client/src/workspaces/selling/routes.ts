import {
  BarChart2Icon,
  FileCheckIcon,
  FileTextIcon,
  LayoutDashboardIcon,
  ReceiptIcon,
  Settings2Icon,
  ShoppingCartIcon,
  UsersIcon,
} from "lucide-react";
import type { WorkspaceNavItem } from "@/types";
import { emptyModulePath } from "@/lib/workspace-paths";

const e = emptyModulePath;

export const sellingDashboardPath = "/selling/dashboard";

export const sellingNav: WorkspaceNavItem[] = [
  {
    title: "Dashboard",
    url: sellingDashboardPath,
    icon: LayoutDashboardIcon,
  },
  {
    title: "Sales Order",
    url: "/selling/sales-order",
    icon: ShoppingCartIcon,
  },
  {
    title: "Quotations",
    url: e("selling", "Quotations"),
    icon: FileTextIcon,
  },
  {
    title: "Customers",
    url: e("selling", "Customers"),
    icon: UsersIcon,
  },
  {
    title: "Sales Invoice",
    url: e("selling", "Sales Invoice"),
    icon: ReceiptIcon,
  },
  {
    title: "Delivery Note",
    url: e("selling", "Delivery Note"),
    icon: FileCheckIcon,
  },
  {
    title: "Reports",
    url: e("selling", "Reports"),
    icon: BarChart2Icon,
    isActive: true,
    items: [
      { title: "Sales Analytics", url: e("selling", "Sales Analytics") },
      { title: "Sales Funnel", url: e("selling", "Sales Funnel") },
      { title: "Customer Ledger Summary", url: e("selling", "Customer Ledger Summary") },
    ],
  },
  {
    title: "Settings",
    url: e("selling", "Settings"),
    icon: Settings2Icon,
  },
];
