import * as React from "react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { ChevronsUpDownIcon, PlusIcon } from "lucide-react"

import { useNavigate } from "react-router-dom"
import { useActiveCompany } from "@/features/company/hooks/use-active-company"
import { useActiveWorkspaceId } from "@/hooks/use-active-workspace"
import type { WorkspaceId } from "@/lib/workspace-nav"

export function WorkspaceSwitcher({
  workspaces,
}: {
  workspaces: {
    name: string
    logo: React.ReactNode
    plan?: string
    url?: string
  }[]
}) {
  const { isMobile } = useSidebar()
  const navigate = useNavigate()
  const { company } = useActiveCompany()
  const activeWorkspaceId = useActiveWorkspaceId()

  const workspaceByUrl = React.useMemo(
    () =>
      new Map(
        workspaces
          .filter((ws) => ws.url)
          .map((ws) => [ws.url as string, ws])
      ),
    [workspaces]
  )

  const currentWorkspace = React.useMemo(() => {
    const byId: Record<WorkspaceId, string | undefined> = {
      selling: "/selling",
      accounting: "/accounting",
      stock: "/stock",
      manufacturing: "/manufacturing",
    }
    return (
      workspaceByUrl.get(byId[activeWorkspaceId] ?? "") || workspaces[0]
    )
  }, [activeWorkspaceId, workspaceByUrl, workspaces])

  const [activeWorkspace, setActiveWorkspace] = React.useState(currentWorkspace)

  React.useEffect(() => {
    setActiveWorkspace(currentWorkspace)
  }, [currentWorkspace])

  if (!activeWorkspace) {
    return null
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                {activeWorkspace.logo}
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium text-primary dark:text-sidebar-primary">
                  {activeWorkspace.name}
                </span>
                <span className="truncate text-xs text-orange-600 dark:text-orange-400">
                  {company
                    ? [company.abbr, company.name].filter(Boolean).join(" · ")
                    : (activeWorkspace.plan ?? "")}
                </span>
              </div>
              <ChevronsUpDownIcon className="ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-fit"
            align="start"
            side={isMobile ? "bottom" : "right"}
            sideOffset={4}
          >
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Workspaces
            </DropdownMenuLabel>
            {workspaces.map((workspace, index) => (
              <DropdownMenuItem
                key={workspace.name}
                onClick={() => {
                  setActiveWorkspace(workspace)
                  if (workspace.url) {
                    // Soft navigate: JobSync + rapor UI state (progress) korunur.
                    // window.location.href full reload yapıp React context'i sıfırlıyordu.
                    navigate(workspace.url)
                  }
                }}
                className="gap-2 p-2 cursor-pointer"
              >
                <div className="flex size-6 items-center justify-center rounded-md border">
                  {workspace.logo}
                </div>
                {workspace.name}
                <DropdownMenuShortcut>⌘{index + 1}</DropdownMenuShortcut>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="gap-2 p-2">
              <div className="flex size-6 items-center justify-center rounded-md border bg-transparent">
                <PlusIcon className="size-4" />
              </div>
              <div className="font-medium text-muted-foreground">Add workspace</div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
