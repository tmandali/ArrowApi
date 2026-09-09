"use client";

import * as React from "react";
import { AIChatAssistant } from "@/components/layout/ai-chat-assistant";
import { PageHeaderTitle } from "@/components/layout/page-header-title";
import { ModuleNavPane } from "@/components/layout/module-nav-pane";
import { WorkspaceAiDock } from "@/components/layout/workspace-ai-dock";
import { WorkspacePageHeader } from "@/components/layout/workspace-page-header";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import {
  panelCardClass,
  panelHeaderClass,
  panelHeaderIconClass,
  panelHeaderTitleClass,
  panelHeaderSubtitleClass,
  panelResizeHandleClass,
} from "@/components/layout/panel-chrome";
import { cn } from "@/utils/cn";
import { Bot, Check, Filter } from "lucide-react";
import { useUserAgentsStore } from "@/lib/stores/user-agents";
import { AgentEditor, type AgentEditorHandle } from "./agent-editor";

/**
 * Sistem → Ajanlar: executions-paneli deseninde master-detail.
 * Solda ajan listesi, sağda seçili ajanın düzenleme formu.
 */
export function AgentManagementView() {
  const agents = useUserAgentsStore((s) => s.agents);
  const activeAgentId = useUserAgentsStore((s) => s.activeAgentId);
  const setActiveAgentId = useUserAgentsStore((s) => s.setActiveAgentId);

  const [selection, setSelection] = React.useState<{ id: string | null } | null>(null);
  const editorRef = React.useRef<AgentEditorHandle | null>(null);
  const [formRev, setFormRev] = React.useState(0);

  const selectedAgent =
    selection?.id != null
      ? (agents.find((a) => a.id === selection.id) ?? null)
      : null;
  const detailTitle =
    selection == null
      ? "Seçim yok"
      : selection.id != null
        ? (selectedAgent?.name ?? "Ajan")
        : "Yeni ajan";

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <WorkspacePageHeader
        showSearch={false}
        actions={
          <>
            <Button
              type="button"
              size="sm"
              variant={selection != null ? "outline" : "default"}
              className="h-7 text-xs px-3 transition-opacity duration-150"
              disabled={selection != null && selection.id == null}
              onClick={() => setSelection({ id: null })}
            >
              Yeni Ajan
            </Button>
            {selection != null ? (
              <>
                {selectedAgent ? (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2.5 text-[11.5px] text-muted-foreground hover:text-red-600 hover:bg-red-500/10 dark:hover:text-red-400"
                      onClick={() => editorRef.current?.remove()}
                      title="Ajanı sil"
                    >
                      Sil
                    </Button>
                    {selectedAgent.id !== activeAgentId ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 px-2.5 text-[11.5px]"
                        onClick={() => setActiveAgentId(selectedAgent.id)}
                      >
                        Aktifleştir
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
            <AIChatAssistant />
          </>
        }
      >
        <PageHeaderTitle>Ajanlar</PageHeaderTitle>
      </WorkspacePageHeader>

      <WorkspaceAiDock>
        <ModuleNavPane>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <ResizablePanelGroup
              orientation="horizontal"
              className="min-h-0 flex-1 overflow-hidden"
            >
              <ResizablePanel
                id="agents-list"
                defaultSize={360}
                minSize={320}
                maxSize={520}
                groupResizeBehavior="preserve-pixel-size"
                className="min-h-0 min-w-0"
              >
                <section className={cn(panelCardClass, "h-full")}>
                  <div className={panelHeaderClass}>
                    <div className="flex min-w-0 flex-1 items-center gap-1.5">
                      <Bot className={panelHeaderIconClass} aria-hidden />
                      <span className={panelHeaderTitleClass}>Ajanlar</span>
                    </div>
                    <span className={panelHeaderSubtitleClass}>
                      {agents.length > 0
                        ? `${agents.length} kayıt`
                        : "kayıt yok"}
                    </span>
                  </div>
                  <ScrollArea className="h-0 min-h-0 w-full flex-1">
                    {agents.length === 0 ? (
                      <div className="flex h-full min-h-48 items-center justify-center p-4">
                        <p className="text-center text-[12px] text-muted-foreground">
                          Henüz ajan yok — Yeni Ajan ile tanımlayın.
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
                                  "flex w-full flex-col gap-1 px-4 py-2.5 text-left transition-colors hover:bg-muted/80",
                                  selected &&
                                    "bg-primary/[0.07] hover:bg-primary/10 dark:bg-primary/15",
                                )}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="min-w-0 truncate text-[12px] font-semibold text-foreground">
                                    {a.name}
                                  </span>
                                  {a.id === activeAgentId ? (
                                    <Check className="size-3.5 shrink-0 text-primary" />
                                  ) : null}
                                </div>
                                <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                                  <span className="min-w-0 truncate">
                                    {a.description ||
                                      `${a.tools.length === 0 ? "Tüm araçlar" : `${a.tools.length} araç`} · ${a.skills.length === 0 ? "Tüm skill'ler" : `${a.skills.length} skill`}`}
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
                    )}
                  </ScrollArea>
                </section>
              </ResizablePanel>

              <ResizableHandle
                withHandle
                className={panelResizeHandleClass}
              />

              <ResizablePanel
                id="agents-detail"
                minSize="30%"
                className="min-h-0 min-w-0 flex-1"
              >
                <section className={cn(panelCardClass, "h-full min-w-0")}>
                  <div className={panelHeaderClass}>
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <Bot className={panelHeaderIconClass} aria-hidden />
                        <span className={panelHeaderTitleClass}>{detailTitle}</span>
                      </div>
                      {selectedAgent ? (
                        <span className={panelHeaderSubtitleClass}>
                          {selectedAgent.tools.length === 0 ? "Tüm araçlar" : `${selectedAgent.tools.length} araç`} · {selectedAgent.skills.length === 0 ? "Tüm skill'ler" : `${selectedAgent.skills.length} skill`}
                        </span>
                      ) : null}
                    </div>
                    {selection != null ? (
                      <div className="flex shrink-0 items-center gap-1 self-center">
                        <Button
                          type="button"
                          size="sm"
                          className="h-7 px-3 text-[11.5px]"
                          onClick={() => editorRef.current?.save()}
                        >
                          Kaydet
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2.5 text-[11.5px]"
                          onClick={() =>
                            selection.id == null
                              ? setSelection(null)
                              : setFormRev((r) => r + 1)
                          }
                          title="Değişiklikleri geri al"
                        >
                          Vazgeç
                        </Button>
                      </div>
                    ) : null}
                  </div>
                  <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                    <ScrollArea className="h-0 min-h-0 w-full flex-1">
                      <div className="@container/agent-detail p-3">
                        {selection == null ? (
                          <div className="flex h-full min-h-48 flex-col items-center justify-center gap-2 text-center">
                            <Filter className="size-5 text-muted-foreground/50" />
                            <p className="max-w-60 text-[12px] text-muted-foreground">
                              Soldan bir ajan seçin veya + ile oluşturun.
                            </p>
                          </div>
                        ) : (
                          <AgentEditor
                            key={`${selection.id ?? "new-agent"}-${formRev}`}
                            agent={selectedAgent}
                            editorRef={editorRef}
                            onSaved={(id) => setSelection({ id })}
                            onDeleted={() => setSelection(null)}
                          />
                        )}
                      </div>
                    </ScrollArea>
                  </div>
                </section>
              </ResizablePanel>
            </ResizablePanelGroup>
          </div>
        </ModuleNavPane>
      </WorkspaceAiDock>
    </div>
  );
}
