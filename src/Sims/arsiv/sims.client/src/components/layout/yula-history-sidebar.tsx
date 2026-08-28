import * as React from "react";
import { useAgentBridgeStore } from "@/hooks/useAgentBridge";
import { groupSessionsByDate } from "@/hooks/yula/history-storage";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";
import {
  MessageSquare,
  Plus,
  Search,
  Trash2,
  Check,
  X,
  Pencil,
  Sparkles,
} from "lucide-react";

export interface YulaHistorySidebarProps {
  className?: string;
  onSelectConversation?: () => void;
}

export function YulaHistorySidebar({
  className,
  onSelectConversation,
}: YulaHistorySidebarProps) {
  const conversations = useAgentBridgeStore((s) => s.conversations);
  const activeConversationId = useAgentBridgeStore(
    (s) => s.activeConversationId
  );
  const loadConversation = useAgentBridgeStore((s) => s.loadConversation);
  const deleteConversation = useAgentBridgeStore((s) => s.deleteConversation);
  const renameConversation = useAgentBridgeStore((s) => s.renameConversation);
  const newConversation = useAgentBridgeStore((s) => s.newConversation);
  const clearAllConversations = useAgentBridgeStore(
    (s) => s.clearAllConversations
  );

  const [searchQuery, setSearchQuery] = React.useState("");
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editingTitle, setEditingTitle] = React.useState("");
  const [confirmClear, setConfirmClear] = React.useState(false);

  const filteredSessions = React.useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const q = searchQuery.toLowerCase().trim();
    return conversations.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.messages.some((m) => m.content.toLowerCase().includes(q))
    );
  }, [conversations, searchQuery]);

  const grouped = React.useMemo(
    () => groupSessionsByDate(filteredSessions),
    [filteredSessions]
  );

  const handleStartRename = (
    e: React.MouseEvent,
    id: string,
    currentTitle: string
  ) => {
    e.stopPropagation();
    setEditingId(id);
    setEditingTitle(currentTitle);
  };

  const handleSaveRename = (e: React.FormEvent | React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (editingTitle.trim()) {
      renameConversation(id, editingTitle);
    }
    setEditingId(null);
  };

  const handleCancelRename = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(null);
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    deleteConversation(id);
  };

  return (
    <div
      className={cn(
        "flex h-full min-h-0 w-64 shrink-0 flex-col bg-transparent select-none",
        className
      )}
    >
      {/* Header: Search Box + Compact Transparent New Chat Icon Button */}
      <div className="flex shrink-0 items-center gap-1.5 p-3 pb-1 bg-transparent">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/50" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Sohbetlerde ara..."
            className="w-full rounded-lg border-0 bg-muted/40 py-1.5 pl-8 pr-2.5 text-[11px] outline-none placeholder:text-muted-foreground/50 focus:bg-muted/60 focus:ring-1 focus:ring-primary/20 transition-colors"
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground transition-colors"
            >
              <X className="size-3" />
            </button>
          ) : null}
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => {
            newConversation();
            onSelectConversation?.();
          }}
          className="size-8 shrink-0 rounded-lg text-muted-foreground hover:bg-muted/50 hover:text-foreground border-0 shadow-none transition-colors"
          title="Yeni Sohbet"
          aria-label="Yeni Sohbet"
        >
          <Plus className="size-4" />
        </Button>
      </div>

      {/* History Session Groups */}
      <div className="flex-1 overflow-y-auto min-h-0 p-2 space-y-3 overscroll-contain no-scrollbar">
        {grouped.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground/60 font-medium">
            {searchQuery ? "Aramayla eşleşen sohbet bulunamadı." : "Henüz geçmiş sohbet yok."}
          </div>
        ) : (
          grouped.map((group) => (
            <div key={group.label} className="space-y-1">
              <div className="px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                {group.label}
              </div>
              <div className="space-y-0.5">
                {group.items.map((session) => {
                  const isActive = session.id === activeConversationId;
                  const isEditing = session.id === editingId;

                  return (
                    <div
                      key={session.id}
                      onClick={() => {
                        if (!isEditing) {
                          loadConversation(session.id);
                          onSelectConversation?.();
                        }
                      }}
                      className={cn(
                        "group relative flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs transition-colors cursor-pointer border-0",
                        isActive
                          ? "bg-primary/10 text-primary dark:bg-primary/15 font-medium"
                          : "text-muted-foreground/80 hover:bg-muted/40 hover:text-foreground"
                      )}
                    >
                      {isEditing ? (
                        <form
                          onSubmit={(e) => handleSaveRename(e, session.id)}
                          className="flex flex-1 items-center gap-1 min-w-0"
                        >
                          <input
                            type="text"
                            autoFocus
                            value={editingTitle}
                            onChange={(e) => setEditingTitle(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => {
                              if (e.key === "Escape") setEditingId(null);
                            }}
                            className="flex-1 rounded border border-primary/40 bg-background px-1.5 py-0.5 text-xs outline-none text-foreground"
                          />
                          <button
                            type="submit"
                            onClick={(e) => handleSaveRename(e, session.id)}
                            className="p-1 rounded text-primary hover:bg-muted transition-colors"
                            title="Kaydet"
                          >
                            <Check className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={handleCancelRename}
                            className="p-1 rounded text-muted-foreground hover:bg-muted transition-colors"
                            title="İptal"
                          >
                            <X className="size-3.5" />
                          </button>
                        </form>
                      ) : (
                        <>
                          <div className="flex items-center gap-2 truncate min-w-0 flex-1">
                            {isActive ? (
                              <Sparkles className="size-3.5 shrink-0 text-primary/80" />
                            ) : (
                              <MessageSquare className="size-3.5 shrink-0 text-muted-foreground/50 group-hover:text-muted-foreground" />
                            )}
                            <span className="truncate text-[11.5px] leading-tight font-normal">
                              {session.title}
                            </span>
                          </div>

                          <div className="flex items-center gap-0.5 ml-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                            <button
                              type="button"
                              onClick={(e) =>
                                handleStartRename(e, session.id, session.title)
                              }
                              className="rounded p-1 text-muted-foreground/70 hover:bg-background/80 hover:text-foreground transition-colors"
                              title="Yeniden adlandır"
                            >
                              <Pencil className="size-3" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleDelete(e, session.id)}
                              className="rounded p-1 text-muted-foreground/70 hover:bg-background/80 hover:text-destructive transition-colors"
                              title="Sohbeti sil"
                            >
                              <Trash2 className="size-3" />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer Actions */}
      <div className="shrink-0 p-2.5 flex items-center justify-between text-[11px] text-muted-foreground/60 bg-transparent">
        <span className="font-medium">{conversations.length} sohbet</span>
        {confirmClear ? (
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-destructive font-medium">Emin misiniz?</span>
            <button
              type="button"
              onClick={() => {
                clearAllConversations();
                setConfirmClear(false);
              }}
              className="px-1.5 py-0.5 rounded bg-destructive/80 hover:bg-destructive text-destructive-foreground font-medium text-[10px] transition-colors"
            >
              Evet
            </button>
            <button
              type="button"
              onClick={() => setConfirmClear(false)}
              className="px-1.5 py-0.5 rounded bg-muted hover:bg-accent text-[10px] font-medium transition-colors"
            >
              Hayır
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmClear(true)}
            className="hover:text-destructive transition-colors flex items-center gap-1 text-[10.5px] font-medium"
            title="Tüm sohbet geçmişini temizle"
          >
            <Trash2 className="size-3" />
            <span>Temizle</span>
          </button>
        )}
      </div>
    </div>
  );
}
