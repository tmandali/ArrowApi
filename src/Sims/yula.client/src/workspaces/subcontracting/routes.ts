import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BarChart2Icon,
  FileCheckIcon,
  LayoutDashboardIcon,
  Settings2Icon,
  WrenchIcon,
} from "lucide-react";
import type { WorkspaceNavItem } from "@/types";
import { emptyModulePath } from "@/lib/workspace-paths";

const e = emptyModulePath;

export const subcontractingDashboardPath = "/subcontracting/dashboard";

export const subcontractingNav: WorkspaceNavItem[] = [
  {
    title: "Dashboard",
    url: subcontractingDashboardPath,
    icon: LayoutDashboardIcon,
  },
  {
    title: "Inward Subcontracting",
    url: e("subcontracting", "Inward Subcontracting"),
    icon: ArrowRightIcon,
    isActive: true,
    items: [
      {
        title: "Subcontracting Order",
        url: e("subcontracting", "Inward Subcontracting Order"),
      },
      {
        title: "Subcontracting Delivery",
        url: e("subcontracting", "Subcontracting Delivery"),
      },
    ],
  },
  {
    title: "Outward Subcontracting",
    url: e("subcontracting", "Outward Subcontracting"),
    icon: ArrowLeftIcon,
    items: [
      {
        title: "Purchase Order",
        url: e("subcontracting", "Purchase Order"),
      },
      {
        title: "Subcontracting Receipt",
        url: e("subcontracting", "Subcontracting Receipt"),
      },
      {
        title: "Subcontracting Raw Materials",
        url: e("subcontracting", "Subcontracting Raw Materials"),
      },
    ],
  },
  {
    title: "Operations & Quality",
    url: e("subcontracting", "Operations"),
    icon: FileCheckIcon,
    items: [
      {
        title: "Inspection",
        url: e("subcontracting", "Inspection"),
      },
      {
        title: "Job Work Register",
        url: e("subcontracting", "Job Work Register"),
      },
    ],
  },
  {
    title: "Tools",
    url: e("subcontracting", "Tools"),
    icon: WrenchIcon,
    items: [],
  },
  {
    title: "Reports",
    url: e("subcontracting", "Reports"),
    icon: BarChart2Icon,
    items: [
      {
        title: "Subcontracting Order Summary",
        url: e("subcontracting", "Subcontracting Order Summary"),
      },
    ],
  },
  {
    title: "Settings",
    url: e("subcontracting", "Settings"),
    icon: Settings2Icon,
    items: [],
  },
];
