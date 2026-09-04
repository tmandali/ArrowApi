"use client";

import type { ReactNode } from "react"

import {
  pageHeaderCardClass,
  pageHeaderShellClass,
} from "@/components/layout/panel-chrome"
import { PagePanelTrigger } from "@/components/layout/page-panel-trigger"
import { WorkspaceSearchTrigger } from "@/components/layout/workspace-search-trigger"
import { useWorkspaceSearch } from "@/context/workspace-search-context"
import { cn } from "@/utils/cn"

type WorkspacePageHeaderProps = {
  children?: ReactNode
  actions?: ReactNode
  className?: string
  /** Classes for the outer shell (gutters). */
  shellClassName?: string
  /** Extra content in the left cluster after the separator (e.g. badge). */
  startExtra?: ReactNode
  /** Show the workspace search box in the header. Defaults to true. */
  showSearch?: boolean
  searchPlaceholder?: string
  /** Custom header search node (e.g. YulaHeaderSearch). */
  headerSearch?: ReactNode
  /**
   * Çerçevesiz/transparan header — kart görünümü, başlık, search ve actions
   * atlanır; yalnızca menü aç/kapa (PagePanelTrigger) render edilir.
   */
  frameless?: boolean
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
  headerSearch,
  frameless = false,
}: WorkspacePageHeaderProps) {
  // Workspace search açıkken floating header gizlenir — arama görünümü
  // AppHeader altındaki tüm alanı kaplar (ana ekran davranışı).
  const { open: searchOpen } = useWorkspaceSearch()
  if (searchOpen) return null

  if (frameless) {
    return (
      <div className={cn(pageHeaderShellClass, shellClassName)}>
        <header className={cn("flex w-full min-w-0 items-center", className)}>
          <PagePanelTrigger className="-ml-1" />
        </header>
      </div>
    )
  }

  return (
    <div className={cn(pageHeaderShellClass, shellClassName)}>
      <header className={cn(pageHeaderCardClass, className)}>
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
          <PagePanelTrigger className="-ml-1" />
          {children}
          {startExtra}
        </div>

        {headerSearch ? (
          headerSearch
        ) : showSearch ? (
          <WorkspaceSearchTrigger
            className="shrink-0"
            placeholder={searchPlaceholder}
          />
        ) : null}

        <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
          {/* Skill'lerin ui.header_buttons bildirimi: yüklü skill varsa LLM'siz aksiyon butonları */}
          {actions}
        </div>
      </header>
    </div>
  )
}
