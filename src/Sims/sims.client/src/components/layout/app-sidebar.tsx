import * as React from "react"

import { WorkspaceNotificationPopover } from "@/components/layout/workspace-notification-popover"
import { WorkspaceSearchDialog } from "@/components/layout/workspace-search-dialog"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { NavMain } from "@/components/layout/nav-main"
import { NavProjects } from "@/components/layout/nav-projects"
import { NavUser } from "@/components/layout/nav-user"
import { WorkspaceSwitcher } from "@/components/layout/workspace-switcher"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar"
import { RefreshCwIcon, PieChartIcon, ArrowRightIcon, ArrowLeftIcon, BarChart2Icon, SearchIcon, BellIcon } from "lucide-react"

import { useLocation } from "react-router-dom"
import {
  PackageIcon,
  FactoryIcon,
  LayoutDashboardIcon,
  BoxIcon,
  HomeIcon,
  FileCheckIcon,
  ReceiptIcon,
  TruckIcon,
  ScaleIcon,
  SendIcon,
  FileTextIcon,
  TrendingUpIcon,
  FileSpreadsheetIcon,
  BookOpenIcon,
  WrenchIcon,
  Settings2Icon,
  UserCheckIcon,
} from "lucide-react"
import { emptyModulePath } from "@/lib/empty-module"

const e = emptyModulePath

// Sample workspace data with isolated navigation menus
const data = {
  user: {
    name: "Dipen Gala",
    email: "dipen@erpnext.com",
    avatar: "",
  },
  workspaces: [
    {
      id: "subcontracting",
      name: "Subcontracting",
      logo: <RefreshCwIcon className="size-4" />,
      plan: "LCWaikiki ERP",
      url: "/",
    },
    {
      id: "financial-reports",
      name: "Financial Reports",
      logo: <BarChart2Icon className="size-4" />,
      plan: "LCWaikiki ERP",
      url: "/accounting",
    },
    {
      id: "stock",
      name: "Stock",
      logo: <PackageIcon className="size-4" />,
      plan: "LCWaikiki ERP",
      url: "/stock",
    },
    {
      id: "manufacturing",
      name: "Manufacturing",
      logo: <FactoryIcon className="size-4" />,
      plan: "LCWaikiki ERP",
      url: "/manufacturing",
    },
  ],
}

// Navigation structure for Subcontracting Workspace (First Screenshot)
const subcontractingNav = [
  {
    title: "Inward Order",
    url: e("selling", "Inward Order"),
    icon: <ArrowRightIcon className="size-4" />,
    isActive: true,
    items: [
      {
        title: "Sales Order",
        url: "/",
      },
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
    icon: <ArrowLeftIcon className="size-4" />,
    items: [
      {
        title: "Purchase Order",
        url: e("selling", "Purchase Order"),
      },
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
    icon: <WrenchIcon className="size-4" />,
    items: [],
  },
  {
    title: "Reports",
    url: e("selling", "Reports"),
    icon: <BarChart2Icon className="size-4" />,
    items: [],
  },
  {
    title: "Settings",
    url: e("selling", "Settings"),
    icon: <Settings2Icon className="size-4" />,
    items: [],
  },
]

// Navigation structure for Financial Reports Workspace (Second Screenshot)
const financialReportsNav = [
  {
    title: "Financial Reports",
    url: e("accounting", "Financial Reports"),
    icon: <BarChart2Icon className="size-4" />,
    isActive: true,
    items: [
      {
        title: "Balance Sheet",
        url: e("accounting", "Balance Sheet"),
      },
      {
        title: "Profit and Loss",
        url: e("accounting", "Profit and Loss"),
      },
      {
        title: "Cash Flow",
        url: e("accounting", "Cash Flow"),
      },
      {
        title: "Trial Balance",
        url: e("accounting", "Trial Balance"),
      },
      {
        title: "Consolidated Report",
        url: "/accounting",
      },
    ],
  },
  {
    title: "Ledgers",
    url: e("accounting", "Ledgers"),
    icon: <BookOpenIcon className="size-4" />,
    isActive: true,
    items: [
      {
        title: "General Ledger",
        url: e("accounting", "General Ledger"),
      },
      {
        title: "Customer Ledger",
        url: e("accounting", "Customer Ledger"),
      },
      {
        title: "Supplier Ledger",
        url: e("accounting", "Supplier Ledger"),
      },
    ],
  },
  {
    title: "Profitability",
    url: e("accounting", "Profitability"),
    icon: <TrendingUpIcon className="size-4" />,
    items: [],
  },
  {
    title: "Other Reports",
    url: e("accounting", "Other Reports"),
    icon: <FileSpreadsheetIcon className="size-4" />,
    items: [],
  },
]

// Navigation structure for Stock Workspace (Third Screenshot)
const stockNav = [
  {
    title: "Dashboard",
    url: e("stock", "Dashboard"),
    icon: <LayoutDashboardIcon className="size-4" />,
  },
  {
    title: "Item",
    url: "/stock/item",
    icon: <BoxIcon className="size-4" />,
  },
  {
    title: "Warehouse",
    url: e("stock", "Warehouse"),
    icon: <HomeIcon className="size-4" />,
  },
  {
    title: "Stock Entry",
    url: e("stock", "Stock Entry"),
    icon: <FileCheckIcon className="size-4" />,
  },
  {
    title: "Purchase Receipt",
    url: e("stock", "Purchase Receipt"),
    icon: <ReceiptIcon className="size-4" />,
  },
  {
    title: "Delivery Note",
    url: e("stock", "Delivery Note"),
    icon: <TruckIcon className="size-4" />,
  },
  {
    title: "Stock Reconciliation",
    url: e("stock", "Stock Reconciliation"),
    icon: <ScaleIcon className="size-4" />,
  },
  {
    title: "Landed Cost Voucher",
    url: "/landed-cost-voucher",
    icon: <ReceiptIcon className="size-4" />,
  },
  {
    title: "Material Request",
    url: e("stock", "Material Request"),
    icon: <SendIcon className="size-4" />,
  },
  {
    title: "Reports",
    url: e("stock", "Reports"),
    icon: <BarChart2Icon className="size-4" />,
    isActive: true,
    items: [
      {
        title: "Stock Ledger",
        url: "/stock/stock-ledger",
      },
      {
        title: "Stock Balance",
        url: e("stock", "Stock Balance"),
      },
      {
        title: "Stock Analytics",
        url: "/stock/stock-analytics",
      },
      {
        title: "Serial No and Batch Traceability",
        url: "/stock",
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

// Navigation structure for Manufacturing Workspace (Fourth Screenshot)
const manufacturingNav = [
  {
    title: "Dashboard",
    url: e("manufacturing", "Dashboard"),
    icon: <LayoutDashboardIcon className="size-4" />,
  },
  {
    title: "Item",
    url: "/stock/item",
    icon: <BoxIcon className="size-4" />,
  },
  {
    title: "Warehouse",
    url: e("manufacturing", "Warehouse"),
    icon: <HomeIcon className="size-4" />,
  },
  {
    title: "BOM",
    url: e("manufacturing", "BOM"),
    icon: <FileTextIcon className="size-4" />,
  },
  {
    title: "Work Order",
    url: e("manufacturing", "Work Order"),
    icon: <FileCheckIcon className="size-4" />,
  },
  {
    title: "Job Card",
    url: e("manufacturing", "Job Card"),
    icon: <UserCheckIcon className="size-4" />,
  },
  {
    title: "Stock Entry",
    url: e("manufacturing", "Stock Entry"),
    icon: <ReceiptIcon className="size-4" />,
  },
  {
    title: "Material Planning",
    url: "#",
    icon: <WrenchIcon className="size-4" />,
    isActive: true,
    items: [
      {
        title: "Production Plan",
        url: e("manufacturing", "Production Plan"),
      },
      {
        title: "Forecasting",
        url: e("manufacturing", "Forecasting"),
      },
      {
        title: "Master Production Schedule",
        url: "/landed-cost-voucher",
      },
      {
        title: "Sales Forecast",
        url: e("manufacturing", "Sales Forecast"),
      },
      {
        title: "Production Planning Report",
        url: e("manufacturing", "Production Planning Report"),
      },
    ],
  },
  {
    title: "Tools",
    url: e("manufacturing", "Tools"),
    icon: <Settings2Icon className="size-4" />,
    items: [],
  },
  {
    title: "Reports",
    url: e("manufacturing", "Reports"),
    icon: <BarChart2Icon className="size-4" />,
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

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { pathname } = useLocation()
  const [searchOpen, setSearchOpen] = React.useState(false)

  // Global CMD+K shortcut listener
  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setSearchOpen((open) => !open)
      }
    }
    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [])

  // Select dynamic navigation items based on current active workspace path
  const currentNav = React.useMemo(() => {
    if (
      pathname === "/accounting" ||
      pathname.startsWith("/accounting/") ||
      pathname.startsWith("/empty/accounting/")
    ) {
      return financialReportsNav
    }
    if (
      pathname === "/stock" ||
      pathname.startsWith("/stock/") ||
      pathname === "/landed-cost-voucher" ||
      pathname.startsWith("/empty/stock/")
    ) {
      return stockNav
    }
    if (
      pathname === "/manufacturing" ||
      pathname.startsWith("/manufacturing/") ||
      pathname.startsWith("/empty/manufacturing/")
    ) {
      return manufacturingNav
    }
    return subcontractingNav
  }, [pathname])

  return (
    <>
      <Sidebar collapsible="icon" {...props}>
        <SidebarHeader>
          <WorkspaceSwitcher workspaces={data.workspaces} />
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup className="py-0">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="Search"
                  className="text-sidebar-foreground/70"
                  onClick={() => setSearchOpen(true)}
                >
                  <SearchIcon className="size-4" />
                  <span>Search</span>
                  <KbdGroup className="ml-auto pointer-events-none group-data-[collapsible=icon]:hidden">
                    <Kbd>⌘</Kbd>
                    <Kbd>K</Kbd>
                  </KbdGroup>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <WorkspaceNotificationPopover />
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
          <NavMain items={currentNav} />
        </SidebarContent>
        <SidebarFooter>
          <NavUser user={data.user} />
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <WorkspaceSearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
    </>
  )
}
