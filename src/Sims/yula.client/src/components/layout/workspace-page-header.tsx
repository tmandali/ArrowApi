"use client";

import type { ReactNode } from "react"

import { pageHeaderShellClass } from "@/components/layout/panel-chrome"
import { PagePanelTrigger } from "@/components/layout/page-panel-trigger"
import { YulaMarkIcon } from "@/components/layout/yula-brand"
import { applyYulaAgentQuery } from "@/components/layout/yula-agent-query"
import { WorkspaceSearchTrigger } from "@/components/layout/workspace-search-trigger"
import { useWorkspaceSearch } from "@/context/workspace-search-context"
import { useWorkspaceAiChat } from "@/context/workspace-ai-chat-context"
import { PanelRightClose } from "lucide-react"
import { useTranslations } from "next-intl"
import { cn } from "@/utils/cn"

/**
 * Page header'daki Yula dock tetikleyicisi — normalde Yula markası, hover'da
 * kapatma ikonu; tıklama Yula dock'unu açar/kapar.
 */
function YulaDockTrigger() {
  const { open, setOpen, setExpanded } = useWorkspaceAiChat()
  const t = useTranslations("AiDock")
  const label = open ? t("close_panel") : t("open_panel")
  const handleToggle = () => {
    if (open) {
      // Kapatırken expand durumunu + ?yula= query'sini de temizle —
      // sayfa session'ına eksiksiz dönüş.
      setOpen(false)
      setExpanded(false)
      applyYulaAgentQuery(null)
    } else {
      setOpen(true)
    }
  }
  return (
    <button
      type="button"
      onClick={handleToggle}
      title={label}
      aria-label={label}
      aria-pressed={open}
      className="group/yula-dock relative -ml-1 flex size-7 shrink-0 items-center justify-center rounded-md text-foreground/70 transition-colors hover:text-foreground cursor-pointer"
    >
      <YulaMarkIcon className="size-4 transition-opacity duration-150 group-hover/yula-dock:opacity-0" />
      <PanelRightClose className="absolute size-4 opacity-0 transition-opacity duration-150 group-hover/yula-dock:opacity-100" />
      <span className="sr-only">{label}</span>
    </button>
  )
}

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
  /**
   * Başlığın solundaki Yula dock tetikleyicisini gizler — ekranın aksiyon
   * alanında zaten AIChatAssistant Yula butonu varsa çift tetikleyici
   * hissi vermemek için (örn. rapor ekranları).
   */
  showYulaTrigger?: boolean
}

/**
 * Shared page header: transparan, kart çerçevesiz — shell + panel trigger,
 * başlık ve aksiyonlar düz zemine oturur. Tüm sayfalarda tek standart
 * (genel tasarım kararı); kart/çerçeve kalıntısı ve katlanmış boşluk yok.
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
  showYulaTrigger = true,
}: WorkspacePageHeaderProps) {
  // Workspace search açıkken floating header gizlenir — arama görünümü
  // AppHeader altındaki tüm alanı kaplar (ana ekran davranışı).
  const { open: searchOpen } = useWorkspaceSearch()
  if (searchOpen) return null

  if (frameless) {
    return (
      <div className={cn(pageHeaderShellClass, "p-0", shellClassName)}>
        <header className={cn("flex w-full min-w-0 items-center", className)}>
          <PagePanelTrigger className="-ml-1" />
        </header>
      </div>
    )
  }

  return (
    <div className={cn(pageHeaderShellClass, "p-0", shellClassName)}>
      <header
        className={cn(
          "flex h-11 w-full min-w-0 flex-row items-center gap-2 overflow-hidden px-2 text-xs",
          className
        )}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
          <PagePanelTrigger className="-ml-1" />
          {showYulaTrigger ? <YulaDockTrigger /> : null}
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
