import * as React from "react"

import { WorkspaceNotificationPopover } from "@/components/workspace-notification-popover"
import { WorkspaceSearchDialog } from "@/components/workspace-search-dialog"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { NavMain } from "@/components/nav-main"
import { NavProjects } from "@/components/nav-projects"
import { NavUser } from "@/components/nav-user"
import { WorkspaceSwitcher } from "@/components/workspace-switcher"
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
    url: "/empty",
    icon: <ArrowRightIcon className="size-4" />,
    isActive: true,
    items: [
      {
        title: "Sales Order",
        url: "/",
      },
      {
        title: "Subcontracting Order",
        url: "/empty",
      },
      {
        title: "Subcontracting Delivery",
        url: "/empty",
      },
    ],
  },
  {
    title: "Outward Order",
    url: "/empty",
    icon: <ArrowLeftIcon className="size-4" />,
    items: [
      {
        title: "Purchase Order",
        url: "/empty",
      },
      {
        title: "Subcontracting Order",
        url: "/empty",
      },
      {
        title: "Subcontracting Receipt",
        url: "/empty",
      },
    ],
  },
  {
    title: "Tools",
    url: "/empty",
    icon: <WrenchIcon className="size-4" />,
    items: [],
  },
  {
    title: "Reports",
    url: "/empty",
    icon: <BarChart2Icon className="size-4" />,
    items: [],
  },
  {
    title: "Settings",
    url: "/empty",
    icon: <Settings2Icon className="size-4" />,
    items: [],
  },
]

// Navigation structure for Financial Reports Workspace (Second Screenshot)
const financialReportsNav = [
  {
    title: "Financial Reports",
    url: "/empty",
    icon: <BarChart2Icon className="size-4" />,
    isActive: true,
    items: [
      {
        title: "Balance Sheet",
        url: "/empty",
      },
      {
        title: "Profit and Loss",
        url: "/empty",
      },
      {
        title: "Cash Flow",
        url: "/empty",
      },
      {
        title: "Trial Balance",
        url: "/empty",
      },
      {
        title: "Consolidated Report",
        url: "/accounting",
      },
    ],
  },
  {
    title: "Ledgers",
    url: "/empty",
    icon: <BookOpenIcon className="size-4" />,
    isActive: true,
    items: [
      {
        title: "General Ledger",
        url: "/empty",
      },
      {
        title: "Customer Ledger",
        url: "/empty",
      },
      {
        title: "Supplier Ledger",
        url: "/empty",
      },
    ],
  },
  {
    title: "Profitability",
    url: "/empty",
    icon: <TrendingUpIcon className="size-4" />,
    items: [],
  },
  {
    title: "Other Reports",
    url: "/empty",
    icon: <FileSpreadsheetIcon className="size-4" />,
    items: [],
  },
]

// Navigation structure for Stock Workspace (Third Screenshot)
const stockNav = [
  {
    title: "Dashboard",
    url: "/empty",
    icon: <LayoutDashboardIcon className="size-4" />,
  },
  {
    title: "Item",
    url: "/empty",
    icon: <BoxIcon className="size-4" />,
  },
  {
    title: "Warehouse",
    url: "/empty",
    icon: <HomeIcon className="size-4" />,
  },
  {
    title: "Stock Entry",
    url: "/empty",
    icon: <FileCheckIcon className="size-4" />,
  },
  {
    title: "Purchase Receipt",
    url: "/empty",
    icon: <ReceiptIcon className="size-4" />,
  },
  {
    title: "Delivery Note",
    url: "/empty",
    icon: <TruckIcon className="size-4" />,
  },
  {
    title: "Stock Reconciliation",
    url: "/empty",
    icon: <ScaleIcon className="size-4" />,
  },
  {
    title: "Landed Cost Voucher",
    url: "/landed-cost-voucher",
    icon: <ReceiptIcon className="size-4" />,
  },
  {
    title: "Material Request",
    url: "/empty",
    icon: <SendIcon className="size-4" />,
  },
  {
    title: "Reports",
    url: "/empty",
    icon: <BarChart2Icon className="size-4" />,
    isActive: true,
    items: [
      {
        title: "Stock Ledger",
        url: "/empty",
      },
      {
        title: "Stock Balance",
        url: "/empty",
      },
      {
        title: "Stock Analytics",
        url: "/empty",
      },
      {
        title: "Serial No and Batch Traceability",
        url: "/stock",
      },
      {
        title: "Purchase Receipt Trends",
        url: "/empty",
      },
      {
        title: "Delivery Note Trends",
        url: "/empty",
      },
    ],
  },
]

// Navigation structure for Manufacturing Workspace (Fourth Screenshot)
const manufacturingNav = [
  {
    title: "Dashboard",
    url: "/empty",
    icon: <LayoutDashboardIcon className="size-4" />,
  },
  {
    title: "Item",
    url: "/empty",
    icon: <BoxIcon className="size-4" />,
  },
  {
    title: "Warehouse",
    url: "/empty",
    icon: <HomeIcon className="size-4" />,
  },
  {
    title: "BOM",
    url: "/empty",
    icon: <FileTextIcon className="size-4" />,
  },
  {
    title: "Work Order",
    url: "/empty",
    icon: <FileCheckIcon className="size-4" />,
  },
  {
    title: "Job Card",
    url: "/empty",
    icon: <UserCheckIcon className="size-4" />,
  },
  {
    title: "Stock Entry",
    url: "/empty",
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
        url: "/empty",
      },
      {
        title: "Forecasting",
        url: "/empty",
      },
      {
        title: "Master Production Schedule",
        url: "/landed-cost-voucher",
      },
      {
        title: "Sales Forecast",
        url: "/empty",
      },
      {
        title: "Production Planning Report",
        url: "/empty",
      },
    ],
  },
  {
    title: "Tools",
    url: "/empty",
    icon: <Settings2Icon className="size-4" />,
    items: [],
  },
  {
    title: "Reports",
    url: "/empty",
    icon: <BarChart2Icon className="size-4" />,
    items: [
      {
        title: "Production Planning Report",
        url: "/empty",
      },
      {
        title: "Work Order Summary",
        url: "/empty",
      },
      {
        title: "Quality Inspection Summary",
        url: "/empty",
      },
      {
        title: "Downtime Analysis",
        url: "/empty",
      },
      {
        title: "Job Card Summary",
        url: "/empty",
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
    if (pathname === "/accounting") {
      return financialReportsNav
    }
    if (pathname === "/stock" || pathname === "/landed-cost-voucher") {
      return stockNav
    }
    if (pathname === "/manufacturing") {
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
