"use client";

// Workspace AI Dock component
import * as React from "react"
import { usePathname, useRouter } from "next/navigation"
import { agentSessionPath, isWorkspaceHomePath, isConversationVisibleForAgent, extractAgentIdFromPath, isAgentSessionPath } from "@/lib/workspace-paths"
import { useUserAgentsStore } from "@/lib/stores/user-agents"
import {
  AIChatPanel,
  AIChatPanelTitle,
} from "@/components/layout/ai-chat-assistant"
import { YULA } from "@/components/layout/yula-brand-data"
import { Button } from "@/components/ui/button"
import {
  pageContentGutterClass,
  panelCardClass,
  panelHeaderClass,
} from "@/components/layout/panel-chrome"
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
import { Check, History, Maximize2, PanelRightClose, SquarePen } from "lucide-react"

type WorkspaceAiDockProps = {
  children: React.ReactNode
  className?: string
  /** Open Yula as full content instead of the side dock. */
  startExpanded?: boolean
  /** Hide the Yula panel header bar (title / expand / collapse). */
  hideHeader?: boolean
  /** Transparent, borderless panel card (for empty pages). */
  transparent?: boolean
  /** Copilot-style centered intro on the empty chat. */
  centeredIntro?: boolean
  /** Open Yula automatically when the dock mounts. */
  defaultOpen?: boolean
}

function YulaNewChatButton() {
  // Dock başlığı oturum hazır olmadan da mount olabilir (defaultOpen) —
  // tıklama anında oturum hazırdır; yine de null-güvenli tutulur.
  const { newConversation } = useOptionalYulaChat() ?? {}
  const setHistoryOpen = useChatsStore((s) => s.setHistoryOpen)
  const setSearchingHistory = useChatsStore((s) => s.setSearchingHistory)

  const handleNew = () => {
    setSearchingHistory(false)
    setHistoryOpen(false)
    newConversation?.()
  }

  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      className="size-7 shrink-0 text-muted-foreground hover:text-foreground"
      onClick={handleNew}
      title="Yeni Sohbet Başlat"
      aria-label="Yeni Sohbet Başlat"
    >
      <SquarePen className="size-3.5" />
    </Button>
  )
}

/**
 * Dock başlığındaki "ana ekranda devam et" butonu: mevcut sohbeti koruyup
 * tam ekran ajan/Yula oturumuna taşır (ajanlı → /agents/<id>, varsayılan → /).
 * Sayfa değişiminde taze sohbet açılmasını önlemek için push öncesi
 * `beginConversationFollow` bayrağı kurulur; varışta provider kaydı yeni
 * sayfaya bağlar (aktif sohbet korunur, yeni sohbet açılmaz).
 */
function YulaOpenInMainButton() {
  const router = useRouter()
  const dockAgent = useDockAgent()

  const handleOpen = () => {
    const store = useChatsStore.getState()
    const activeId = store.activeId
    if (!activeId) return
    const target = dockAgent?.id ? agentSessionPath(dockAgent.id) : "/"
    if (
      typeof window !== "undefined" &&
      (window.location.pathname === target ||
        window.location.pathname + window.location.search === target)
    ) {
      return
    }
    // Boş (kayıtsız + mesajsız) sohbette follow kaydı üretme — provider
    // zaten aynı activeId'yi korur; dolu sohbette follow zorunludur.
    const hasRecord = store.conversations.some((c) => c.id === activeId)
    if (hasRecord) {
      store.beginConversationFollow(activeId)
    }
    store.setHistoryOpen(false)
    store.setSearchingHistory(false)
    router.push(target)
  }

  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      className="size-7 shrink-0 text-muted-foreground hover:text-foreground"
      onClick={handleOpen}
      title="Ana ekranda devam et"
      aria-label="Ana ekranda devam et"
    >
      <Maximize2 className="size-3.5" />
    </Button>
  )
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
          title={dockAgent ? `${dockAgent.name} — ajanı değiştir` : "Yula — ajanı değiştir"}
          aria-label="Ajanı değiştir"
          className="flex size-7 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-muted/60"
        >
          <DockAgentIcon agentId={currentId} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-1">
        <Command>
          <CommandInput placeholder="Ajan ara…" className="text-xs" />
          <CommandList>
            <CommandEmpty>Sonuç yok.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="Yula varsayılan"
                onSelect={() => select(null)}
                className="flex cursor-pointer items-center gap-2 text-xs"
              >
                <YulaMarkIcon className="size-4 shrink-0" />
                <span className="flex-1 truncate">Yula (varsayılan)</span>
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

/** Başlık metni + ajan değiştirici kompozisyonu (isim yazılmaz). */
function DockHeaderTitle() {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate">
      <DockAgentSwitch />
      <AIChatPanelTitle hideIcon />
    </span>
  )
}

/** Paneli kapatma ikonu (başlık-butonu collapse'unun yerine). */
function DockCollapseButton({ onCollapse }: { onCollapse: () => void }) {
  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      className="size-7 shrink-0 text-muted-foreground hover:text-foreground"
      onClick={onCollapse}
      title="Paneli kapat"
      aria-label="Paneli kapat"
    >
      <PanelRightClose className="size-3.5" />
    </Button>
  )
}

export function YulaScreenHistoryButton() {
  const isHistoryOpen = useChatsStore((s) => s.isHistoryOpen)
  const historyFilter = useChatsStore((s) => s.historyFilter)
  const toggleHistory = useChatsStore((s) => s.toggleHistory)
  const conversations = useChatsStore((s) => s.conversations)
  const pathname = usePathname()
  const dockActiveAgentId = useUserAgentsStore((s) => s.activeAgentId)
  const dockCurrentAgentId = extractAgentIdFromPath(pathname) ?? dockActiveAgentId ?? null

  const screenCount = React.useMemo(() => {
    return conversations.filter((c) =>
      isConversationVisibleForAgent(c, pathname, dockCurrentAgentId),
    ).length
  }, [conversations, pathname, dockCurrentAgentId])

  const isActive = isHistoryOpen && historyFilter === "screen"

  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      className={cn(
        "relative size-7 shrink-0 transition-colors",
        isActive
          ? "text-primary bg-primary/10 dark:bg-primary/20"
          : "text-muted-foreground hover:text-foreground"
      )}
      onClick={() => toggleHistory("screen")}
      title={`Bu Ekranın Yazışmaları (${screenCount})`}
      aria-label={`Bu Ekranın Yazışmaları (${screenCount})`}
    >
      <History className="size-3.5" />
      {screenCount > 0 ? (
        <span className="absolute -right-0.5 -top-0.5 flex size-3.5 items-center justify-center rounded-full bg-primary text-[8.5px] font-bold text-primary-foreground">
          {screenCount > 9 ? "9+" : screenCount}
        </span>
      ) : null}
    </Button>
  )
}

export function YulaHistoryToggle() {
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
      title={isHistoryOpen ? "Sohbet Geçmişini Gizle" : "Sohbet Geçmişini Göster"}
      aria-label={isHistoryOpen ? "Sohbet Geçmişini Gizle" : "Sohbet Geçmişini Göster"}
    >
      <History className="size-3.5" />
    </Button>
  )
}

export function WorkspaceAiDock({
  children,
  className,
  startExpanded = false,
  hideHeader = false,
  transparent = false,
  centeredIntro = false,
  defaultOpen = false,
}: WorkspaceAiDockProps) {
  const { open, setOpen, expanded, setExpanded } =
    useWorkspaceAiChat()
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
      if (startExpanded) {
        setExpanded(true)
      }
    }
  }, [defaultOpen, startExpanded, setOpen, setExpanded])

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
        {content}
      </div>
    )
  }

  const isMainMode = open && (expanded || startExpanded)

  if (isMainMode) {
    return (
      <aside
        className={cn(
          "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-transparent",
          pageContentGutterClass,
          className
        )}
        aria-label={YULA.name}
      >
        <div
          className={cn(
            transparent
              ? "flex min-h-0 flex-col overflow-hidden"
              : panelCardClass,
            "flex-1"
          )}
        >
          {!hideHeader ? (
            <div className={cn(panelHeaderClass, "gap-1")}>
              <DockHeaderTitle />
              <YulaScreenHistoryButton />
              <YulaNewChatButton />
              <YulaOpenInMainButton />
              <DockCollapseButton onCollapse={() => setOpen(false)} />
            </div>
          ) : null}
          <div className="relative flex min-h-0 flex-1 overflow-hidden">
            <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
              <AIChatPanel mode="main" centeredIntro={centeredIntro} />
            </div>
          </div>
        </div>
      </aside>
    )
  }

  return (
    <WorkspaceSidePanelLayout
      open={open}
      onOpenChange={setOpen}
      title={<DockHeaderTitle />}
      titleCollapseDisabled
      collapseLabel={YULA.collapseLabel}
      headerActions={
        <div className="flex min-w-0 items-center gap-0.5">
          <YulaScreenHistoryButton />
          <YulaNewChatButton />
          <YulaOpenInMainButton />
          <DockCollapseButton onCollapse={() => setOpen(false)} />
        </div>
      }
      panel={<AIChatPanel centeredIntro={centeredIntro} />}
      defaultSizePercent={32}
      minSizePercent={20}
      maxSizePercent={60}
      mainMinSizePercent={40}
      layoutId="yula-dock"
      mainClassName="overflow-y-auto overscroll-contain"
      className={cn("min-h-0 flex-1 overflow-hidden", className)}
    >
      {content}
    </WorkspaceSidePanelLayout>
  )
}

