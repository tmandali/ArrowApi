import {
  BarChart2Icon,
  BookOpenIcon,
  FileSpreadsheetIcon,
  LayoutDashboardIcon,
  TrendingUpIcon,
} from "lucide-react";
import type { WorkspaceNavItem } from "@/types";
import { emptyModulePath } from "@/lib/workspace-paths";

const e = emptyModulePath;

export const accountingDashboardPath = "/accounting/dashboard";

export const accountingNav: WorkspaceNavItem[] = [
  {
    title: "Dashboard",
    url: accountingDashboardPath,
    icon: LayoutDashboardIcon,
  },
  {
    title: "Financial Reports",
    url: e("accounting", "Financial Reports"),
    icon: BarChart2Icon,
    isActive: true,
    items: [
      { title: "Balance Sheet", url: e("accounting", "Balance Sheet") },
      { title: "Profit and Loss", url: e("accounting", "Profit and Loss") },
      { title: "Cash Flow", url: e("accounting", "Cash Flow") },
      { title: "Trial Balance", url: e("accounting", "Trial Balance") },
      { title: "Consolidated Report", url: "/accounting" },
    ],
  },
  {
    title: "Ledgers",
    url: e("accounting", "Ledgers"),
    icon: BookOpenIcon,
    isActive: true,
    items: [
      { title: "General Ledger", url: e("accounting", "General Ledger") },
      { title: "Customer Ledger", url: e("accounting", "Customer Ledger") },
      { title: "Supplier Ledger", url: e("accounting", "Supplier Ledger") },
    ],
  },
  {
    title: "Profitability",
    url: e("accounting", "Profitability"),
    icon: TrendingUpIcon,
    items: [],
  },
  {
    title: "Other Reports",
    url: e("accounting", "Other Reports"),
    icon: FileSpreadsheetIcon,
    items: [],
  },
];
