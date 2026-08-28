"use client";

import type { ComponentType } from "react"
import Link from "next/link"
import {
  BarChart2Icon,
  BoxIcon,
  ChevronRight,
  LayoutDashboardIcon,
  MoreHorizontal,
  Package,
  ReceiptIcon,
  ScaleIcon,
  SendIcon,
  Settings2Icon,
  TruckIcon,
  WrenchIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item"
import { emptyModulePath } from "@/lib/workspace-paths"
import { workspaceDashboardPath } from "@/lib/workspace-nav"
import { cn } from "@/utils/cn"

const e = emptyModulePath

type KpiTone = "primary" | "orange"

const kpiToneClassName: Record<
  KpiTone,
  { title: string; value: string }
> = {
  primary: {
    title: "text-primary dark:text-sidebar-primary",
    value: "text-primary dark:text-sidebar-primary",
  },
  orange: {
    title: "text-orange-700 dark:text-orange-400",
    value: "text-orange-700 dark:text-orange-400",
  },
}

const kpiCards = [
  {
    title: "Total Stock Value",
    value: "3.510 L",
    change: "0% since yesterday",
    trend: "flat" as const,
    tone: "primary" as const satisfies KpiTone,
  },
  {
    title: "Total Warehouses",
    value: "5",
    change: "0% since last month",
    trend: "flat" as const,
    tone: "orange" as const satisfies KpiTone,
  },
  {
    title: "Total Active Items",
    value: "37",
    change: "106% since last month",
    trend: "up" as const,
    tone: "primary" as const satisfies KpiTone,
  },
]

const badgeToneClassName = {
  success:
    "border-transparent bg-orange-500/15 text-orange-700 hover:bg-orange-500/15 dark:text-orange-400",
  warning:
    "border-transparent bg-amber-500/10 text-amber-700 hover:bg-amber-500/10 dark:text-amber-400",
  neutral: "",
} as const

type ShortcutItem = {
  title: string
  url: string
  icon: ComponentType<{ className?: string; "data-icon"?: string }>
  badge?: { label: string; tone: "success" | "warning" | "neutral" }
}

const shortcuts: ShortcutItem[] = [
  {
    title: "Item",
    url: "/stock/item",
    icon: Package,
    badge: { label: "37", tone: "success" },
  },
  {
    title: "Material Request",
    url: e("stock", "Material Request"),
    icon: SendIcon,
    badge: { label: "Draft 2", tone: "warning" },
  },
  {
    title: "Stock Entry",
    url: e("stock", "Stock Entry"),
    icon: BoxIcon,
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
    title: "Stock Ledger",
    url: "/stock/stock-ledger",
    icon: LayoutDashboardIcon,
  },
  {
    title: "Stock Balance",
    url: "/stock/stock-balance",
    icon: ScaleIcon,
  },
  {
    title: "Stock Analytics",
    url: "/stock/stock-analytics",
    icon: BarChart2Icon,
  },
]

type FeatureLink = {
  title: string
  url: string
}

type FeatureSection = {
  titleLead: string
  titleTrail: string
  visual: "catalogue" | "setup" | "reports" | "tools"
  links: FeatureLink[]
}

const featureSections: FeatureSection[] = [
  {
    titleLead: "Items",
    titleTrail: "Catalogue",
    visual: "catalogue",
    links: [
      { title: "Item", url: "/stock/item" },
      { title: "Item Group", url: e("stock", "Item Group") },
      { title: "Product Bundle", url: e("stock", "Product Bundle") },
      { title: "Item Price", url: e("stock", "Item Price") },
      { title: "Shipping Rule", url: e("stock", "Shipping Rule") },
      { title: "Pricing Rule", url: e("stock", "Pricing Rule") },
      { title: "Item Alternative", url: e("stock", "Item Alternative") },
      { title: "Item Manufacturer", url: e("stock", "Item Manufacturer") },
    ],
  },
  {
    titleLead: "Stock",
    titleTrail: "Transactions",
    visual: "catalogue",
    links: [
      { title: "Material Request", url: e("stock", "Material Request") },
      { title: "Stock Entry", url: e("stock", "Stock Entry") },
      { title: "Delivery Note", url: e("stock", "Delivery Note") },
      { title: "Purchase Receipt", url: e("stock", "Purchase Receipt") },
      { title: "Pick List", url: e("stock", "Pick List") },
      { title: "Delivery Trip", url: e("stock", "Delivery Trip") },
    ],
  },
  {
    titleLead: "Stock",
    titleTrail: "Reports",
    visual: "reports",
    links: [
      { title: "Stock Ledger", url: "/stock/stock-ledger" },
      { title: "Stock Balance", url: "/stock/stock-balance" },
      { title: "Stock Projected Qty", url: e("stock", "Stock Projected Qty") },
      { title: "Stock Summary", url: e("stock", "Stock Summary") },
      { title: "Stock Ageing", url: e("stock", "Stock Ageing") },
      { title: "Item Price Stock", url: e("stock", "Item Price Stock") },
      {
        title: "Warehouse Wise Stock Balance",
        url: e("stock", "Warehouse Wise Stock Balance"),
      },
    ],
  },
  {
    titleLead: "Stock",
    titleTrail: "Settings",
    visual: "setup",
    links: [
      { title: "Stock Settings", url: e("stock", "Stock Settings") },
      { title: "Warehouse", url: e("stock", "Warehouse") },
      { title: "Unit of Measure", url: e("stock", "Unit of Measure") },
      {
        title: "Item Variant Settings",
        url: e("stock", "Item Variant Settings"),
      },
      { title: "Brand", url: e("stock", "Brand") },
      { title: "Item Attribute", url: e("stock", "Item Attribute") },
      {
        title: "UOM Conversion Factor",
        url: e("stock", "UOM Conversion Factor"),
      },
    ],
  },
  {
    titleLead: "Serial",
    titleTrail: "& Batch",
    visual: "setup",
    links: [
      { title: "Serial No", url: e("stock", "Serial No") },
      { title: "Batch", url: e("stock", "Batch") },
      {
        title: "Serial No and Batch Traceability",
        url: "/stock/serial-batch-traceability",
      },
      { title: "Serial No Ledger", url: e("stock", "Serial No Ledger") },
      { title: "Installation Note", url: e("stock", "Installation Note") },
      {
        title: "Serial No Service Contract Expiry",
        url: e("stock", "Serial No Service Contract Expiry"),
      },
      { title: "Serial No Status", url: e("stock", "Serial No Status") },
      {
        title: "Serial No Warranty Expiry",
        url: e("stock", "Serial No Warranty Expiry"),
      },
    ],
  },
  {
    titleLead: "Stock",
    titleTrail: "Tools",
    visual: "tools",
    links: [
      {
        title: "Stock Reconciliation",
        url: e("stock", "Stock Reconciliation"),
      },
      { title: "Landed Cost Voucher", url: "/landed-cost-voucher" },
      { title: "Packing Slip", url: e("stock", "Packing Slip") },
      {
        title: "Quality Inspection",
        url: e("stock", "Quality Inspection"),
      },
      {
        title: "Quality Inspection Template",
        url: e("stock", "Quality Inspection Template"),
      },
      {
        title: "Quick Stock Balance",
        url: e("stock", "Quick Stock Balance"),
      },
    ],
  },
  {
    titleLead: "Key",
    titleTrail: "Reports",
    visual: "reports",
    links: [
      { title: "Stock Analytics", url: "/stock/stock-analytics" },
      {
        title: "Delivery Note Trends",
        url: e("stock", "Delivery Note Trends"),
      },
      {
        title: "Purchase Receipt Trends",
        url: e("stock", "Purchase Receipt Trends"),
      },
      {
        title: "Sales Order Analysis",
        url: e("stock", "Sales Order Analysis"),
      },
      {
        title: "Purchase Order Analysis",
        url: e("stock", "Purchase Order Analysis"),
      },
      {
        title: "Item Shortage Report",
        url: e("stock", "Item Shortage Report"),
      },
      {
        title: "Batch-Wise Balance History",
        url: e("stock", "Batch-Wise Balance History"),
      },
    ],
  },
  {
    titleLead: "Other",
    titleTrail: "Reports",
    visual: "reports",
    links: [
      {
        title: "Requested Items To Be Transferred",
        url: e("stock", "Requested Items To Be Transferred"),
      },
      {
        title: "Requested Items To Order and Receive",
        url: e("stock", "Requested Items To Order and Receive"),
      },
      {
        title: "Batch Item Expiry Status",
        url: e("stock", "Batch Item Expiry Status"),
      },
      { title: "Item Prices", url: e("stock", "Item Prices") },
      {
        title: "Itemwise Recommended Reorder Level",
        url: e("stock", "Itemwise Recommended Reorder Level"),
      },
      {
        title: "Item Variant Details",
        url: e("stock", "Item Variant Details"),
      },
      {
        title: "Subcontracted Raw Materials To Be Transferred",
        url: e("stock", "Subcontracted Raw Materials To Be Transferred"),
      },
      {
        title: "Subcontracted Item To Be Received",
        url: e("stock", "Subcontracted Item To Be Received"),
      },
      { title: "BOM Stock Report", url: e("stock", "BOM Stock Report") },
      {
        title: "Stock Entry Details",
        url: e("stock", "Stock Entry Details"),
      },
      {
        title: "Purchase / Selling Price History",
        url: e("stock", "Purchase Selling Price History"),
      },
      { title: "Item Availability", url: e("stock", "Item Availability") },
      {
        title: "Product Bundle Details",
        url: e("stock", "Product Bundle Details"),
      },
      {
        title: "Stock and Account Value Comparison",
        url: e("stock", "Stock and Account Value Comparison"),
      },
      {
        title: "Warehouse Wise Item Balance",
        url: e("stock", "Warehouse Wise Item Balance"),
      },
      {
        title: "Total Stock Summary",
        url: e("stock", "Total Stock Summary"),
      },
      {
        title: "Stock Qty vs Serial No Count",
        url: e("stock", "Stock Qty vs Serial No Count"),
      },
    ],
  },
]

function CardMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="More options">
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuItem>Refresh</DropdownMenuItem>
          <DropdownMenuItem>Edit</DropdownMenuItem>
          <DropdownMenuItem>Delete</DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function FeatureVisual({ kind }: { kind: FeatureSection["visual"] }) {
  switch (kind) {
    case "catalogue":
      return <Package className="size-3.5 shrink-0 text-primary" />
    case "setup":
      return <Settings2Icon className="size-3.5 shrink-0 text-orange-600" />
    case "tools":
      return <WrenchIcon className="size-3.5 shrink-0 text-primary" />
    case "reports":
      return <BarChart2Icon className="size-3.5 shrink-0 text-orange-600" />
    default: {
      const _exhaustive: never = kind
      return _exhaustive
    }
  }
}

function FeaturePanel({ section }: { section: FeatureSection }) {
  return (
    <Card size="sm" className="gap-0 py-0">
      <CardHeader className="flex h-8 flex-row items-center gap-1.5 px-2.5 py-0">
        <FeatureVisual kind={section.visual} />
        <CardTitle className="text-xs font-medium tracking-tight">
          <span className="text-primary dark:text-sidebar-primary">
            {section.titleLead}
          </span>{" "}
          <span className="text-orange-600 dark:text-orange-400">
            {section.titleTrail}
          </span>
        </CardTitle>
      </CardHeader>

      <CardContent className="p-1">
        <ItemGroup className="gap-0" data-size="xs">
          {section.links.map((link) => (
            <Item
              key={link.title}
              size="xs"
              className="gap-1 rounded-sm px-1.5 py-0.5"
              asChild
            >
              <Link href={link.url}>
                <ItemContent className="gap-0">
                  <ItemTitle className="text-[0.6875rem] font-normal">
                    {link.title}
                  </ItemTitle>
                </ItemContent>
                <ItemActions>
                  <ChevronRight className="size-3 text-muted-foreground" />
                </ItemActions>
              </Link>
            </Item>
          ))}
        </ItemGroup>
      </CardContent>
    </Card>
  )
}

export function StockDashboard() {
  return (
    <div className="flex flex-1 flex-col gap-3 p-3">
      <div className="grid gap-2 md:grid-cols-3">
        {kpiCards.map((kpi) => {
          const tone = kpiToneClassName[kpi.tone]
          return (
            <Card key={kpi.title} size="sm">
              <CardHeader className="gap-0.5">
                <CardDescription
                  className={cn(
                    "text-[0.625rem] uppercase tracking-wide",
                    tone.title
                  )}
                >
                  {kpi.title}
                </CardDescription>
                <CardAction>
                  <CardMenu />
                </CardAction>
                <CardTitle
                  className={cn(
                    "text-lg font-semibold tracking-tight",
                    tone.value
                  )}
                >
                  {kpi.value}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {kpi.trend === "up" ? (
                  <Badge
                    variant="secondary"
                    className={badgeToneClassName.success}
                  >
                    ↑ {kpi.change}
                  </Badge>
                ) : (
                  <p className="text-[0.625rem] text-muted-foreground">
                    {kpi.change}
                  </p>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {shortcuts.map((item) => {
          const Icon = item.icon
          return (
            <Button
              key={item.title}
              variant="outline"
              size="sm"
              className="h-8 justify-between gap-2 px-2.5"
              asChild
            >
              <Link href={item.url}>
                <span className="flex min-w-0 flex-1 items-center gap-1.5">
                  <Icon data-icon="inline-start" />
                  <span className="truncate">{item.title}</span>
                  {item.badge ? (
                    <Badge
                      variant="secondary"
                      className={badgeToneClassName[item.badge.tone]}
                    >
                      {item.badge.label}
                    </Badge>
                  ) : null}
                </span>
                <ChevronRight data-icon="inline-end" />
              </Link>
            </Button>
          )
        })}
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {featureSections.map((section) => (
          <FeaturePanel
            key={`${section.titleLead}-${section.titleTrail}`}
            section={section}
          />
        ))}
      </div>
    </div>
  )
}
