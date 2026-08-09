import { AIChatAssistant } from "@/components/layout/ai-chat-assistant"
import { WorkspacePageShell } from "@/components/layout/workspace-page-shell"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { StockDashboard } from "@/features/stock/components/StockDashboard"
import { MoreHorizontal, RefreshCw } from "lucide-react"
import { Link } from "react-router-dom"

export function StockPageForm() {
  return (
    <WorkspacePageShell
      searchPlaceholder="Search Stock & Traceability..."
      breadcrumb={
        <Breadcrumb>
          <BreadcrumbList className="text-xs">
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to="/stock" state={{ yulaClosed: true }}>Stock</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      }
      actions={
        <>
          <Button variant="outline" size="icon" aria-label="Refresh">
            <RefreshCw />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label="More actions">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                <DropdownMenuItem>Customize Workspace</DropdownMenuItem>
                <DropdownMenuItem>User Permissions</DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          <AIChatAssistant variant="toolbar" />
        </>
      }
    >
      <StockDashboard />
    </WorkspacePageShell>
  )
}
