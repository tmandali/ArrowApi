"use client";

import * as React from "react"
import { useTranslations } from "next-intl"
import { ManagementPageTemplate } from "@/components/layout/management-page-template";
import { AIChatAssistant } from "@/components/layout/ai-chat-assistant";
import {
  DetailHistoryToggle,
  type TabbedDetailTab,
} from "@/components/layout/tabbed-detail";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";
import { Check, Filter, FilePlus2, Trash2, X } from "lucide-react";
import { useUserSkillsStore, ensureExampleSkill } from "@/lib/stores/user-skills";
import { localizeUserSkills } from "@/lib/yula-user-skill";
import type { UserSkill } from "@/lib/yula-user-skill";
import { BUILT_IN_USER_SKILLS } from "@/lib/built-in-skills";
import { SkillEditor, type SkillEditorHandle, type SkillDetailFileTab, type SkillEditorMode } from "./skill-editor";
import { fileDotClass } from "@/components/layout/file-kind";

type Selection = { id: string | null; readOnly?: boolean } | null;

/**
 * Sistem → Skill Ayarları: executions-paneli deseninde master-detail.
 * Solda User/System sekmeli liste, sağda seçili skill'in düzenleme formu.
 */
export function SkillManagementView() {
  const t = useTranslations("SkillManagement")
  const ts = useTranslations("Skills")
  const userSkills = useUserSkillsStore((s) => s.skills);
  const deleteSkill = useUserSkillsStore((s) => s.deleteSkill);

  const [tab, setTab] = React.useState<"user" | "system">("user");
  const [selection, setSelection] = React.useState<Selection>(null);
  const editorRef = React.useRef<SkillEditorHandle | null>(null);
  const [fileTabs, setFileTabs] = React.useState<SkillDetailFileTab[]>([]);
  const [historyOpen, setHistoryOpen] = React.useState(true);
  // Yeni kayda geçerken bırakılan seçim — Vazgeç buraya döner.
  const lastSelectionRef = React.useRef<Selection>(null);

  // İlk bağlanışta örnek skill üret ve varsayılan seçiliyi belirle.
  // `ensureExampleSkill` localStorage'a erişir → SSR'de no-op,
  // bu yüzden ilk render'da selection = null kalır (hydration uyumlu).
  React.useEffect(() => {
    ensureExampleSkill();
    const first = useUserSkillsStore.getState().skills[0];
    if (first && selection == null) {
      setSelection({
        id: first.id,
        readOnly: "readOnly" in first && first.readOnly === true,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Sistem (yerleşik) skill metinleri `Skills` namespace'inden yerel dilde;
  // kullanıcı skill'leri de görünümda lokalize edilir — düzenleme formu
  // her zaman raw store metnini kullanır (kullanıcının kendi içeriği).
  const localizedUserSkills = React.useMemo(
    () => localizeUserSkills(userSkills, ts),
    [userSkills, ts],
  );
  const systemSkills: Array<UserSkill & { readOnly: boolean }> =
    React.useMemo(
      () =>
        localizeUserSkills(BUILT_IN_USER_SKILLS, ts).map(
          (s) => ({ ...s, readOnly: true as const }),
        ),
      [ts],
    );
  const listed = tab === "user" ? localizedUserSkills : systemSkills;

  const selectedSkill =
    selection?.id != null
      ? ((tab === "user" ? userSkills : systemSkills).find(
          (s) => s.id === selection.id,
        ) ?? null)
      : null;
  const detailTabLabel =
    selection?.id != null
      ? `/${selectedSkill?.slash ?? "skill"}`
      : t("new_skill");

  // Satır üzeri silme (executions deseni): hover'da beliren çöp kutusu.
  const handleRowDelete = (id: string) => {
    deleteSkill(id);
    if (selection?.id === id) setSelection(null);
  };

  const detailTabs: TabbedDetailTab[] = React.useMemo(
    () => [
      {
        value: "genel",
        label: detailTabLabel,
        className: "max-w-48 font-mono",
      },
      { value: "skillmd", label: "SKILL.md" },
      ...fileTabs.map((t) => ({
        value: t.key,
        label: (
          <>
            <span
              aria-hidden
              className={cn("size-1.5 shrink-0 rounded-full", fileDotClass(t.kind))}
            />
            <span className="truncate">{t.label}</span>
          </>
        ),
        title: t.title ?? t.key,
        className: "max-w-40 font-mono text-[11px]",
      })),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [detailTabLabel, fileTabs],
  );

  return (
    <ManagementPageTemplate
      title={
        <>
          Skill Ayarları
          {selection != null ? (
            <span className="font-normal text-muted-foreground">
              {" "}
              - {selection.id != null ? `/${selectedSkill?.slash ?? t("skill")}` : t("new_skill")}
            </span>
          ) : null}
        </>
      }
      mode={mode}
      listPanelId="skills-list"
      detailPanelId="skills-detail"
      actions={
        <>
          {selection != null ? (
            <DetailHistoryToggle
              open={historyOpen}
              onToggle={() => setHistoryOpen((v) => !v)}
            />
          ) : null}
          {selection?.id != null && !isReadOnly ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 px-2.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => editorRef.current?.remove()}
              title="Skill'i sil"
              aria-label="Skill'i sil"
            >
              <Trash2 className="size-3.5" />
              Delete
            </Button>
          ) : null}
          {(() => {
            const isNewMode = selection != null && selection.id == null;
            return (
              <Button
                type="button"
                variant={isNewMode ? "ghost" : "outline"}
                size="sm"
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
                    setTab("user");
                    setSelection({ id: null });
                  }
                }}
                title={isNewMode ? t("cancel") : t("new_skill")}
                aria-label={isNewMode ? t("cancel") : t("new_skill")}
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
          {selection != null && !isReadOnly ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 shrink-0 gap-1.5 border-primary/40 px-2.5 text-xs text-primary hover:bg-primary/10 hover:text-primary"
              onClick={() => editorRef.current?.save()}
            >
              <Check className="size-3.5" />
              Kaydet
            </Button>
          ) : null}
          <AIChatAssistant />
        </>
      }
      listHeader={
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
      }
      list={
        listed.length === 0 ? (
          <div className="flex h-full min-h-48 items-center justify-center p-4">
            <p className="text-center text-[12px] text-muted-foreground">
              {t("no_skills_yet")}
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
                                  "group flex w-full flex-col gap-1 px-4 py-2.5 text-left transition-colors hover:bg-muted/80",
                                  selected &&
                                    "bg-primary/[0.07] hover:bg-primary/10 dark:bg-primary/15",
                                )}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="min-w-0 truncate font-mono text-[12px] font-semibold text-foreground">
                                    /{s.slash}
                                  </span>
                                  <span className="flex shrink-0 items-center gap-1">
                                    {(s.scope ?? "global") !== "global" ? (
                                      <span className="rounded border border-border px-1 py-px text-[10px] font-medium text-muted-foreground">
                                        {s.scope}
                                      </span>
                                    ) : null}
                                    {tab === "user" ? (
                                      <span
                                        role="button"
                                        tabIndex={0}
                                        title={t("delete_skill")}
                                        aria-label={t("delete_skill_aria", { slash: s.slash })}
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          handleRowDelete(s.id);
                                        }}
                                        onKeyDown={(event) => {
                                          if (event.key === "Enter" || event.key === " ") {
                                            event.preventDefault();
                                            event.stopPropagation();
                                            handleRowDelete(s.id);
                                          }
                                        }}
                                        className="rounded border-0 bg-transparent p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
                                      >
                                        <Trash2 className="size-3.5" />
                                      </span>
                                    ) : null}
                                  </span>
                                </div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      {s.description || s.label}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )
      }
      tabs={detailTabs}
      tabResetKey={selection?.id ?? "new-skill"}
      showTabs={selection != null}
      containerClass="@container/skill-detail p-3"
      empty={
        <div className="flex h-full min-h-48 flex-col items-center justify-center gap-2 text-center">
          <Filter className="size-5 text-muted-foreground/50" />
          <p className="max-w-60 text-[12px] text-muted-foreground">
            {t("select_or_create")}
          </p>
        </div>
      }
    >
      {selection != null ? (
        <SkillEditor
          key={selection.id ?? "new-skill"}
          skill={selectedSkill}
          mode={mode ?? "new"}
          showTimeline={historyOpen}
          editorRef={editorRef}
          onSaved={(id) =>
            setSelection({ id, readOnly: false })
          }
          onDeleted={() => setSelection(null)}
          onFileTabsChange={setFileTabs}
        />
      ) : null}
    </ManagementPageTemplate>
  );
}
