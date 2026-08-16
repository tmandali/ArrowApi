import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { AIChatAssistant } from "@/components/layout/ai-chat-assistant"
import { WorkspacePageShell } from "@/components/layout/workspace-page-shell"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "@/components/ui/empty"
import { emptyWorkspaceHome } from "@/lib/empty-module"
import { FileQuestion, ArrowLeft, Home } from "lucide-react"
import { Link, useLocation } from "react-router-dom"

function workspaceHomeFromPath(pathname: string): { label: string; url: string } {
  if (pathname.startsWith("/stock") || pathname === "/landed-cost-voucher") {
    return emptyWorkspaceHome.stock
  }
  if (pathname.startsWith("/accounting")) {
    return emptyWorkspaceHome.accounting
  }
  if (pathname.startsWith("/manufacturing")) {
    return emptyWorkspaceHome.manufacturing
  }
  return emptyWorkspaceHome.selling
}

export function NotFoundView() {
  const { pathname } = useLocation()
  const home = workspaceHomeFromPath(pathname)

  return (
    <WorkspacePageShell
      showSearch={false}
      actions={<AIChatAssistant variant="toolbar" />}
      breadcrumb={
        <Breadcrumb>
          <BreadcrumbList className="text-xs">
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to={home.url}>{home.label}</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage className="font-semibold text-foreground">
                Not Found
              </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      }
    >
      <div className="flex flex-1 items-center justify-center p-6">
        <Empty className="max-w-md rounded-xl border bg-card p-10">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileQuestion className="size-4 text-muted-foreground" />
            </EmptyMedia>
            <EmptyTitle className="text-base font-semibold">
              404 — Page not found
            </EmptyTitle>
            <EmptyDescription>
              <span className="block break-all font-mono text-[11px] text-muted-foreground/80">
                {pathname}
              </span>
              <span className="mt-2 block">
                This page does not exist or has not been implemented yet.
              </span>
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <div className="flex items-center gap-2 pt-2">
              <Button size="sm" className="h-8 gap-1.5 text-xs" asChild>
                <Link to={home.url}>
                  <ArrowLeft className="size-3.5" />
                  Back to {home.label}
                </Link>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                asChild
              >
                <Link to="/">
                  <Home className="size-3.5" />
                  Home
                </Link>
              </Button>
            </div>
          </EmptyContent>
        </Empty>
      </div>
    </WorkspacePageShell>
  )
}
