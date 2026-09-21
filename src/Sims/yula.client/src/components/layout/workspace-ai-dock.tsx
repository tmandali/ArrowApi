"use client";

// Workspace AI Dock component
import * as React from "react"
import { usePathname } from "next/navigation"
import { useTranslations } from "next-intl"
import { isWorkspaceHomePath, isAgentSessionPath } from "@/lib/workspace-paths"
import { useUserAgentsStore } from "@/lib/stores/user-agents"
import { AIChatPanel } from "@/components/layout/ai-chat/ai-chat-panel";
import { AIChatPanelTitle } from "@/components/layout/ai-chat/ai-chat-panel-title";
import { YULA } from "@/components/layout/yula-brand-data"
import { Button } from "@/components/ui/button"
import { WorkspaceSidePanelLayout } from "@/components/layout/workspace-side-panel"
import { WorkspaceSearchMainView } from "@/components/layout/workspace-search-main-view"
import { useWorkspaceAiChat } from "@/context/workspace-ai-chat-context"
import { useWorkspaceSearch } from "@/context/workspace-search-context"
import { useOptionalYulaChat } from "@/hooks/use-yula-chat"
import { useChatsStore } from "@/lib/stores/chats"
import { agentScopeWorkspaceId, filterAgentsByScope } from "@/lib/yula-user-agent"
import { AgentAvatar } from "@/features/system/components/agents/agent-avatar"
import { agentInitials } from "@/features/system/components/agents/agent-initials"
import { YulaMarkIcon } from "@/components/layout/yula-brand"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/utils/cn"
import { Check, History } from "lucide-react"
import { MermaidCanvasSheet } from "@/components/layout/chat-markdown/mermaid-canvas-sheet"
import {
  YulaNewChatButton,
  YulaExpandToggleButton,
  YulaCloseButton,
} from "./fullscreen-overlay/yula-dock-controls"

type WorkspaceAiDockProps = {
  children: React.ReactNode
  className?: string
  /**
   * Sayfa başlığı — split'in üstünde, overlay konum kabının içinde render
   * edilir; tam ekran overlay açıkken başlığı da kapsar.
   */
  header?: React.ReactNode
  /** Copilot-style centered intro on the empty chat. */
  centeredIntro?: boolean
  /** Open Yula automatically when the dock mounts. */
  defaultOpen?: boolean
  /**
   * Side-dock panel kabuğunun gutter sınıflarını geçersiz kiler
   * (varsayılan: panelShellClass — pt-0). Örn. rapor ekranında grid
   * maximize edilince üst kenar boşluğunu korumak için pt-2.
   */
  panelShellClassName?: string
}

/**
 * Dock başlığındaki oturum ajanını çözer: önce aktif konuşma kaydı, sonra
 * global seçim. Yoksa null = varsayılan Yula.
 */
function useDockAgent() {
  const activeId = useChatsStore((s) => s.activeId)
  const conversations = useChatsStore((s) => s.conversations)
  const agents = useUserAgentsStore((s) => s.agents)
  const storeActiveAgentId = useUserAgentsStore((s) => s.activeAgentId)
  return React.useMemo(() => {
    const conv = conversations.find((c) => c.id === activeId)
    const id = conv?.agentId ?? storeActiveAgentId ?? null
    return id ? (agents.find((a) => a.id === id) ?? null) : null
  }, [conversations, activeId, agents, storeActiveAgentId])
}

/** Ajan ikon rozeti (yüklenen görsel veya baş harf karosu). */
function DockAgentIcon({ agentId, className }: { agentId?: string | null; className?: string }) {
  const agents = useUserAgentsStore((s) => s.agents)
  const agent = agentId ? (agents.find((a) => a.id === agentId) ?? null) : null
  if (agent?.avatar) {
    return (
      <AgentAvatar
        value={agent.avatar}
        name={agent.name}
        className={cn("size-7 rounded-md", className)}
      />
    )
  }
  if (agent) {
    return (
      <span
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-md bg-orange-500 text-[10px] font-bold text-white",
          className,
        )}
      >
        {agentInitials(agent.name)}
      </span>
    )
  }
  return <YulaMarkIcon className={cn("size-5 shrink-0", className)} />
}

/**
 * Başlıktaki ikon-only ajan değiştirici: isim yazmaz, tıklayınca aramalı
 * liste açılır (Yula + kapsamdaki ajanlar). Seçim değişince persona değişir
 * ve ajan ayrımı için taze sohbet açılır.
 */
function DockAgentSwitch() {
  const t = useTranslations("AiDock")
  const pathname = usePathname()
  const agents = useUserAgentsStore((s) => s.agents)
  const activeAgentId = useUserAgentsStore((s) => s.activeAgentId)
  const setActiveAgentId = useUserAgentsStore((s) => s.setActiveAgentId)
  const { newConversation } = useOptionalYulaChat() ?? {}
  const [open, setOpen] = React.useState(false)
  const dockAgent = useDockAgent()
  const currentId = dockAgent?.id ?? activeAgentId ?? null

  const inScope = React.useMemo(
    () => filterAgentsByScope(agents, agentScopeWorkspaceId(pathname)),
    [agents, pathname],
  )

  const select = (id: string | null) => {
    if ((currentId ?? null) === (id ?? null)) {
      setOpen(false)
      return
    }
    setActiveAgentId(id)
    if (newConversation) {
      newConversation()
    } else {
      useChatsStore.getState().newConversation()
    }
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={dockAgent ? t("change_agent_tooltip", { name: dockAgent.name }) : t("change_agent_tooltip", { name: "Yula" })}
          aria-label={t("change_agent_aria")}
          className="flex size-7 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-muted/60"
        >
          <DockAgentIcon agentId={currentId} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-1">
        <Command>
          <CommandInput placeholder={t("agent_search")} className="text-xs" />
          <CommandList>
            <CommandEmpty>{t("no_results")}</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value={t("agent_default")}
                onSelect={() => select(null)}
                className="flex cursor-pointer items-center gap-2 text-xs"
              >
                <YulaMarkIcon className="size-4 shrink-0" />
                <span className="flex-1 truncate">{t("continue_main")}</span>
                {currentId === null ? <Check className="size-3.5 shrink-0 text-primary" /> : null}
              </CommandItem>
              {inScope.map((a) => (
                <CommandItem
                  key={a.id}
                  value={a.name}
                  onSelect={() => select(a.id)}
                  className="flex cursor-pointer items-center gap-2 text-xs"
                >
                  <DockAgentIcon agentId={a.id} className="size-5 rounded" />
                  <span className="flex-1 truncate">{a.name}</span>
                  {currentId === a.id ? (
                    <Check className="size-3.5 shrink-0 text-primary" />
                  ) : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

/** Başlık metni + ajan değiştirici kompozisyonu (sade dock başlığı). */
function DockHeaderTitle() {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate">
      <DockAgentSwitch />
      <AIChatPanelTitle hideIcon />
    </span>
  )
}

export function YulaHistoryToggle() {
  const t = useTranslations("AiDock")
  const isHistoryOpen = useChatsStore((s) => s.isHistoryOpen)
  const historyFilter = useChatsStore((s) => s.historyFilter)
  const toggleHistory = useChatsStore((s) => s.toggleHistory)

  const isActive = isHistoryOpen && historyFilter === "all"

  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      className={cn(
        "size-7 shrink-0 transition-colors",
        isActive
          ? "text-primary bg-primary/10 dark:bg-primary/20"
          : "text-muted-foreground hover:text-foreground"
      )}
      onClick={() => toggleHistory("all")}
      title={isHistoryOpen ? t("toggle_history_hide") : t("toggle_history_show")}
      aria-label={isHistoryOpen ? t("toggle_history_hide") : t("toggle_history_show")}
    >
      <History className="size-3.5" />
    </Button>
  )
}

export function WorkspaceAiDock({
  children,
  className,
  header,
  centeredIntro = false,
  defaultOpen = false,
  panelShellClassName,
}: WorkspaceAiDockProps) {
  const { open, setOpen, expanded } = useWorkspaceAiChat()
  const { open: searchOpen } = useWorkspaceSearch()
  const pathname = usePathname()
  const isHomePage = isWorkspaceHomePath(pathname) || isAgentSessionPath(pathname)

  // Workspace search açıkken dock içeriği ana arama görünümüne döner —
  // hangi ekran AiDock kullanıyorsa search her ekranda çalışır.
  const content = searchOpen ? <WorkspaceSearchMainView /> : children

  const mountedRef = React.useRef(false)
  React.useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true
      if (defaultOpen) {
        setOpen(true)
      }
    }
  }, [defaultOpen, setOpen])

  // Search açıkken Yula paneli de gizlenir — arama görünümü tüm alanı kaplar
  // (ana ekran davranışı); panel search kapanınca yeniden belirir.
  if (isHomePage || searchOpen) {
    return (
      <div
        className={cn(
          "flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overscroll-contain",
          className
        )}
      >
        {header}
        {content}
      </div>
    )
  }

  // Tam ekran overlay AppLayout (main tuval) seviyesinde YulaFullscreenHost tarafından
  // render edilir (sayfa içinde değil, Sol Nav ile AppHeader arasında tüm içeriğe yayılır).
  // Yan dock yalnızca expanded false iken açıktır (çift chat mount'u önlenir).
  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      {header}
      <WorkspaceSidePanelLayout
        open={open && !expanded}
        onOpenChange={setOpen}
        title={<DockHeaderTitle />}
        titleCollapseDisabled
        collapseLabel={YULA.collapseLabel}
        headerActions={
          <div className="flex min-w-0 items-center gap-0.5">
            <YulaNewChatButton />
            <YulaExpandToggleButton />
            <YulaCloseButton />
          </div>
        }
        panel={<AIChatPanel centeredIntro={centeredIntro} />}
        defaultSizePercent={32}
        minSizePercent={20}
        maxSizePercent={60}
        mainMinSizePercent={40}
        layoutId="yula-dock"
        mainClassName="overflow-y-auto overscroll-contain"
        panelShellClassName={panelShellClassName}
        className={cn("min-h-0 flex-1 overflow-hidden", className)}
      >
        {content}
      </WorkspaceSidePanelLayout>
      {!expanded ? <MermaidCanvasSheet /> : null}
    </div>
  )
}

