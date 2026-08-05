import * as React from "react"

import { WorkspaceNotificationPopover } from "@/components/layout/workspace-notification-popover"
import { WorkspaceSearchDialog } from "@/components/layout/workspace-search-dialog"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { NavMain } from "@/components/layout/nav-main"
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
import {
  RefreshCwIcon,
  BarChart2Icon,
  SearchIcon,
  PackageIcon,
  FactoryIcon,
} from "lucide-react"
import { useLocation } from "react-router-dom"
import { getWorkspaceNavForPath } from "@/lib/workspace-nav"

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

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { pathname } = useLocation()
  const [searchOpen, setSearchOpen] = React.useState(false)

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

  const currentNav = React.useMemo(
    () => getWorkspaceNavForPath(pathname),
    [pathname]
  )

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
