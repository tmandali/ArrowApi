import type { ReactNode } from "react"

import {
  pageHeaderCardClass,
  pageHeaderShellClass,
} from "@/components/layout/panel-chrome"
import { WorkspaceSearchTrigger } from "@/components/layout/workspace-search-trigger"
import { YulaSkillButtons } from "@/components/layout/yula-skill-buttons"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { cn } from "@/utils/cn"

type WorkspacePageHeaderProps = {
  children: ReactNode
  actions?: ReactNode
  className?: string
  /** Classes for the outer shell (gutters). */
  shellClassName?: string
  /** Extra content in the left cluster after the separator (e.g. badge). */
  startExtra?: ReactNode
  /** Show the workspace search box in the header. Defaults to true. */
  showSearch?: boolean
  searchPlaceholder?: string
}

/**
 * Shared page header: floating card with sidebar toggle + breadcrumb + search + actions.
 */
export function WorkspacePageHeader({
  children,
  actions,
  className,
  shellClassName,
  startExtra,
  showSearch = true,
  searchPlaceholder,
}: WorkspacePageHeaderProps) {
  return (
    <div className={cn(pageHeaderShellClass, shellClassName)}>
      <header className={cn(pageHeaderCardClass, className)}>
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
          <SidebarTrigger className="-ml-1" />
          <Separator
            orientation="vertical"
            className="mr-2 data-vertical:h-4 data-vertical:self-auto"
          />
          {children}
          {startExtra}
        </div>

        {showSearch ? (
          <WorkspaceSearchTrigger
            className="shrink-0"
            placeholder={searchPlaceholder}
          />
        ) : null}

        <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
          {/* Skill'lerin ui.header_buttons bildirimi: yüklü skill varsa LLM'siz aksiyon butonları */}
          <YulaSkillButtons />
          {actions}
        </div>
      </header>
    </div>
  )
}
