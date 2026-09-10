"use client";

import * as React from "react";
import { useUserAgentsStore } from "@/lib/stores/user-agents";
import {
  AGENT_TOOL_CATALOG,
  AGENT_PROVIDER_OPTIONS,
  USER_AGENT_ATTACHMENTS_TOTAL_MAX_CHARS,
  agentAttachmentsSize,
  lintAgentInstructions,
  validateAgentAttachmentFile,
  validateUserAgent,
  type UserAgent,
  type UserAgentAttachment,
} from "@/lib/yula-user-agent";
import { useUserSkillsStore } from "@/lib/stores/user-skills";
import { BUILT_IN_USER_SKILLS } from "@/lib/built-in-skills";

import { getRailWorkspaces } from "@/lib/workspace-registry";
import { getRegisteredYulaCommands } from "@/components/layout/yula-commands";
import {
  readYulaClientAiConfig,
  yulaModelsApiUrl,
} from "@/lib/yula-ai-client-config";
import type { AIProviderType } from "@/lib/yula-config";
import { normalizeEffort, YULA_EFFORT_LABELS, type YulaEffort } from "@/lib/yula-reasoning";
import { TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Paperclip, Plus } from "lucide-react";
import { DetailTimeline } from "@/components/layout/detail-timeline";
import { FormGrid } from "@/components/layout/form-grid";
import { DetailFormLayout } from "@/components/layout/detail-form-layout";
import { DetailAsidePanel, type DetailMetaRow } from "@/components/layout/detail-aside";
import { formatMetaDate } from "@/utils/format";
import { AgentImageUpload } from "./agent-image-upload";
import {
  fileDotClass,
  fileKindForName,
} from "@/components/layout/file-kind";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  CriteriaSimpleCombobox,
  joinMultiValue,
  splitMultiValue,
} from "@/features/report-criteria";

/**
 * Sağ panel ajan düzenleyici modu: `new` (boş form), `edit` (düzenleme),
 * `view` (salt-okunur görüntüleme — yerleşik ajanlar için ayrıldı).
 */
export type AgentEditorMode = "new" | "edit" | "view";

/**
 * Sağ panel ajan düzenleyici. Temel belge `agent.md` (SKILL.md deseni):
 * persona talimatları tek kaynak ham AGENT.md sekmesinden düzenlenir,
 * kimlik/metadata Genel sekmesindedir. Tek render yolu: `view` modu
 * yalnızca girdileri `disabled` yapar, görünüm aynı bileşenle birebir aynı
 * kalır (skill editörüyle aynı dil). Kaydet/Sil başlık toolbar'ından
 * çağrılır (editorRef üzerinden; `view` modda null). Sekme içerikleri
 * buradadır (`genel` / `agentmd`); sekme şeridi görünümde
 * (`AgentManagementView`) yaşar.
 * Form dili stock/item örneğindeki gibidir (Field + h-9 girdiler).
 */
export interface AgentEditorHandle {
  save: () => void;
  remove: () => void;
}

export function AgentEditor({
  agent,
  mode,
  showTimeline = true,
  editorRef,
  onSaved,
  onDeleted,
}: {
  agent: UserAgent | null;
  mode: AgentEditorMode;
  /** Kayıt geçmişi (alt timeline) görünürlüğü — başlık düğmesinden yönetilir */
  showTimeline?: boolean;
  editorRef: { current: AgentEditorHandle | null };
  onSaved: (id: string) => void;
  onDeleted: () => void;
}) {
  // Tek görünüm: `view` modu yalnızca disabled eder (ebeveyn `key` ile
  // remount ettiği için state başlangıcı her seçimde agent'tan gelir).
  const isRO = mode === "view";

  const agents = useUserAgentsStore((s) => s.agents);
  const upsertAgent = useUserAgentsStore((s) => s.upsertAgent);
  const deleteAgent = useUserAgentsStore((s) => s.deleteAgent);
  const userSkills = useUserSkillsStore((s) => s.skills);

  const [name, setName] = React.useState(agent?.name ?? "");
  const [description, setDescription] = React.useState(agent?.description ?? "");
  const [avatar, setAvatar] = React.useState<string | null>(
    agent?.avatar ?? null,
  );
  const [attachments, setAttachments] = React.useState<UserAgentAttachment[]>(
    agent?.attachments ?? [],
  );
  const attachmentInputRef = React.useRef<HTMLInputElement | null>(null);
  // Tek kaynak: AGENT.md gövdesi (= persona talimatları). Genel sekmesinde
  // ayrı talimat alanı yok; AGENT.md sekmesindeki ham markdown editöründen
  // düzenlenir.
  const [agentMd, setAgentMd] = React.useState(agent?.instructions ?? "");
  const [tools, setTools] = React.useState<string[]>(agent?.tools ?? []);
  const [skills, setSkills] = React.useState<string[]>(agent?.skills ?? []);
  const [scope, setScope] = React.useState(agent?.scope ?? "global");
  const [provider, setProvider] = React.useState(agent?.provider ?? "");
  const [model, setModel] = React.useState(agent?.model ?? "");
  const [thinking, setThinking] = React.useState<boolean | undefined>(
    agent?.thinking,
  );
  const [effort, setEffort] = React.useState<YulaEffort | undefined>(
    normalizeEffort(agent?.effort ?? "") ?? undefined,
  );
  const [customModel, setCustomModel] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [providerModels, setProviderModels] = React.useState<string[]>([]);
  const [providerThinking, setProviderThinking] = React.useState<Record<string, boolean>>({});

  // Sağlayıcının gerçek model listesi (seçicideki desenin aynısı).
  // Salt-okunur görünümde ağ isteği yapılmaz. Efor kapısı için
  // capability (hasThinking) haritası da tutulur.
  React.useEffect(() => {
    if (isRO) return;
    let active = true;
    void (async () => {
      try {
        const stored = readYulaClientAiConfig();
        const res = await fetch(
          yulaModelsApiUrl({
            ...stored,
            ...(provider
              ? { provider: provider as AIProviderType }
              : {}),
          }),
        );
        if (!res.ok) return;
        const data = (await res.json()) as {
          models?: Array<{ name: string; capabilities?: { hasThinking?: boolean }; hasThinking?: boolean }>;
        };
        if (!active || !Array.isArray(data.models)) return;
        setProviderModels(data.models.map((m) => m.name));
        const caps: Record<string, boolean> = {};
        for (const m of data.models) {
          caps[m.name] = Boolean(m.capabilities?.hasThinking ?? m.hasThinking);
        }
        setProviderThinking(caps);
      } catch {
        // Sessiz — liste gelmezse Özel giriş yedeği var.
      }
    })();
    return () => {
      active = false;
    };
  }, [isRO, provider]);

  // Efor kapısı: seçili model biliniyor ve thinking desteklemiyorsa
  // efor seçimi gizlenir (provider destekliyorsa gösterilir). Bilinmeyen
  // modelde (özel/liste-dışı) gösterilir — sunucu capability gate uygular.
  const selectedSupportsEffort = !model || (providerThinking[model] ?? true);

  // Ajan skill seçenekleri: TÜM skill'ler (yerleşik + kullanıcı, kapsam
  // rozetiyle). Slash'e göre tekilleştirilir.
  const skillInventory = React.useMemo(() => {
    const seen = new Set<string>();
    const out: Array<{ slash: string; label: string; scope?: string }> = [];
    for (const s of [...BUILT_IN_USER_SKILLS, ...userSkills]) {
      const key = s.slash.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ slash: key, label: s.label, scope: s.scope });
    }
    return out;
  }, [userSkills]);

  const takenNames = agents
    .filter((a) => a.id !== agent?.id)
    .map((a) => a.name);

  const handleSave = () => {
    if (isRO) return;
    const err = validateUserAgent({ name, instructions: agentMd }, takenNames);
    if (err) {
      setError(err);
      return;
    }
    // Sistem slash'larıyla çakışan ajan adı engellenir (palet karışmasın).
    const clash = getRegisteredYulaCommands().some(
      (c) => c.slash.toLowerCase() === name.trim().toLowerCase(),
    );
    if (clash && agent?.name !== name.trim()) {
      setError(`"${name.trim()}" bir komut adıyla çakışıyor — başka ad seçin.`);
      return;
    }
    const saved = upsertAgent({
      id: agent?.id,
      name,
      description,
      instructions: agentMd,
      tools,
      skills,
      scope,
      provider,
      model,
      thinking,
      effort,
      avatar,
      attachments,
    });
    onSaved(saved.id);
  };

  const handlePickAttachments = (list: FileList | null | undefined) => {
    setError(null);
    if (!list || list.length === 0) return;
    const picked = Array.from(list);
    void (async () => {
      const texts = await Promise.all(
        picked.map(
          (file) =>
            new Promise<{ name: string; content: string }>((resolve) => {
              const reader = new FileReader();
              reader.onerror = () =>
                resolve({ name: file.name, content: "" });
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
      setAttachments((prev) => {
        const next = [...prev];
        for (const candidate of texts) {
          const err = validateAgentAttachmentFile(
            candidate,
            next.map((f) => f.name),
          );
          if (err) {
            setError(err);
            continue;
          }
          if (
            agentAttachmentsSize(next) + candidate.content.length >
            USER_AGENT_ATTACHMENTS_TOTAL_MAX_CHARS
          ) {
            setError("Toplam dosya boyutu 200K karakteri geçemez.");
            continue;
          }
          next.push(candidate);
        }
        return next;
      });
    });
  };

  const handleDelete = () => {
    if (!agent) return;
    deleteAgent(agent.id);
    onDeleted();
  };

  React.useEffect(() => {
    editorRef.current = isRO
      ? null
      : { save: handleSave, remove: handleDelete };
  });

  // Sağ meta panel satırları (item aside deseni): kayıtlılarda tarihler,
  // yeni kayıtta boş (yerine Empty basılır).
  const agentMetaRows: DetailMetaRow[] = agent
    ? [
        {
          key: "created",
          title: "Oluşturuldu",
          detail: formatMetaDate(agent.createdAt),
        },
        {
          key: "updated",
          title: "Son düzenleme",
          detail: formatMetaDate(agent.updatedAt),
        },
      ]
    : [];

  return (
    <>
      <TabsContent value="genel" className="mt-0">
        <DetailFormLayout
          containerName="agent-detail"
          content={
            <>
              <FormGrid twoColClass="@[40rem]/agent-detail:grid-cols-2">
                <Field>
                  <FieldLabel className="text-xs text-muted-foreground">
                    Ajan adı
                  </FieldLabel>
                  <Input
                    value={name}
                    onChange={isRO ? undefined : (e) => setName(e.target.value)}
                    placeholder="Muhasebe Uzmanı"
                    disabled={isRO}
                    readOnly={isRO}
                    className="bg-muted/30 border-muted-foreground/20 font-medium h-9 text-xs data-disabled:opacity-80"
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
                      { value: "global", label: "Global (tüm çalışma alanları)" },
                      ...getRailWorkspaces().map((w) => ({ value: w.id, label: w.name })),
                    ]}
                    disabled={isRO}
                  />
                </Field>
              </FormGrid>

              <Field>
                <FieldLabel className="text-xs text-muted-foreground">
                  Açıklama
                </FieldLabel>
                <Textarea
                  value={description}
                  onChange={isRO ? undefined : (e) => setDescription(e.target.value)}
                  placeholder="Ne zaman kullanılır?"
                  disabled={isRO}
                  readOnly={isRO}
                  rows={3}
                  className="bg-muted/30 border-muted-foreground/20 text-xs resize-y min-h-16 whitespace-pre-wrap data-disabled:opacity-80"
                />
              </Field>

              <Field>
                <FieldLabel className="text-xs text-muted-foreground">
                  Araç erişimi (boş = tüm araçlar)
                </FieldLabel>
                <CriteriaSimpleCombobox
                  multiple
                  variant="form"
                  value={joinMultiValue(tools)}
                  onChange={(v) => setTools(splitMultiValue(v))}
                  options={AGENT_TOOL_CATALOG.map((t) => ({
                    value: t.name,
                    label: t.label,
                  }))}
                  placeholder="Araç seç…"
                  disabled={isRO}
                />
              </Field>

              <Field>
                <FieldLabel className="text-xs text-muted-foreground">
                  Skill seti (boş = skill yok)
                </FieldLabel>
                {skillInventory.length === 0 ? (
                  <p className="text-[11.5px] text-muted-foreground">
                    Tanımlı skill yok.
                  </p>
                ) : (
                  <CriteriaSimpleCombobox
                    multiple
                    variant="form"
                    value={joinMultiValue(skills)}
                    onChange={(v) => setSkills(splitMultiValue(v))}
                    options={skillInventory.map((s) => ({
                      value: s.slash,
                      label:
                        s.scope && s.scope !== "global"
                          ? `/${s.slash} (${s.scope})`
                          : `/${s.slash}`,
                    }))}
                    placeholder="Skill seç… (seçilmezse ajan skill kullanmaz)"
                    disabled={isRO}
                  />
                )}
              </Field>

              <FormGrid twoColClass="@[40rem]/agent-detail:grid-cols-2">
                <Field>
                  <FieldLabel className="text-xs text-muted-foreground">
                    Sağlayıcı
                  </FieldLabel>
                  <CriteriaSimpleCombobox
                    variant="form"
                    value={provider}
                    onChange={(v) => {
                      // Sağlayıcı değişti → model sıfırlanır (seçicideki kuplaj).
                      if (v !== provider) {
                        setProvider(v);
                        setModel("");
                        setCustomModel(false);
                      }
                    }}
                    options={AGENT_PROVIDER_OPTIONS.map((p) => ({
                      value: p.id,
                      label: p.id ? p.label : "Genel ayar",
                    }))}
                    disabled={isRO}
                  />
                </Field>
                <Field>
                  <FieldLabel className="text-xs text-muted-foreground">
                    Model (boş = varsayılan)
                  </FieldLabel>
                  {customModel ? (
                    <span className="flex items-center gap-1.5">
                      <Input
                        value={model}
                        onChange={(e) => setModel(e.target.value)}
                        placeholder="gpt-5.4"
                        disabled={isRO}
                        readOnly={isRO}
                        className="bg-muted/30 border-muted-foreground/20 font-mono h-9 text-xs min-w-0 flex-1 data-disabled:opacity-80"
                      />
                      {!isRO ? (
                        <button
                          type="button"
                          onClick={() => {
                            setCustomModel(false);
                            setModel("");
                          }}
                          className="shrink-0 rounded-md px-2 py-1.5 text-[11.5px] text-muted-foreground hover:bg-muted hover:text-foreground"
                          title="Listeye dön"
                        >
                          Liste
                        </button>
                      ) : null}
                    </span>
                  ) : (
                    <CriteriaSimpleCombobox
                      variant="form"
                      value={
                        !model ? "" : providerModels.includes(model) ? model : "__saved__"
                      }
                      onChange={(v) => {
                        if (v === "__custom__") {
                          setCustomModel(true);
                          return;
                        }
                        if (v === "__saved__") return;
                        setModel(v);
                      }}
                      options={[
                        { value: "", label: "Varsayılan" },
                        ...(model && !providerModels.includes(model)
                          ? [{ value: "__saved__", label: `${model} (kayıtlı)` }]
                          : []),
                        ...providerModels.map((id) => ({ value: id, label: id })),
                        { value: "__custom__", label: "Özel model yaz…" },
                      ]}
                      disabled={isRO}
                    />
                  )}
                </Field>
              </FormGrid>

              <Field>
                <FieldLabel className="text-xs text-muted-foreground">
                  Düşünme
                </FieldLabel>
                <CriteriaSimpleCombobox
                  variant="form"
                  value={thinking === undefined ? "" : thinking ? "on" : "off"}
                  onChange={(v) =>
                    setThinking(v === "" ? undefined : v === "on")
                  }
                  options={[
                    { value: "", label: "Genel ayar" },
                    { value: "on", label: "Açık" },
                    { value: "off", label: "Kapalı" },
                  ]}
                  disabled={isRO}
                />
              </Field>

              {selectedSupportsEffort ? (
                <Field>
                  <FieldLabel className="text-xs text-muted-foreground">
                    Efor (reasoning depth)
                  </FieldLabel>
                  <CriteriaSimpleCombobox
                    variant="form"
                    value={effort ?? ""}
                    onChange={(v) =>
                      setEffort(normalizeEffort(v ?? "") ?? undefined)
                    }
                    options={[
                      { value: "", label: "Genel ayar" },
                      { value: "off", label: `Kapalı (${YULA_EFFORT_LABELS.off})` },
                      { value: "low", label: `Düşük (${YULA_EFFORT_LABELS.low})` },
                      { value: "medium", label: `Orta (${YULA_EFFORT_LABELS.medium})` },
                      { value: "high", label: `Yüksek (${YULA_EFFORT_LABELS.high})` },
                    ]}
                    disabled={isRO}
                  />
                </Field>
              ) : (
                <p className="text-[11.5px] text-muted-foreground">
                  Seçili model efor (reasoning) desteklemiyor — efor seçimi gizli.
                </p>
              )}

              {!isRO && error ? (
                <p className="text-[12px] text-red-600 dark:text-red-400">{error}</p>
              ) : null}
            </>
          }
          aside={
            isRO ? undefined : (
            <DetailAsidePanel
              image={
                <AgentImageUpload
                  value={avatar}
                  onChange={setAvatar}
                  onError={setError}
                  disabled={isRO}
                  className="w-full"
                />
              }
              addControl={
                !isRO ? (
                  <>
                    <Button
                      variant="ghost"
                      className="w-full justify-between h-8 text-xs font-normal px-2 text-muted-foreground hover:text-foreground"
                      onClick={() => attachmentInputRef.current?.click()}
                    >
                      <span className="flex items-center gap-2">
                        <Paperclip className="size-3.5" />
                        Ek dosyalar
                      </span>
                      <Plus className="size-3.5" />
                    </Button>
                    <input
                      ref={attachmentInputRef}
                      type="file"
                      accept=".md,.markdown,.txt,.json"
                      multiple
                      className="sr-only"
                      onChange={(e) => {
                        handlePickAttachments(e.target.files);
                        e.target.value = "";
                      }}
                    />
                  </>
                ) : undefined
              }
              files={attachments.map((file) => ({
                key: file.name.toLowerCase(),
                name: file.name,
                dotClassName: fileDotClass(fileKindForName(file.name)),
              }))}
              onRemoveFile={
                !isRO
                  ? (key) =>
                      setAttachments((prev) =>
                        prev.filter((p) => p.name.toLowerCase() !== key),
                      )
                  : undefined
              }
              metaRows={agentMetaRows}
            />
            )
          }
          timeline={
            showTimeline ? (
              <DetailTimeline
                recordName={agent?.name}
                createdAt={agent?.createdAt}
                updatedAt={agent?.updatedAt}
                recordKey={agent ? `agent:${agent.id}` : undefined}
              />
            ) : undefined
          }
        />
      </TabsContent>
      <TabsContent value="agentmd" className="mt-0 flex flex-col min-w-0">
        {!isRO && lintAgentInstructions(agentMd).length > 0 ? (
          <div
            role="note"
            className="mb-2 shrink-0 space-y-1 rounded-lg border border-amber-500/40 bg-amber-500/[0.07] px-3 py-2"
          >
            {lintAgentInstructions(agentMd).map((w) => (
              <p
                key={w.slice(0, 32)}
                className="text-[11.5px] leading-relaxed text-amber-700 dark:text-amber-300"
              >
                ⚠ {w}
              </p>
            ))}
          </div>
        ) : null}
        <Textarea
          value={agentMd}
          onChange={isRO ? undefined : (e) => setAgentMd(e.target.value)}
          placeholder="Kısa yaz, önce özet tablo ver, teknik detaya girme…"
          disabled={isRO}
           readOnly={isRO}
           rows={1}
           aria-label="AGENT.md ham markdown"
            className="h-full w-full rounded-none border-0 bg-transparent px-0 font-mono text-xs shadow-none focus-visible:border-0 focus-visible:ring-0 data-disabled:opacity-80"
        />
      </TabsContent>
    </>
  );
}
