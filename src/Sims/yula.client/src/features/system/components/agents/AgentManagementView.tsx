"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ManagementPageTemplate } from "@/components/layout/management-page-template";
import { agentSessionPath } from "@/lib/workspace-paths";
import {
  DetailHistoryToggle,
  type TabbedDetailTab,
} from "@/components/layout/tabbed-detail";
import { AIChatAssistant } from "@/components/layout/ai-chat-assistant";
import { Button } from "@/components/ui/button";
import {
  panelHeaderIconClass,
  panelHeaderSubtitleClass,
  panelHeaderTitleClass,
} from "@/components/layout/panel-chrome";
import { cn } from "@/utils/cn";
import { Bot, Check, FilePlus2, Filter, Loader2, Trash2, X } from "lucide-react";
import { useUserAgentsStore, ensureExampleAgent } from "@/lib/stores/user-agents";
import { AgentEditor, type AgentEditorHandle, type AgentEditorMode } from "./agent-editor";

/**
 * Sistem → Ajan Ayarları: executions-paneli deseninde master-detail.
 * Solda ajan listesi, sağda seçili ajanın düzenleme formu.
 */
export function AgentManagementView() {
  const t = useTranslations("AgentManagement")
  const router = useRouter();
  const agents = useUserAgentsStore((s) => s.agents);
  const activeAgentId = useUserAgentsStore((s) => s.activeAgentId);
  const setActiveAgentId = useUserAgentsStore((s) => s.setActiveAgentId);
  const deleteAgent = useUserAgentsStore((s) => s.deleteAgent);

  const [selection, setSelection] = React.useState<{
    id: string | null;
  } | null>(null);

  const editorRef = React.useRef<AgentEditorHandle | null>(null);
  const [historyOpen, setHistoryOpen] = React.useState(true);
  // Kaydet basışı geri bildirimi (buton içi spinner).
  const [isSaving, setIsSaving] = React.useState(false);
  const savingTimer = React.useRef<number | null>(null);
  React.useEffect(
    () => () => {
      if (savingTimer.current !== null) window.clearTimeout(savingTimer.current);
    },
    [],
  );
  const handleSave = () => {
    editorRef.current?.save();
    setIsSaving(true);
    if (savingTimer.current !== null) window.clearTimeout(savingTimer.current);
    savingTimer.current = window.setTimeout(() => setIsSaving(false), 800);
  };
  // Yeni kayda geçerken bırakılan seçim — Vazgeç buraya döner.
  const lastSelectionRef = React.useRef<{ id: string | null } | null>(null);

  // İlk bağlanışta örnek ajan üret ve varsayılan seçiliyi belirle.
  // `ensureExampleAgent` localStorage'a erişir → SSR'de no-op,
  // bu yüzden ilk render'da selection = null kalır (hydration uyumlu).
  React.useEffect(() => {
    ensureExampleAgent();
    const first = useUserAgentsStore.getState().agents[0];
    if (first && selection == null) {
      setSelection({ id: first.id });
    }
    // Ajan kartındaki hover-düzenle butonu `?edit=<id>` ile gelir:
    const editId = new URLSearchParams(window.location.search).get("edit");
    if (editId && useUserAgentsStore.getState().agents.some((a) => a.id === editId)) {
      setSelection({ id: editId });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedAgent =
    selection?.id != null
      ? (agents.find((a) => a.id === selection.id) ?? null)
      : null;

  // Satır üzeri silme (executions deseni): hover'da beliren çöp kutusu.
  const handleRowDelete = (id: string) => {
    deleteAgent(id);
    if (selection?.id === id) setSelection(null);
  };

  // Sayfa modu (skill görünümüyle aynı dil): yeni kayıt / düzenleme /
  // salt-okunur görüntüleme. Yerleşik salt-okunur ajan yok; `view` ileride
  // sistem ajanları için ayrıldı.
  const mode: AgentEditorMode | null =
    selection == null ? null : selection.id == null ? "new" : "edit";

  const detailTitle =
    selection == null
      ? "Seçim yok"
      : selection.id != null
        ? (selectedAgent?.name ?? "Ajan")
        : "Yeni ajan";

  const detailTabs: TabbedDetailTab[] = React.useMemo(
    () => [
      { value: "genel", label: detailTitle, className: "max-w-48" },
      { value: "agentmd", label: "AGENT.md" },
    ],
    [detailTitle],
  );

  return (
    <ManagementPageTemplate
      title={
        <>
          {t("title")}
          {selection != null ? (
            <span className="font-normal text-muted-foreground"> - {detailTitle}</span>
          ) : null}
        </>
      }
      mode={mode}
      listPanelId="agents-list"
      detailPanelId="agents-detail"
      actions={
        <>
          {selection != null ? (
            <>
              {selectedAgent ? (
                <>
                  {selectedAgent.id !== activeAgentId ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 px-2.5 text-[11.5px]"
                      onClick={() => {
                        setActiveAgentId(selectedAgent.id);
                        router.push(agentSessionPath(selectedAgent.id));
                      }}
                    >
                      Oturumu aç
                    </Button>
                  ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2.5 text-[11.5px]"
                    onClick={() => setActiveAgentId(null)}
                  >
                    Varsayılana dön
                  </Button>
                  )}
                </>
              ) : null}
            </>
          ) : null}
          {selection != null ? (
            <DetailHistoryToggle
              open={historyOpen}
              onToggle={() => setHistoryOpen((v) => !v)}
            />
          ) : null}
          {selection?.id != null && selectedAgent ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 px-2.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => editorRef.current?.remove()}
              title={t("delete_agent")}
              aria-label={t("delete_agent")}
            >
              <Trash2 className="size-3.5" />
              {t("delete_agent")}
            </Button>
          ) : null}
          {(() => {
            const isNewMode = selection != null && selection.id == null;
            return (
              <Button
                type="button"
                size="sm"
                variant={isNewMode ? "ghost" : "outline"}
                className={
                  isNewMode
                    ? "h-7 shrink-0 gap-1.5 px-2.5 text-xs text-muted-foreground hover:text-foreground"
                    : "h-7 shrink-0 gap-1.5 px-2.5 text-xs"
                }
                onClick={() => {
                  if (isNewMode) {
                    setSelection(lastSelectionRef.current);
                    lastSelectionRef.current = null;
                  } else {
                    lastSelectionRef.current = selection;
                    setSelection({ id: null });
                  }
                }}
                title={isNewMode ? "Cancel" : "New agent"}
                aria-label={isNewMode ? "Cancel" : "New agent"}
              >
                {isNewMode ? (
                  <X className="size-3.5" />
                ) : (
                  <FilePlus2 className="size-3.5" />
                )}
                {isNewMode ? "Cancel" : "New"}
              </Button>
            );
          })()}
          {selection != null ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 shrink-0 gap-1.5 border-primary/40 px-2.5 text-xs text-primary hover:bg-primary/10 hover:text-primary"
                onClick={handleSave}
                disabled={isSaving}
              >
                {isSaving ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Check className="size-3.5" />
                )}
                Kaydet
              </Button>
          ) : null}
          <AIChatAssistant />
        </>
      }
      listHeader={
        <>
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <Bot className={panelHeaderIconClass} aria-hidden />
            <span className={panelHeaderTitleClass}>{t("title")}</span>
          </div>
          <span className={panelHeaderSubtitleClass}>
            {agents.length > 0
              ? `${agents.length} ${t("records")}`
              : t("no_records")}
          </span>
        </>
      }
      list={
        agents.length === 0 ? (
          <div className="flex h-full min-h-48 items-center justify-center p-4">
            <p className="text-center text-[12px] text-muted-foreground">
              {t("empty_state")}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border/60 border-b border-border/60">
            {agents.map((a) => {
              const selected = selection?.id === a.id;
              return (
                <li key={a.id} className="w-full">
                  <button
                    type="button"
                    onClick={() => setSelection({ id: a.id })}
                    aria-current={selected ? "true" : undefined}
                    className={cn(
                      "group flex w-full flex-col gap-1 px-4 py-2.5 text-left transition-colors hover:bg-muted/80",
                      selected &&
                        "bg-primary/[0.07] hover:bg-primary/10 dark:bg-primary/15",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-[12px] font-semibold text-foreground">
                        {a.name}
                      </span>
                      <span className="flex shrink-0 items-center gap-1">
                        {a.id === activeAgentId ? (
                          <Check className="size-3.5 shrink-0 text-primary" />
                        ) : null}
                        <span
                          role="button"
                          tabIndex={0}
              title={t("delete_agent")}
              aria-label={`${a.name} ${t("delete_agent")}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            handleRowDelete(a.id);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              event.stopPropagation();
                              handleRowDelete(a.id);
                            }
                          }}
                          className="rounded border-0 bg-transparent p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
                        >
                          <Trash2 className="size-3.5" />
                        </span>
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                      <span className="min-w-0 truncate">
                        {(() => {
                          if (a.description) return a.description;
                          const parts: string[] = [];
                          if (a.tools.length > 0) {
                            parts.push(`${a.tools.length} araç`);
                          }
                          if (a.skills.length > 0) {
                            parts.push(`${a.skills.length} skill`);
                          }
                          return parts.join(" · ");
                        })()}
                      </span>
                      {(a.scope ?? "global") !== "global" ? (
                        <span className="shrink-0 rounded border border-border px-1 py-px text-[10px] font-medium">
                          {a.scope}
                        </span>
                      ) : null}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )
      }
      tabs={detailTabs}
      tabResetKey={selection?.id ?? "new-agent"}
      showTabs={selection != null}
      tabSubtitle={(() => {
        if (!selectedAgent) return undefined;
        const parts: string[] = [];
        if (selectedAgent.tools.length > 0) {
          parts.push(`${selectedAgent.tools.length} araç`);
        }
        if (selectedAgent.skills.length > 0) {
          parts.push(`${selectedAgent.skills.length} skill`);
        }
        if (parts.length === 0) return undefined;
        return (
          <span className={panelHeaderSubtitleClass}>
            {parts.join(" · ")}
          </span>
        );
      })()}
      containerClass="@container/agent-detail p-3"
      empty={
        <div className="flex h-full min-h-48 flex-col items-center justify-center gap-2 text-center">
          <Filter className="size-5 text-muted-foreground/50" />
          <p className="max-w-60 text-[12px] text-muted-foreground">
            Soldan bir ajan seçin veya + ile oluşturun.
          </p>
        </div>
      }
    >
      {selection != null ? (
          <AgentEditor
            key={selection.id ?? "new-agent"}
            agent={selectedAgent}
            mode={mode ?? "new"}
            showTimeline={historyOpen}
            editorRef={editorRef}
          onSaved={(id) => {
            setSelection({ id });
          }}
          onDeleted={() => setSelection(null)}
        />
      ) : null}
    </ManagementPageTemplate>
  );
}
