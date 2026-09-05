import {
  BarChart2Icon,
  FileCheckIcon,
  FileTextIcon,
  HomeIcon,
  LayoutDashboardIcon,
  ReceiptIcon,
  Settings2Icon,
  UserCheckIcon,
  WrenchIcon,
} from "lucide-react";
import type { WorkspaceNavItem } from "@/types";
import { emptyModulePath } from "@/lib/workspace-paths";

const e = emptyModulePath;

export const manufacturingDashboardPath = "/manufacturing/dashboard";

export const manufacturingNav: WorkspaceNavItem[] = [
  {
    title: "Dashboard",
    url: manufacturingDashboardPath,
    icon: LayoutDashboardIcon,
  },
  {
    title: "Warehouse",
    url: e("manufacturing", "Warehouse"),
    icon: HomeIcon,
  },
  {
    title: "BOM",
    url: e("manufacturing", "BOM"),
    icon: FileTextIcon,
  },
  {
    title: "Work Order",
    url: e("manufacturing", "Work Order"),
    icon: FileCheckIcon,
  },
  {
    title: "Job Card",
    url: e("manufacturing", "Job Card"),
    icon: UserCheckIcon,
  },
  {
    title: "Stock Entry",
    url: e("manufacturing", "Stock Entry"),
    icon: ReceiptIcon,
  },
  {
    title: "Material Planning",
    url: "#",
    icon: WrenchIcon,
    isActive: true,
    items: [
      {
        title: "Production Plan",
        url: e("manufacturing", "Production Plan"),
      },
      { title: "Forecasting", url: e("manufacturing", "Forecasting") },
      {
        title: "Master Production Schedule",
        url: "/landed-cost-voucher",
      },
      { title: "Sales Forecast", url: e("manufacturing", "Sales Forecast") },
      {
        title: "Production Planning Report",
        url: e("manufacturing", "Production Planning Report"),
      },
    ],
  },
  {
    title: "Tools",
    url: e("manufacturing", "Tools"),
    icon: Settings2Icon,
    items: [],
  },
  {
    title: "Reports",
    url: e("manufacturing", "Reports"),
    icon: BarChart2Icon,
    items: [
      {
        title: "Production Planning Report",
        url: e("manufacturing", "Reports Production Planning"),
      },
      {
        title: "Work Order Summary",
        url: e("manufacturing", "Work Order Summary"),
      },
      {
        title: "Quality Inspection Summary",
        url: e("manufacturing", "Quality Inspection Summary"),
      },
      {
        title: "Downtime Analysis",
        url: e("manufacturing", "Downtime Analysis"),
      },
      {
        title: "Job Card Summary",
        url: e("manufacturing", "Job Card Summary"),
      },
    ],
  },
];
