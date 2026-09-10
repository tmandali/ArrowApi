"use client";

import * as React from "react";
import { useUserSkillsStore } from "@/lib/stores/user-skills";
import {
  validateUserSkill,
  validateUserSkillFile,
  userSkillFilesSize,
  USER_SKILL_FILES_TOTAL_MAX_CHARS,
  buildUserSkillMarkdown,
  languageForPath,
  isMarkdownPath,
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
import { CodeBlock } from "@/components/ui/code-block";
import { MarkdownDoc } from "./skill-markdown-doc";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CriteriaSimpleCombobox } from "@/features/report-criteria";

/**
 * Sağ panel skill düzenleyici (null = yeni skill; readOnly = yerleşik salt-okunur).
 * Kaydet/Sil/Dosya-ekle başlık toolbar'ından çağrılır (editorRef üzerinden).
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
}

export function SkillEditor({
  skill,
  readOnly,
  editorRef,
  onSaved,
  onDeleted,
  onFileTabsChange,
}: {
  skill: UserSkill | null;
  readOnly?: boolean;
  editorRef: { current: SkillEditorHandle | null };
  onSaved: (id: string) => void;
  onDeleted: () => void;
  onFileTabsChange?: (tabs: SkillDetailFileTab[]) => void;
}) {
  const skills = useUserSkillsStore((s) => s.skills);
  const upsertSkill = useUserSkillsStore((s) => s.upsertSkill);
  const deleteSkill = useUserSkillsStore((s) => s.deleteSkill);

  const [slash, setSlash] = React.useState(skill?.slash ?? "");
  const [label, setLabel] = React.useState(skill?.label ?? "");
  const [description, setDescription] = React.useState(skill?.description ?? "");
  const [prompt, setPrompt] = React.useState(skill?.prompt ?? "");
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
    const err = validateUserSkill({ slash, label, prompt }, takenSlashes);
    if (err) {
      setError(err);
      return;
    }
    const saved = upsertSkill({
      id: skill?.id,
      slash,
      label,
      description,
      prompt,
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

  const handlePickFile = (file: File | undefined) => {
    setFileError(null);
    if (!file) return;
    const reader = new FileReader();
    reader.onerror = () =>
      setFileError(`"${file.name}" okunamadı.`);
    reader.onload = () => {
      const content = typeof reader.result === "string" ? reader.result : "";
      const candidate = { name: file.name, content };
      const err = validateUserSkillFile(
        candidate,
        files.map((f) => f.name),
      );
      if (err) {
        setFileError(err);
        return;
      }
      if (
        userSkillFilesSize(files) + content.length >
        USER_SKILL_FILES_TOTAL_MAX_CHARS
      ) {
        setFileError("Toplam dosya boyutu 200K karakteri geçemez.");
        return;
      }
      setFiles((prev) => [...prev, candidate]);
    };
    reader.readAsText(file);
  };

  const builtinFiles = readOnly && skill ? (BUILT_IN_SKILL_FILES[skill.slash] ?? []) : [];
  const builtinMd = readOnly && skill ? BUILT_IN_SKILL_SOURCES[skill.slash] : undefined;

  // Betik metinleri demete gömülü değildir (.mjs ham-importu tüm projeyi
  // bozar); salt-okunur önizleme için sunucu rotasından tembel yüklenir.
  const [scriptContents, setScriptContents] = React.useState<Record<string, string>>({});
  const [scriptsLoading, setScriptsLoading] = React.useState(false);

  React.useEffect(() => {
    if (!(readOnly && skill)) return;
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
  }, [readOnly, skill, scriptContents]);

  const fileTabs = React.useMemo<SkillDetailFileTab[]>(() => {
    if (readOnly && skill) {
      const fs = BUILT_IN_SKILL_FILES[skill.slash] ?? [];
      return fs.map((f) => ({
        key: `file:${f.path}`,
        label: f.path.split("/").pop() ?? f.path,
        title: f.path,
      }));
    }
    if (!readOnly) {
      return files.map((f) => ({
        key: `file:${f.name.toLowerCase()}`,
        label: f.name,
        title: f.name,
      }));
    }
    return [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly, skill, files]);

  React.useEffect(() => {
    editorRef.current = readOnly
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

  if (readOnly && skill) {
    const props: Array<[string, string]> = [
      ["Slash", `/${skill.slash}`],
      ["Başlık", skill.label || "—"],
      ["Açıklama", skill.description || "—"],
      ["Kapsam", skill.scope ?? "global"],
      ["Kaynak", `skills/${skill.slash}/SKILL.md`],
    ];
    return (
      <>
        <TabsContent value="genel" className="mt-0">
          <div className="min-w-0 space-y-5">
            <div className="grid grid-cols-1 gap-x-10 gap-y-5 @[40rem]/skill-detail:grid-cols-2">
              {props.map(([k, v]) => (
                <div key={k} className="min-w-0">
                  <p className="text-xs text-muted-foreground">{k}</p>
                  <p className="mt-0.5 truncate text-[12px] font-medium text-foreground" title={v}>
                    {v}
                  </p>
                </div>
              ))}
            </div>
            <Field>
              <FieldLabel className="text-xs text-muted-foreground">
                Prompt
              </FieldLabel>
              <pre className="overflow-auto rounded-md border border-border/60 bg-muted/30 p-2.5 font-mono text-[11.5px] leading-relaxed whitespace-pre-wrap">
                {skill.prompt}
              </pre>
            </Field>
            <p className="text-[11.5px] text-muted-foreground">
              Yerleşik skill&apos;ler salt-okunurdur.
            </p>
          </div>
        </TabsContent>
        <TabsContent value="skillmd" className="mt-0">
          {builtinMd ? (
            <MarkdownDoc value={builtinMd} />
          ) : (
            <p className="text-[11.5px] text-muted-foreground">
              SKILL.md bulunamadı.
            </p>
          )}
        </TabsContent>
        {builtinFiles.map((f) => {
          const content = f.content ?? scriptContents[f.path];
          return (
            <TabsContent key={f.path} value={`file:${f.path}`} className="mt-0">
              {content ? (
                isMarkdownPath(f.path) ? (
                  <MarkdownDoc value={content} />
                ) : (
                  <CodeBlock
                    value={content}
                    language={languageForPath(f.path)}
                    className="max-h-none overflow-visible rounded-none border-0"
                  />
                )
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
            </TabsContent>
          );
        })}
      </>
    );
  }

  return (
    <>
      <TabsContent value="genel" className="mt-0">
        <div className="min-w-0 space-y-5">
          <div className="grid grid-cols-1 gap-x-10 gap-y-5 @[40rem]/skill-detail:grid-cols-2">
            <Field>
              <FieldLabel className="text-xs text-muted-foreground">
                Slash adı <span className="font-mono">/ornek-skill</span>
              </FieldLabel>
              <Input
                value={slash}
                onChange={(e) => setSlash(e.target.value)}
                placeholder="haftalik-ozet"
                className="bg-muted/30 border-muted-foreground/20 font-medium h-9 text-xs font-mono"
              />
            </Field>
            <Field>
              <FieldLabel className="text-xs text-muted-foreground">
                Başlık
              </FieldLabel>
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Haftalık özet"
                className="bg-muted/30 border-muted-foreground/20 font-medium h-9 text-xs"
              />
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-x-10 gap-y-5 @[40rem]/skill-detail:grid-cols-2">
            <Field>
              <FieldLabel className="text-xs text-muted-foreground">
                Açıklama
              </FieldLabel>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ne zaman kullanılır?"
                className="bg-muted/30 border-muted-foreground/20 font-medium h-9 text-xs"
              />
            </Field>
            <Field>
              <FieldLabel className="text-xs text-muted-foreground">
                Kapsam
              </FieldLabel>
              <CriteriaSimpleCombobox
                variant="form"
                value={scope}
                onChange={(v) => setScope(v || "global")}
                options={[
                  { value: "global", label: "Global (her yerde)" },
                  ...getRailWorkspaces().map((w) => ({ value: w.id, label: w.name })),
                ]}
              />
            </Field>
          </div>
          <Field>
            <FieldLabel className="text-xs text-muted-foreground">
              Prompt ({"{{input}}"} kullanıcının ek metniyle değişir)
            </FieldLabel>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Son 7 günün satış özetini çıkar: {{input}}"
              rows={8}
              className="bg-muted/30 border-muted-foreground/20 font-mono text-xs resize-y"
            />
          </Field>
          {fileError ? (
            <p className="text-[12px] text-red-600 dark:text-red-400">{fileError}</p>
          ) : null}
          {error ? (
            <p className="text-[12px] text-red-600 dark:text-red-400">{error}</p>
          ) : null}
        </div>
      </TabsContent>
      <TabsContent value="skillmd" className="mt-0">
        <MarkdownDoc
          value={buildUserSkillMarkdown({ slash, label, description, scope, prompt })}
        />
        <p className="mt-1.5 text-[11.5px] text-muted-foreground">
          Önizleme — Genel sekmesindeki alanlardan üretilir, ayrıca kaydedilmez.
        </p>
      </TabsContent>
      {files.map((f) => (
        <TabsContent
          key={f.name.toLowerCase()}
          value={`file:${f.name.toLowerCase()}`}
          className="mt-0"
        >
          {isMarkdownPath(f.name) ? (
            <MarkdownDoc value={f.content} />
          ) : (
            <CodeBlock
              value={f.content}
              language={languageForPath(f.name)}
              className="max-h-none overflow-visible rounded-none border-0"
            />
          )}
          <div className="mt-1.5 flex items-center justify-between">
            <span className="font-mono text-[10px] text-muted-foreground/70">
              {(f.content.length / 1024).toFixed(1)}K
            </span>
            <button
              type="button"
              onClick={() =>
                setFiles((prev) =>
                  prev.filter(
                    (p) => p.name.toLowerCase() !== f.name.toLowerCase(),
                  ),
                )
              }
              className="rounded-md px-2 py-1 text-[11.5px] text-muted-foreground hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400"
            >
              Kaldır
            </button>
          </div>
        </TabsContent>
      ))}
      <input
        ref={fileInputRef}
        type="file"
        accept=".md,.markdown,.txt,.json"
        className="hidden"
        onChange={(e) => {
          handlePickFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </>
  );
}
