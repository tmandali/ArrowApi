import {
  BarChart2Icon,
  BoxIcon,
  FileCheckIcon,
  HomeIcon,
  LayoutDashboardIcon,
  ReceiptIcon,
  ScaleIcon,
  SendIcon,
  TruckIcon,
} from "lucide-react";
import type { WorkspaceNavItem } from "@/types";
import { emptyModulePath } from "@/lib/workspace-paths";

const e = emptyModulePath;

export const stockDashboardPath = "/stock/dashboard";

export const stockNav: WorkspaceNavItem[] = [
  {
    title: "Dashboard",
    url: stockDashboardPath,
    icon: LayoutDashboardIcon,
  },
  {
    title: "Item",
    url: "/stock/item",
    icon: BoxIcon,
  },
  {
    title: "Warehouse",
    url: e("stock", "Warehouse"),
    icon: HomeIcon,
  },
  {
    title: "Stock Entry",
    url: e("stock", "Stock Entry"),
    icon: FileCheckIcon,
  },
  {
    title: "Purchase Receipt",
    url: e("stock", "Purchase Receipt"),
    icon: ReceiptIcon,
  },
  {
    title: "Delivery Note",
    url: e("stock", "Delivery Note"),
    icon: TruckIcon,
  },
  {
    title: "Stock Reconciliation",
    url: e("stock", "Stock Reconciliation"),
    icon: ScaleIcon,
  },
  {
    title: "Landed Cost Voucher",
    url: "/landed-cost-voucher",
    icon: ReceiptIcon,
  },
  {
    title: "Material Request",
    url: e("stock", "Material Request"),
    icon: SendIcon,
  },
  {
    title: "Reports",
    url: e("stock", "Reports"),
    icon: BarChart2Icon,
    isActive: true,
    items: [
      { title: "Stock Analytics", url: "/stock/stock-analytics" },
      { title: "Stock Balance", url: "/stock/stock-balance" },
      { title: "Retail Sales", url: "/stock/retail-sales-report" },
      { title: "Stock Ledger", url: "/stock/stock-ledger" },
      {
        title: "Serial No and Batch Traceability",
        url: "/stock/serial-batch-traceability",
      },
      {
        title: "Purchase Receipt Trends",
        url: e("stock", "Purchase Receipt Trends"),
      },
      {
        title: "Delivery Note Trends",
        url: e("stock", "Delivery Note Trends"),
      },
    ],
  },
];
