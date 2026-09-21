"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { useUserAgentsStore } from "@/lib/stores/user-agents";
import {
  AGENT_TOOL_CATALOG,
  AGENT_PROVIDER_OPTIONS,
  USER_AGENT_ATTACHMENTS_TOTAL_MAX_CHARS,
  agentAttachmentsSize,
  localizeAgentToolCatalog,
  localizeProviderOptions,
  resolveValidationIssue,
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
import { normalizeEffort, type YulaEffort } from "@/lib/yula-reasoning";
import { TabsContent } from "@/components/ui/tabs";
import { DetailTimeline } from "@/components/layout/detail-timeline";
import { FormGrid } from "@/components/layout/form-grid";
import { DetailFormLayout } from "@/components/layout/detail-form-layout";
import { type DetailMetaRow } from "@/components/layout/detail-aside";
import { formatMetaDate } from "@/utils/format";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useTabFill } from "./use-tab-fill";
import {
  CriteriaSimpleCombobox,
  joinMultiValue,
  splitMultiValue,
} from "@/features/report-criteria";
import {
  type AgentEditorMode,
  type AgentEditorHandle,
  type AgentEditorProps,
} from "./agent-editor-types";
import { AgentMarkdownTab } from "./agent-markdown-tab";
import { AgentEditorAside } from "./agent-editor-aside";
import { AgentModelConfigFields } from "./agent-model-config-fields";

export type { AgentEditorMode, AgentEditorHandle, AgentEditorProps };

export function AgentEditor({
  agent,
  mode,
  showTimeline = true,
  editorRef,
  onSaved,
  onDeleted,
}: AgentEditorProps) {
  const isRO = mode === "view";
  const t = useTranslations("AgentEditor");
  const tv = useTranslations("Validation");
  const tCat = useTranslations("AgentCatalog");

  const toolCatalog = React.useMemo(
    () => localizeAgentToolCatalog(AGENT_TOOL_CATALOG, tCat),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  const providerOptions = React.useMemo(
    () => localizeProviderOptions(AGENT_PROVIDER_OPTIONS, tCat),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const agents = useUserAgentsStore((s) => s.agents);
  const upsertAgent = useUserAgentsStore((s) => s.upsertAgent);
  const deleteAgent = useUserAgentsStore((s) => s.deleteAgent);
  const userSkills = useUserSkillsStore((s) => s.skills);

  const [name, setName] = React.useState(agent?.name ?? "");
  const [description, setDescription] = React.useState(agent?.description ?? "");
  const [avatar, setAvatar] = React.useState<string | null>(agent?.avatar ?? null);
  const [attachments, setAttachments] = React.useState<UserAgentAttachment[]>(
    agent?.attachments ?? []
  );
  const [agentMd, setAgentMd] = React.useState(agent?.instructions ?? "");
  const [tools, setTools] = React.useState<string[]>(agent?.tools ?? []);
  const [skills, setSkills] = React.useState<string[]>(agent?.skills ?? []);
  const [scope, setScope] = React.useState(agent?.scope ?? "global");
  const [provider, setProvider] = React.useState(agent?.provider ?? "");
  const [model, setModel] = React.useState(agent?.model ?? "");
  const [thinking, setThinking] = React.useState<boolean | undefined>(agent?.thinking);
  const [effort, setEffort] = React.useState<YulaEffort | undefined>(
    normalizeEffort(agent?.effort ?? "") ?? undefined
  );
  const [customModel, setCustomModel] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [providerModels, setProviderModels] = React.useState<string[]>([]);
  const [providerThinking, setProviderThinking] = React.useState<Record<string, boolean>>({});

  const agentmdFillRef = useTabFill<HTMLDivElement>();

  React.useEffect(() => {
    if (isRO) return;
    let active = true;
    void (async () => {
      try {
        const stored = readYulaClientAiConfig();
        const res = await fetch(
          yulaModelsApiUrl({
            ...stored,
            ...(provider ? { provider: provider as AIProviderType } : {}),
          })
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
      } catch {}
    })();
    return () => {
      active = false;
    };
  }, [isRO, provider]);

  const selectedSupportsEffort = !model || (providerThinking[model] ?? true);

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
      setError(resolveValidationIssue(err, tv));
      return;
    }
    const clash = getRegisteredYulaCommands().some(
      (c) => c.slash.toLowerCase() === name.trim().toLowerCase()
    );
    if (clash && agent?.name !== name.trim()) {
      setError(t("name_clashes_with_command", { name: name.trim() }));
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
              reader.onerror = () => resolve({ name: file.name, content: "" });
              reader.onload = () =>
                resolve({
                  name: file.name,
                  content: typeof reader.result === "string" ? reader.result : "",
                });
              reader.readAsText(file);
            })
        )
      );
      setAttachments((prev) => {
        const next = [...prev];
        for (const candidate of texts) {
          const err = validateAgentAttachmentFile(
            candidate,
            next.map((f) => f.name)
          );
          if (err) {
            setError(resolveValidationIssue(err, tv));
            continue;
          }
          if (
            agentAttachmentsSize(next) + candidate.content.length >
            USER_AGENT_ATTACHMENTS_TOTAL_MAX_CHARS
          ) {
            setError(t("file_size_exceeded"));
            continue;
          }
          next.push(candidate);
        }
        return next;
      });
    })();
  };

  const handleDelete = () => {
    if (!agent) return;
    deleteAgent(agent.id);
    onDeleted();
  };

  React.useEffect(() => {
    editorRef.current = isRO ? null : { save: handleSave, remove: handleDelete };
  });

  const agentMetaRows: DetailMetaRow[] = agent
    ? [
        {
          key: "created",
          title: t("created"),
          detail: formatMetaDate(agent.createdAt),
        },
        {
          key: "updated",
          title: t("last_modified"),
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
                    {t("agent_name")}
                  </FieldLabel>
                  <Input
                    value={name}
                    onChange={isRO ? undefined : (e) => setName(e.target.value)}
                    placeholder={t("name_placeholder")}
                    disabled={isRO}
                    readOnly={isRO}
                    className="bg-muted/30 border-muted-foreground/20 font-medium h-9 text-xs data-disabled:opacity-80"
                  />
                </Field>
                <Field>
                  <FieldLabel className="text-xs text-muted-foreground">
                    {t("scope_label")}
                  </FieldLabel>
                  <CriteriaSimpleCombobox
                    variant="form"
                    value={scope}
                    onChange={(v) => setScope(v || "global")}
                    options={[
                      { value: "global", label: t("scope_global") },
                      ...getRailWorkspaces().map((w) => ({ value: w.id, label: w.name })),
                    ]}
                    disabled={isRO}
                  />
                </Field>
              </FormGrid>

              <Field>
                <FieldLabel className="text-xs text-muted-foreground">
                  {t("description_label")}
                </FieldLabel>
                <Textarea
                  value={description}
                  onChange={isRO ? undefined : (e) => setDescription(e.target.value)}
                  placeholder={t("description_placeholder")}
                  disabled={isRO}
                  readOnly={isRO}
                  rows={3}
                  className="bg-muted/30 border-muted-foreground/20 text-xs resize-none min-h-16 whitespace-pre-wrap data-disabled:opacity-80"
                />
              </Field>

              <Field>
                <FieldLabel className="text-xs text-muted-foreground">
                  {t("tools_access")}
                </FieldLabel>
                <CriteriaSimpleCombobox
                  multiple
                  variant="form"
                  value={joinMultiValue(tools)}
                  onChange={(v) => setTools(splitMultiValue(v))}
                  options={toolCatalog.map((x) => ({
                    value: x.name,
                    label: x.label,
                  }))}
                  placeholder={t("tool_select_placeholder")}
                  disabled={isRO}
                />
              </Field>

              <Field>
                <FieldLabel className="text-xs text-muted-foreground">
                  {t("skill_set")}
                </FieldLabel>
                {skillInventory.length === 0 ? (
                  <p className="text-[11.5px] text-muted-foreground">
                    {t("no_skills_defined")}
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
                    placeholder={t("skill_select_placeholder")}
                    disabled={isRO}
                  />
                )}
              </Field>

              <AgentModelConfigFields
                isRO={isRO}
                provider={provider}
                setProvider={setProvider}
                model={model}
                setModel={setModel}
                customModel={customModel}
                setCustomModel={setCustomModel}
                providerOptions={providerOptions}
                providerModels={providerModels}
                thinking={thinking}
                setThinking={setThinking}
                effort={effort}
                setEffort={setEffort}
                selectedSupportsEffort={selectedSupportsEffort}
              />

              {!isRO && error ? (
                <p className="text-[12px] text-red-600 dark:text-red-400">{error}</p>
              ) : null}
            </>
          }
          aside={
            <AgentEditorAside
              isRO={isRO}
              avatar={avatar}
              setAvatar={setAvatar}
              setError={setError}
              attachments={attachments}
              setAttachments={setAttachments}
              handlePickAttachments={handlePickAttachments}
              metaRows={agentMetaRows}
            />
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
      <AgentMarkdownTab
        isRO={isRO}
        agentMd={agentMd}
        setAgentMd={setAgentMd}
        fillRef={agentmdFillRef}
      />
    </>
  );
}
