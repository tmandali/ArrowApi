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
  panelResizeHandleClass,
} from "@/components/layout/panel-chrome";
import { cn } from "@/utils/cn";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Filter } from "lucide-react";
import { useUserSkillsStore } from "@/lib/stores/user-skills";
import type { UserSkill } from "@/lib/yula-user-skill";
import { BUILT_IN_USER_SKILLS } from "@/lib/built-in-skills";
import { SkillEditor, type SkillEditorHandle, type SkillDetailFileTab, type SkillEditorMode } from "./skill-editor";
import { skillFileDotClass } from "./skill-file-kind";

type Selection = { id: string | null; readOnly?: boolean } | null;

/**
 * Sistem → Skill'ler: executions-paneli deseninde master-detail.
 * Solda User/System sekmeli liste, sağda seçili skill'in düzenleme formu.
 */
export function SkillManagementView() {
  const userSkills = useUserSkillsStore((s) => s.skills);

  const [tab, setTab] = React.useState<"user" | "system">("user");
  const [selection, setSelection] = React.useState<Selection>(null);
  const editorRef = React.useRef<SkillEditorHandle | null>(null);
  const [formRev, setFormRev] = React.useState(0);
  const [fileTabs, setFileTabs] = React.useState<SkillDetailFileTab[]>([]);

  const isReadOnly = selection?.readOnly === true;

  // Sayfa modu: seçim yoksa editör basılmaz; yeni kayıt / görüntüleme /
  // düzenleme ayrımı enum ile taşınır.
  const mode: SkillEditorMode | null =
    selection == null
      ? null
      : selection.id == null
        ? "new"
        : selection.readOnly
          ? "view"
          : "edit";

  const systemSkills: Array<UserSkill & { readOnly: boolean }> =
    React.useMemo(
      () => BUILT_IN_USER_SKILLS.map((s) => ({ ...s, readOnly: true as const })),
      [],
    );
  const listed = tab === "user" ? userSkills : systemSkills;

  const selectedSkill =
    selection?.id != null
      ? ((tab === "user" ? userSkills : systemSkills).find(
          (s) => s.id === selection.id,
        ) ?? null)
      : null;
  const detailTabLabel =
    selection?.id != null
      ? `/${selectedSkill?.slash ?? "skill"}`
      : "Yeni skill";

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
              onClick={() => {
                setTab("user");
                setSelection({ id: null });
              }}
            >
              Yeni Skill
            </Button>
            {selection != null && !isReadOnly ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 px-2.5 text-[11.5px]"
                  onClick={() => editorRef.current?.pickFile()}
                >
                  Dosya ekle
                </Button>
                {selection.id != null ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2.5 text-[11.5px] text-muted-foreground hover:text-red-600 hover:bg-red-500/10 dark:hover:text-red-400"
                    onClick={() => editorRef.current?.remove()}
                  >
                    Sil
                  </Button>
                ) : null}
              </>
            ) : null}
            <AIChatAssistant />
          </>
        }
      >
        <PageHeaderTitle>Skill&apos;ler</PageHeaderTitle>
      </WorkspacePageHeader>

      <WorkspaceAiDock>
        <ModuleNavPane>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <ResizablePanelGroup
              orientation="horizontal"
              className="min-h-0 flex-1 overflow-hidden"
            >
              <ResizablePanel
                id="skills-list"
                defaultSize={360}
                minSize={320}
                maxSize={520}
                groupResizeBehavior="preserve-pixel-size"
                className="min-h-0 min-w-0"
              >
                <section className={cn(panelCardClass, "h-full")}>
                  <div className={panelHeaderClass}>
                    <div className="flex min-w-0 flex-1 items-center gap-1 rounded-md bg-muted/50 p-0.5">
                      {(["user", "system"] as const).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => {
                            setTab(t);
                            setSelection(null);
                          }}
                          className={cn(
                            "flex-1 rounded-md px-2 py-1 text-[11.5px] font-medium capitalize transition-colors",
                            tab === t
                              ? "bg-background text-foreground shadow-xs"
                              : "text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {t === "user"
                            ? `User (${userSkills.length})`
                            : `System (${systemSkills.length})`}
                        </button>
                      ))}
                    </div>
                  </div>
                  <ScrollArea className="h-0 min-h-0 w-full flex-1">
                    {listed.length === 0 ? (
                      <div className="flex h-full min-h-48 items-center justify-center p-4">
                        <p className="text-center text-[12px] text-muted-foreground">
                          Henüz kullanıcı skill&apos;i yok — Yeni Skill ile
                          tanımlayın.
                        </p>
                      </div>
                    ) : (
                      <ul className="divide-y divide-border/60 border-b border-border/60">
                        {listed.map((s) => {
                          const selected = selection?.id === s.id;
                          return (
                            <li key={s.id} className="w-full">
                              <button
                                type="button"
                                onClick={() =>
                                  setSelection({
                                    id: s.id,
                                    readOnly: "readOnly" in s && s.readOnly === true,
                                  })
                                }
                                aria-current={selected ? "true" : undefined}
                                className={cn(
                                  "flex w-full flex-col gap-1 px-4 py-2.5 text-left transition-colors hover:bg-muted/80",
                                  selected &&
                                    "bg-primary/[0.07] hover:bg-primary/10 dark:bg-primary/15",
                                )}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="min-w-0 truncate font-mono text-[12px] font-semibold text-foreground">
                                    /{s.slash}
                                  </span>
                                  {(s.scope ?? "global") !== "global" ? (
                                    <span className="shrink-0 rounded border border-border px-1 py-px text-[10px] font-medium text-muted-foreground">
                                      {s.scope}
                                    </span>
                                  ) : null}
                                </div>
                                <div className="truncate text-[11px] text-muted-foreground">
                                  {s.description || s.label}
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
                id="skills-detail"
                minSize="30%"
                className="min-h-0 min-w-0 flex-1"
              >
                <section className={cn(panelCardClass, "h-full min-w-0")}>
                  <Tabs
                    key={selection?.id ?? "new-skill"}
                    defaultValue="genel"
                    className="flex min-h-0 flex-1 flex-col overflow-hidden"
                  >
                  <div className={panelHeaderClass}>
                    {selection != null ? (
                      <TabsList variant="line" className="min-w-0 flex-1 justify-start overflow-x-auto no-scrollbar">
                        <TabsTrigger value="genel" style={{ flex: "0 0 auto" }} className="max-w-48 font-mono">
                          <span className="truncate">{detailTabLabel}</span>
                        </TabsTrigger>
                        <TabsTrigger value="skillmd" style={{ flex: "0 0 auto" }}>
                          SKILL.md
                        </TabsTrigger>
                        {fileTabs.map((t) => (
                          <TabsTrigger
                            key={t.key}
                            value={t.key}
                            style={{ flex: "0 0 auto" }}
                            className="max-w-40 font-mono text-[11px]"
                            title={t.title ?? t.key}
                          >
                            <span
                              aria-hidden
                              className={cn("size-1.5 shrink-0 rounded-full", skillFileDotClass(t.kind))}
                            />
                            <span className="truncate">{t.label}</span>
                          </TabsTrigger>
                        ))}
                      </TabsList>
                    ) : (
                      <div className="min-w-0 flex-1" />
                    )}
                    {selection != null && !isReadOnly ? (
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
                      <div className="@container/skill-detail p-3">
                        {selection == null ? (
                          <div className="flex h-full min-h-48 flex-col items-center justify-center gap-2 text-center">
                            <Filter className="size-5 text-muted-foreground/50" />
                            <p className="max-w-60 text-[12px] text-muted-foreground">
                              Soldan bir skill seçin veya + ile oluşturun.
                            </p>
                          </div>
                        ) : (
                          <SkillEditor
                            key={`${selection.id ?? "new-skill"}-${formRev}`}
                            skill={selectedSkill}
                            mode={mode ?? "new"}
                            editorRef={editorRef}
                            onSaved={(id) =>
                              setSelection({ id, readOnly: false })
                            }
                            onDeleted={() => setSelection(null)}
                            onFileTabsChange={setFileTabs}
                          />
                        )}
                      </div>
                    </ScrollArea>
                  </div>
                  </Tabs>
                </section>
              </ResizablePanel>
            </ResizablePanelGroup>
          </div>
        </ModuleNavPane>
      </WorkspaceAiDock>
    </div>
  );
}
