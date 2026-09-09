"use client";

import * as React from "react";
import { useUserAgentsStore } from "@/lib/stores/user-agents";
import {
  AGENT_TOOL_CATALOG,
  AGENT_PROVIDER_OPTIONS,
  validateUserAgent,
  type UserAgent,
} from "@/lib/yula-user-agent";
import { useUserSkillsStore } from "@/lib/stores/user-skills";
import { BUILT_IN_USER_SKILLS } from "@/lib/built-in-skills";
import { getEffectiveUserSkills } from "@/lib/yula-user-skill";
import { getRailWorkspaces } from "@/lib/workspace-registry";
import { getRegisteredYulaCommands } from "@/components/layout/yula-commands";
import {
  readYulaClientAiConfig,
  yulaModelsApiUrl,
} from "@/lib/yula-ai-client-config";
import type { AIProviderType } from "@/lib/yula-config";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  CriteriaSimpleCombobox,
  joinMultiValue,
  splitMultiValue,
} from "@/features/report-criteria";

/**
 * Sağ panel ajan düzenleyici (null = yeni ajan). Kaydet/Sil başlık
 * toolbar'ından çağrılır (editorRef üzerinden); seçim yönetimi ebeveynde.
 * Form dili stock/item örneğindeki gibidir (Field + h-9 girdiler).
 */
export interface AgentEditorHandle {
  save: () => void;
  remove: () => void;
}

export function AgentEditor({
  agent,
  editorRef,
  onSaved,
  onDeleted,
}: {
  agent: UserAgent | null;
  editorRef: { current: AgentEditorHandle | null };
  onSaved: (id: string) => void;
  onDeleted: () => void;
}) {
  const agents = useUserAgentsStore((s) => s.agents);
  const upsertAgent = useUserAgentsStore((s) => s.upsertAgent);
  const deleteAgent = useUserAgentsStore((s) => s.deleteAgent);
  const userSkills = useUserSkillsStore((s) => s.skills);

  const [name, setName] = React.useState(agent?.name ?? "");
  const [description, setDescription] = React.useState(agent?.description ?? "");
  const [instructions, setInstructions] = React.useState(agent?.instructions ?? "");
  const [tools, setTools] = React.useState<string[]>(agent?.tools ?? []);
  const [skills, setSkills] = React.useState<string[]>(agent?.skills ?? []);
  const [scope, setScope] = React.useState(agent?.scope ?? "global");
  const [provider, setProvider] = React.useState(agent?.provider ?? "");
  const [model, setModel] = React.useState(agent?.model ?? "");
  const [customModel, setCustomModel] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [providerModels, setProviderModels] = React.useState<string[]>([]);

  // Sağlayıcının gerçek model listesi (seçicideki desenin aynısı).
  React.useEffect(() => {
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
        const data = (await res.json()) as { models?: Array<{ name: string }> };
        if (!active || !Array.isArray(data.models)) return;
        setProviderModels(data.models.map((m) => m.name));
      } catch {
        // Sessiz — liste gelmezse Özel giriş yedeği var.
      }
    })();
    return () => {
      active = false;
    };
  }, [provider]);

  // Yönetim görünümü: skill envanteri kapsam filtresiz.
  const skillInventory = React.useMemo(() => {
    const merged = getEffectiveUserSkills(userSkills, BUILT_IN_USER_SKILLS, null);
    const seen = new Set(merged.map((s) => s.id));
    return [
      ...merged,
      ...userSkills.filter((s) => !seen.has(s.id)),
      ...BUILT_IN_USER_SKILLS.filter((s) => !seen.has(s.id)),
    ];
  }, [userSkills]);

  const takenNames = agents
    .filter((a) => a.id !== agent?.id)
    .map((a) => a.name);

  const handleSave = () => {
    const err = validateUserAgent({ name, instructions }, takenNames);
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
      instructions,
      tools,
      skills,
      scope,
      provider,
      model,
    });
    onSaved(saved.id);
  };

  const handleDelete = () => {
    if (!agent) return;
    deleteAgent(agent.id);
    onDeleted();
  };

  React.useEffect(() => {
    editorRef.current = { save: handleSave, remove: handleDelete };
  });

  return (
    <div className="min-w-0 space-y-5">
      <div className="grid grid-cols-1 gap-x-10 gap-y-5 @[40rem]/agent-detail:grid-cols-2">
        <Field>
          <FieldLabel className="text-xs text-muted-foreground">
            Ajan adı
          </FieldLabel>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Muhasebe Uzmanı"
            className="bg-muted/30 border-muted-foreground/20 font-medium h-9 text-xs"
          />
        </Field>
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
      </div>

      <Field>
        <FieldLabel className="text-xs text-muted-foreground">
          Persona talimatları
        </FieldLabel>
        <Textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder="Kısa yaz, önce özet tablo ver, teknik detaya girme…"
          rows={4}
          className="bg-muted/30 border-muted-foreground/20 text-xs resize-y"
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
        />
      </Field>

      <Field>
        <FieldLabel className="text-xs text-muted-foreground">
          Skill seti (boş = kapsamdaki tüm skill&apos;ler)
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
              value: s.slash.toLowerCase(),
              label: `/${s.slash}`,
            }))}
            placeholder="Skill seç…"
          />
        )}
      </Field>

      <div className="grid grid-cols-1 gap-x-10 gap-y-5 @[40rem]/agent-detail:grid-cols-2">
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
          />
        </Field>
      </div>

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
              className="bg-muted/30 border-muted-foreground/20 font-mono h-9 text-xs min-w-0 flex-1"
            />
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
            />
          )}
      </Field>

      {error ? (
        <p className="text-[12px] text-red-600 dark:text-red-400">{error}</p>
      ) : null}
    </div>
  );
}
