import type { LucideIcon } from "lucide-react"
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BarChart2Icon,
  BookOpenIcon,
  BoxIcon,
  FileCheckIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  HomeIcon,
  LayoutDashboardIcon,
  ReceiptIcon,
  ScaleIcon,
  SendIcon,
  Settings2Icon,
  TrendingUpIcon,
  TruckIcon,
  UserCheckIcon,
  WrenchIcon,
} from "lucide-react"
import { emptyModulePath } from "@/lib/empty-module"

const e = emptyModulePath

export type WorkspaceNavSubItem = {
  title: string
  url: string
  icon?: LucideIcon
}

export type WorkspaceNavItem = {
  title: string
  url: string
  icon: LucideIcon
  isActive?: boolean
  items?: WorkspaceNavSubItem[]
}

export type WorkspaceId = "selling" | "accounting" | "stock" | "manufacturing"

export const subcontractingNav: WorkspaceNavItem[] = [
  {
    title: "Inward Order",
    url: e("selling", "Inward Order"),
    icon: ArrowRightIcon,
    isActive: true,
    items: [
      { title: "Sales Order", url: "/" },
      {
        title: "Subcontracting Order",
        url: e("selling", "Inward Subcontracting Order"),
      },
      {
        title: "Subcontracting Delivery",
        url: e("selling", "Subcontracting Delivery"),
      },
    ],
  },
  {
    title: "Outward Order",
    url: e("selling", "Outward Order"),
    icon: ArrowLeftIcon,
    items: [
      { title: "Purchase Order", url: e("selling", "Purchase Order") },
      {
        title: "Subcontracting Order",
        url: e("selling", "Outward Subcontracting Order"),
      },
      {
        title: "Subcontracting Receipt",
        url: e("selling", "Subcontracting Receipt"),
      },
    ],
  },
  {
    title: "Tools",
    url: e("selling", "Tools"),
    icon: WrenchIcon,
    items: [],
  },
  {
    title: "Reports",
    url: e("selling", "Reports"),
    icon: BarChart2Icon,
    items: [],
  },
  {
    title: "Settings",
    url: e("selling", "Settings"),
    icon: Settings2Icon,
    items: [],
  },
]

export const financialReportsNav: WorkspaceNavItem[] = [
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
]

export const stockNav: WorkspaceNavItem[] = [
  {
    title: "Dashboard",
    url: "/stock",
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
      { title: "Stock Ledger", url: "/stock/stock-ledger" },
      { title: "Stock Balance", url: e("stock", "Stock Balance") },
      { title: "Stock Analytics", url: "/stock/stock-analytics" },
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
]

export const manufacturingNav: WorkspaceNavItem[] = [
  {
    title: "Dashboard",
    url: e("manufacturing", "Dashboard"),
    icon: LayoutDashboardIcon,
  },
  {
    title: "Item",
    url: "/stock/item",
    icon: BoxIcon,
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
]

export const workspaceNavById: Record<WorkspaceId, WorkspaceNavItem[]> = {
  selling: subcontractingNav,
  accounting: financialReportsNav,
  stock: stockNav,
  manufacturing: manufacturingNav,
}

export function getWorkspaceNavForPath(pathname: string): WorkspaceNavItem[] {
  if (pathname === "/accounting" || pathname.startsWith("/accounting/")) {
    return financialReportsNav
  }
  if (
    pathname === "/stock" ||
    pathname.startsWith("/stock/") ||
    pathname === "/landed-cost-voucher"
  ) {
    return stockNav
  }
  if (
    pathname === "/manufacturing" ||
    pathname.startsWith("/manufacturing/")
  ) {
    return manufacturingNav
  }
  return subcontractingNav
}
