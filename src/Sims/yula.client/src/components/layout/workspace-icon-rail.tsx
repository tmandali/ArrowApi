"use client";

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { YULA } from "@/components/layout/yula-brand-data"
import { YulaMarkIcon } from "@/components/layout/yula-brand"
import { workspaceIconFor } from "@/components/layout/workspace-brand"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useActiveWorkspaceId } from "@/hooks/use-active-workspace"
import { useWorkspaceLastPageStore } from "@/lib/stores/workspace-last-page"
import type { WorkspaceId } from "@/lib/workspace-nav"
import { cn } from "@/utils/cn"

type RailWorkspace = {
  id: WorkspaceId
  name: string
  url: string
}

const railWorkspaces: RailWorkspace[] = [
  { id: "stock", name: "Stock", url: "/stock" },
  { id: "subcontracting", name: "Subcontracting", url: "/subcontracting" },
  { id: "accounting", name: "Accounting", url: "/accounting" },
  { id: "manufacturing", name: "Manufacturing", url: "/manufacturing" },
]

/**
 * Full-height workspace icon rail on the far left: Yula mark on top,
 * one icon per workspace below — click opens that workspace.
 */
export function WorkspaceIconRail({ className }: { className?: string }) {
  const router = useRouter()
  const activeWorkspaceId = useActiveWorkspaceId()
  const lastPathById = useWorkspaceLastPageStore((s) => s.lastPathById)

  return (
    <TooltipProvider>
      <nav
        aria-label="Workspaces"
        className={cn(
          "flex w-11 shrink-0 flex-col items-center gap-1.5 pl-2",
          className
        )}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              href="/"
              aria-label={YULA.ariaLabel}
              className="mt-1.5 flex size-9 shrink-0 items-center justify-center rounded-lg text-primary transition-colors hover:bg-sidebar-accent dark:text-sidebar-primary"
            >
              <span className="block size-5">
                <YulaMarkIcon />
              </span>
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right">{YULA.name}</TooltipContent>
        </Tooltip>
        {railWorkspaces.map((workspace) => {
          const isActive = workspace.id === activeWorkspaceId
          const WorkspaceIcon = workspaceIconFor(workspace.id)
          return (
            <Tooltip key={workspace.id}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={workspace.name}
                  aria-current={isActive ? "page" : undefined}
                  onClick={() => {
                    if (!isActive && workspace.url) {
                      // Workspace'te son işlem yapılan sayfa; kayıt yoksa kök
                      const last = lastPathById[workspace.id]
                      router.push(last ?? workspace.url)
                    }
                  }}
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "border border-transparent bg-transparent text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  )}
                >
                  {WorkspaceIcon ? <WorkspaceIcon className="size-5" /> : null}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">{workspace.name}</TooltipContent>
            </Tooltip>
          )
        })}
      </nav>
    </TooltipProvider>
  )
}
