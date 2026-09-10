"use client";

import * as React from "react";
import { useUserSkillsStore } from "@/lib/stores/user-skills";
import {
  validateUserSkill,
  validateUserSkillFile,
  userSkillFilesSize,
  USER_SKILL_FILES_TOTAL_MAX_CHARS,
  buildUserSkillMarkdown,
  type UserSkill,
  type UserSkillFile,
} from "@/lib/yula-user-skill";
import {
  BUILT_IN_SKILL_FILES,
  BUILT_IN_SKILL_SOURCES,
} from "@/lib/built-in-skills";
import { getRailWorkspaces } from "@/lib/workspace-registry";
import { getRegisteredYulaCommands } from "@/components/layout/yula-commands";
import { TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Paperclip, Plus } from "lucide-react";
import { DetailTimeline } from "@/components/layout/detail-timeline";
import { FormGrid } from "@/components/layout/form-grid";
import { DetailAsidePanel, type DetailMetaRow } from "@/components/layout/detail-aside";
import { DetailFormLayout } from "@/components/layout/detail-form-layout";
import {
  FILE_KIND_LABEL,
  fileChipClass,
  fileDotClass,
  fileKindForName,
  type FileKind,
} from "@/components/layout/file-kind";
import { formatMetaDate } from "@/utils/format";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CriteriaSimpleCombobox } from "@/features/report-criteria";

/**
 * Sağ panel skill düzenleyici modu: `new` (boş form), `edit` (kullanıcı
 * skill'i düzenleme), `view` (yerleşik skill salt-okunur görüntüleme).
 */
export type SkillEditorMode = "new" | "edit" | "view";

/**
 * Sağ panel skill düzenleyici. Tek render yolu: `view` modu yalnızca
 * girdileri `disabled` yapar, görünüm aynı bileşenle birebir aynı kalır.
 * Kaydet/Sil/Dosya-ekle başlık toolbar'ından çağrılır (editorRef üzerinden;
 * `view` modda null).
 * Sekme içerikleri buradadır (`genel` / `skillmd` / `file:*`); sekme şeridi
 * görünümde (`SkillManagementView`) yaşar, dosya sekmeleri onFileTabsChange
 * ile yukarı bildirilir.
 * Form dili stock/item örneğindeki gibidir (Field + h-9 girdiler).
 */
export interface SkillEditorHandle {
  save: () => void;
  remove: () => void;
  pickFile: () => void;
}

export interface SkillDetailFileTab {
  key: string;
  label: string;
  title?: string;
  kind: FileKind;
}

export function SkillEditor({
  skill,
  mode,
  showTimeline = true,
  editorRef,
  onSaved,
  onDeleted,
  onFileTabsChange,
}: {
  skill: UserSkill | null;
  mode: SkillEditorMode;
  /** Kayıt geçmişi (alt timeline) görünürlüğü — başlık düğmesinden yönetilir */
  showTimeline?: boolean;
  editorRef: { current: SkillEditorHandle | null };
  onSaved: (id: string) => void;
  onDeleted: () => void;
  onFileTabsChange?: (tabs: SkillDetailFileTab[]) => void;
}) {
  // Tek görünüm: `view` modu yalnızca disabled eder (ebeveyn `key` ile
  // remount ettiği için state başlangıcı her seçimde skill'den gelir).
  const isRO = mode === "view";

  const skills = useUserSkillsStore((s) => s.skills);
  const upsertSkill = useUserSkillsStore((s) => s.upsertSkill);
  const deleteSkill = useUserSkillsStore((s) => s.deleteSkill);

  const [slash, setSlash] = React.useState(skill?.slash ?? "");
  const [label, setLabel] = React.useState(skill?.label ?? "");
  const [description, setDescription] = React.useState(skill?.description ?? "");
  // Tek kaynak: SKILL.md gövdesi (= prompt). Genel sekmesinde ayrı Prompt
  // alanı yok; SKILL.md sekmesindeki ham markdown editöründen düzenlenir.
  const [skillMd, setSkillMd] = React.useState(skill?.prompt ?? "");
  const [scope, setScope] = React.useState(skill?.scope ?? "global");
  const [files, setFiles] = React.useState<UserSkillFile[]>(skill?.files ?? []);
  const [error, setError] = React.useState<string | null>(null);
  const [fileError, setFileError] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  // Aynı slash farklı workspace kapsamında serbest; sistem + global +
  // aynı kapsamdakilerle çakışma yasak (kendisi hariç).
  const takenSlashes = [
    ...new Set([
      ...getRegisteredYulaCommands()
        .filter((c) => c.source !== "user")
        .map((c) => c.slash.toLowerCase()),
      ...skills
        .filter(
          (k) =>
            k.id !== skill?.id &&
            ((k.scope ?? "global") === "global" || (k.scope ?? "global") === scope),
        )
        .map((k) => k.slash.toLowerCase()),
    ]),
  ];

  const handleSave = () => {
    const err = validateUserSkill(
      { slash, label, prompt: skillMd },
      takenSlashes,
    );
    if (err) {
      setError(err);
      return;
    }
    const saved = upsertSkill({
      id: skill?.id,
      slash,
      label,
      description,
      prompt: skillMd,
      scope,
      files,
    });
    onSaved(saved.id);
  };

  const handleDelete = () => {
    if (!skill) return;
    deleteSkill(skill.id);
    onDeleted();
  };

  const handlePickFiles = (list: FileList | null | undefined) => {
    setFileError(null);
    if (!list || list.length === 0) return;
    const picked = Array.from(list);
    void (async () => {
      const texts = await Promise.all(
        picked.map(
          (file) =>
            new Promise<{ name: string; content: string }>((resolve) => {
              const reader = new FileReader();
              reader.onerror = () => resolve({ name: file.name, content: "" });
              reader.onload = () =>
                resolve({
                  name: file.name,
                  content:
                    typeof reader.result === "string" ? reader.result : "",
                });
              reader.readAsText(file);
            }),
        ),
      );
      setFiles((prev) => {
        const next = [...prev];
        for (const candidate of texts) {
          const err = validateUserSkillFile(
            candidate,
            next.map((f) => f.name),
          );
          if (err) {
            setFileError(err);
            continue;
          }
          if (
            userSkillFilesSize(next) + candidate.content.length >
            USER_SKILL_FILES_TOTAL_MAX_CHARS
          ) {
            setFileError("Toplam dosya boyutu 200K karakteri geçemez.");
            continue;
          }
          next.push(candidate);
        }
        return next;
      });
    });
  };

  const handleRemoveFile = (key: string) => {
    setFiles((prev) =>
      prev.filter((p) => `file:${p.name.toLowerCase()}` !== key),
    );
  };

  const builtinFiles = isRO && skill ? (BUILT_IN_SKILL_FILES[skill.slash] ?? []) : [];
  const builtinMd = isRO && skill ? BUILT_IN_SKILL_SOURCES[skill.slash] : undefined;

  // Betik metinleri demete gömülü değildir (.mjs ham-importu tüm projeyi
  // bozar); salt-okunur önizleme için sunucu rotasından tembel yüklenir.
  const [scriptContents, setScriptContents] = React.useState<Record<string, string>>({});
  const [scriptsLoading, setScriptsLoading] = React.useState(false);

  React.useEffect(() => {
    if (!(isRO && skill)) return;
    const missing = (BUILT_IN_SKILL_FILES[skill.slash] ?? []).filter(
      (f) =>
        f.kind === "script" && !f.content && scriptContents[f.path] === undefined,
    );
    if (missing.length === 0) return;
    let cancelled = false;
    setScriptsLoading(true);
    void (async () => {
      const settled = await Promise.all(
        missing.map(async (f) => {
          try {
            const res = await fetch(
              `/api/skills/file?path=${encodeURIComponent(f.path)}`,
            );
            if (!res.ok) return null;
            const data = (await res.json()) as { content?: unknown };
            return typeof data.content === "string"
              ? ([f.path, data.content] as const)
              : null;
          } catch {
            return null;
          }
        }),
      );
      if (cancelled) return;
      setScriptContents((prev) => {
        const next = { ...prev };
        for (const entry of settled) {
          if (entry) next[entry[0]] = entry[1];
        }
        return next;
      });
      setScriptsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [isRO, skill, scriptContents]);

  const fileTabs = React.useMemo<SkillDetailFileTab[]>(() => {
    if (isRO && skill) {
      const fs = BUILT_IN_SKILL_FILES[skill.slash] ?? [];
      return fs.map((f) => {
        const label = f.path.split("/").pop() ?? f.path;
        return {
          key: `file:${f.path}`,
          label,
          title: f.path,
          kind: f.kind === "script" ? ("script" as const) : fileKindForName(label),
        };
      });
    }
    if (!isRO) {
      return files.map((f) => ({
        key: `file:${f.name.toLowerCase()}`,
        label: f.name,
        title: f.name,
        kind: fileKindForName(f.name),
      }));
    }
    return [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRO, skill, files]);

  React.useEffect(() => {
    editorRef.current = isRO
      ? null
      : {
          save: handleSave,
          remove: handleDelete,
          pickFile: () => fileInputRef.current?.click(),
        };
  });

  React.useEffect(() => {
    onFileTabsChange?.(fileTabs);
  }, [fileTabs, onFileTabsChange]);

  const scopeOptions = React.useMemo(
    () => [
      { value: "global", label: "Global (her yerde)" },
      ...getRailWorkspaces().map((w) => ({ value: w.id, label: w.name })),
    ],
    [],
  );

  // SKILL.md önizlemesi: yerleşiklerde paketlenmiş tam dosya, kullanıcılarda
  // Genel alanlarından üretilen canlı dosya.
  const skillMdPreview = isRO
    ? (builtinMd ??
      buildUserSkillMarkdown({
        slash: skill?.slash ?? slash,
        label: skill?.label ?? label,
        description: skill?.description ?? description,
        scope: skill?.scope ?? scope,
        prompt: skill?.prompt ?? skillMd,
      }))
    : buildUserSkillMarkdown({
        slash,
        label,
        description,
        scope,
        prompt: skillMd,
      });

  // Dosya sekmeleri için birleşik satırlar: aynı sıra (tip rozeti + ham
  // editör + alt bilgi), yalnızca disabled/kaynak farklı.
  const fileRows: Array<{
    key: string;
    name: string;
    content: string | undefined;
    kind: FileKind;
  }> = isRO
    ? builtinFiles.map((f) => {
        const name = f.path.split("/").pop() ?? f.path;
        return {
          key: `file:${f.path}`,
          name,
          content: f.content ?? scriptContents[f.path],
          kind: f.kind === "script" ? ("script" as const) : fileKindForName(name),
        };
      })
    : files.map((f) => ({
        key: `file:${f.name.toLowerCase()}`,
        name: f.name,
        content: f.content,
        kind: fileKindForName(f.name),
      }));

  // Sağ meta panel satırları (item aside deseni): kullanıcı
  // skill'lerinde tarihler; yerleşik ve yeni kayıtta basılmaz.
  const skillMetaRows: DetailMetaRow[] = (() => {
    if (!isRO && skill) {
      return [
        {
          key: "created",
          title: "Oluşturuldu",
          detail: formatMetaDate(skill.createdAt),
        },
        {
          key: "updated",
          title: "Son düzenleme",
          detail: formatMetaDate(skill.updatedAt),
        },
      ];
    }
    return [];
  })();

  return (
    <>
      <TabsContent value="genel" className="mt-0">
        <DetailFormLayout
          containerName="skill-detail"
          content={
            <>
              <FormGrid twoColClass="@[40rem]/skill-detail:grid-cols-2">
            <Field>
              <FieldLabel className="text-xs text-muted-foreground">
                Slash adı <span className="font-mono">/ornek-skill</span>
              </FieldLabel>
              <Input
                value={isRO ? (skill?.slash ?? slash) : slash}
                onChange={isRO ? undefined : (e) => setSlash(e.target.value)}
                placeholder="haftalik-ozet"
                disabled={isRO}
                readOnly={isRO}
                className="bg-muted/30 border-muted-foreground/20 font-medium h-9 text-xs font-mono data-disabled:opacity-80"
              />
            </Field>
            <Field>
              <FieldLabel className="text-xs text-muted-foreground">
                Kapsam
              </FieldLabel>
              <CriteriaSimpleCombobox
                variant="form"
                value={isRO ? (skill?.scope ?? scope) : scope}
                onChange={(v) => setScope(v || "global")}
                options={scopeOptions}
                disabled={isRO}
              />
            </Field>
          </FormGrid>
          <Field>
            <FieldLabel className="text-xs text-muted-foreground">
              Başlık
            </FieldLabel>
            <Input
              value={isRO ? (skill?.label ?? label) : label}
              onChange={isRO ? undefined : (e) => setLabel(e.target.value)}
              placeholder="Haftalık özet"
              disabled={isRO}
              readOnly={isRO}
              className="bg-muted/30 border-muted-foreground/20 font-medium h-9 text-xs data-disabled:opacity-80"
            />
          </Field>
          <Field>
            <FieldLabel className="text-xs text-muted-foreground">
              Açıklama
            </FieldLabel>
            <Textarea
              value={isRO ? (skill?.description ?? description) : description}
              onChange={isRO ? undefined : (e) => setDescription(e.target.value)}
              placeholder="Ne zaman kullanılır?"
              disabled={isRO}
              readOnly={isRO}
              rows={3}
              className="bg-muted/30 border-muted-foreground/20 text-xs resize-y min-h-16 whitespace-pre-wrap data-disabled:opacity-80"
            />
          </Field>
          {!isRO && fileError ? (
            <p className="text-[12px] text-red-600 dark:text-red-400">{fileError}</p>
          ) : null}
          {!isRO && error ? (
            <p className="text-[12px] text-red-600 dark:text-red-400">{error}</p>
          ) : null}
            </>
          }
          aside={
            isRO ? undefined : (
            <DetailAsidePanel
              addControl={
                !isRO ? (
                  <Button
                    variant="ghost"
                    className="w-full justify-between h-8 text-xs font-normal px-2 text-muted-foreground hover:text-foreground"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <span className="flex items-center gap-2">
                      <Paperclip className="size-3.5" />
                      Ek dosyalar
                    </span>
                    <Plus className="size-3.5" />
                  </Button>
                ) : undefined
              }
              files={
                isRO && skill
                  ? builtinFiles.map((f) => {
                      const name = f.path.split("/").pop() ?? f.path;
                      return {
                        key: `file:${f.path}`,
                        name,
                        dotClassName: fileDotClass(
                          f.kind === "script"
                            ? ("script" as const)
                            : fileKindForName(name),
                        ),
                      };
                    })
                  : files.map((f) => ({
                      key: `file:${f.name.toLowerCase()}`,
                      name: f.name,
                      dotClassName: fileDotClass(fileKindForName(f.name)),
                    }))
              }
              onRemoveFile={!isRO ? handleRemoveFile : undefined}
              metaRows={skillMetaRows}
              metaBare
              emptyTitle="Henüz bilgi yok"
              emptyDescription="Kaydedildiğinde oluşturma bilgileri burada görünür."
              isNew={!skill}
            />
            )
          }
          timeline={
            showTimeline ? (
              <DetailTimeline
                recordName={skill?.slash}
                createdAt={isRO ? undefined : skill?.createdAt}
                updatedAt={isRO ? undefined : skill?.updatedAt}
                builtinSource={
                  isRO && skill ? `skills/${skill.slash}/SKILL.md` : undefined
                }
                recordKey={skill ? `skill:${skill.id}` : undefined}
              />
            ) : undefined
          }
        />
      </TabsContent>
      <TabsContent value="skillmd" className="mt-0 flex min-h-[60vh] flex-col min-w-0">
        {skillMdPreview ? (
          <Textarea
            value={isRO ? (skill?.prompt ?? skillMd) : skillMd}
            onChange={isRO ? undefined : (e) => setSkillMd(e.target.value)}
            placeholder="Son 7 günün satış özetini çıkar: {{input}}"
            disabled={isRO}
             readOnly={isRO}
             rows={1}
             aria-label="SKILL.md ham markdown"
             className="min-h-[60vh] w-full flex-1 rounded-none border-0 bg-transparent px-0 font-mono text-xs shadow-none resize-none focus-visible:border-0 focus-visible:ring-0 data-disabled:opacity-80"
          />
        ) : (
          <p className="text-[11.5px] text-muted-foreground">
            SKILL.md bulunamadı.
          </p>
        )}
      </TabsContent>
      {fileRows.map((f) => (
        <TabsContent key={f.key} value={f.key} className="mt-0 flex flex-col min-w-0">
          <div className="mb-1.5 flex items-center gap-1.5">
            <span
              className={`rounded px-1.5 py-px font-mono text-[10px] font-medium ${fileChipClass(f.kind)}`}
            >
              {FILE_KIND_LABEL[f.kind]}
            </span>
            {f.kind === "script" && isRO ? (
              <span className="text-[10.5px] text-muted-foreground">
                Sunucu sandbox&apos;ında çalışır
              </span>
            ) : null}
          </div>
          {f.content ? (
            <Textarea
              value={f.content}
              onChange={
                isRO
                  ? undefined
                  : (e) =>
                      setFiles((prev) =>
                        prev.map((p) =>
                          `file:${p.name.toLowerCase()}` === f.key
                            ? { ...p, content: e.target.value }
                            : p,
                       ),
                     )}
                     rows={1}
                     disabled={isRO}
                     readOnly={isRO}
                     aria-label={`${f.name} ham metin`}
                     className="h-full w-full rounded-none border-0 bg-transparent px-0 font-mono text-xs shadow-none focus-visible:border-0 focus-visible:ring-0 data-disabled:opacity-80"
                   />
          ) : scriptsLoading ? (
            <p className="text-[11.5px] text-muted-foreground">
              Yükleniyor…
            </p>
          ) : (
            <p className="rounded-md border border-border/60 bg-muted/20 px-2.5 py-1.5 text-[11px] text-muted-foreground">
              <span className="mr-1.5 rounded bg-emerald-500/15 px-1.5 py-px font-mono text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
                betik
              </span>
              Sunucu sandbox&apos;ında çalışır (run_skill_script).
            </p>
          )}
          <div className="mt-1.5 flex items-center justify-between">
            <span className="font-mono text-[10px] text-muted-foreground/70">
              {f.content ? `${(f.content.length / 1024).toFixed(1)}K` : "—"}
            </span>
            {!isRO ? (
              <button
                type="button"
                onClick={() => handleRemoveFile(f.key)}
                className="rounded-md px-2 py-1 text-[11.5px] text-muted-foreground hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400"
              >
                Kaldır
              </button>
            ) : null}
          </div>
        </TabsContent>
      ))}
      {!isRO ? (
        <input
          ref={fileInputRef}
          type="file"
          accept=".md,.markdown,.txt,.json"
          multiple
          className="hidden"
          onChange={(e) => {
            handlePickFiles(e.target.files);
            e.target.value = "";
          }}
        />
      ) : null}
    </>
  );
}
