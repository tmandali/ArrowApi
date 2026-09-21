import * as React from "react";
import { useTranslations } from "next-intl";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { FormGrid } from "@/components/layout/form-grid";
import { CriteriaSimpleCombobox } from "@/features/report-criteria";
import { normalizeEffort, YULA_EFFORT_LABELS, type YulaEffort } from "@/lib/yula-reasoning";

export interface AgentModelConfigFieldsProps {
  isRO: boolean;
  provider: string;
  setProvider: (v: string) => void;
  model: string;
  setModel: (v: string) => void;
  customModel: boolean;
  setCustomModel: (v: boolean) => void;
  providerOptions: Array<{ id: string; label: string }>;
  providerModels: string[];
  thinking: boolean | undefined;
  setThinking: (v: boolean | undefined) => void;
  effort: YulaEffort | undefined;
  setEffort: (v: YulaEffort | undefined) => void;
  selectedSupportsEffort: boolean;
}

export function AgentModelConfigFields({
  isRO,
  provider,
  setProvider,
  model,
  setModel,
  customModel,
  setCustomModel,
  providerOptions,
  providerModels,
  thinking,
  setThinking,
  effort,
  setEffort,
  selectedSupportsEffort,
}: AgentModelConfigFieldsProps) {
  const t = useTranslations("AgentEditor");

  return (
    <>
      <FormGrid twoColClass="@[40rem]/agent-detail:grid-cols-2">
        <Field>
          <FieldLabel className="text-xs text-muted-foreground">
            {t("provider_label")}
          </FieldLabel>
          <CriteriaSimpleCombobox
            variant="form"
            value={provider}
            onChange={(v) => {
              if (v !== provider) {
                setProvider(v);
                setModel("");
                setCustomModel(false);
              }
            }}
            options={providerOptions.map((p) => ({
              value: p.id,
              label: p.id ? p.label : t("general_settings"),
            }))}
            disabled={isRO}
          />
        </Field>
        <Field>
          <FieldLabel className="text-xs text-muted-foreground">
            {t("model_label")}
          </FieldLabel>
          {customModel ? (
            <span className="flex items-center gap-1.5">
              <Input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder={t("model_placeholder")}
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
                  title={t("back_to_list")}
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
                { value: "", label: t("default") },
                ...(model && !providerModels.includes(model)
                  ? [{ value: "__saved__", label: t("model_saved", { model }) }]
                  : []),
                ...providerModels.map((id) => ({ value: id, label: id })),
                { value: "__custom__", label: t("custom_model_placeholder") },
              ]}
              disabled={isRO}
            />
          )}
        </Field>
      </FormGrid>

      <Field>
        <FieldLabel className="text-xs text-muted-foreground">
          {t("thinking_label")}
        </FieldLabel>
        <CriteriaSimpleCombobox
          variant="form"
          value={thinking === undefined ? "" : thinking ? "on" : "off"}
          onChange={(v) =>
            setThinking(v === "" ? undefined : v === "on")
          }
          options={[
            { value: "", label: t("general_settings") },
            { value: "on", label: t("enabled") },
            { value: "off", label: t("disabled") },
          ]}
          disabled={isRO}
        />
      </Field>

      {selectedSupportsEffort ? (
        <Field>
          <FieldLabel className="text-xs text-muted-foreground">
            {t("effort_label")}
          </FieldLabel>
          <CriteriaSimpleCombobox
            variant="form"
            value={effort ?? ""}
            onChange={(v) =>
              setEffort(normalizeEffort(v ?? "") ?? undefined)
            }
            options={[
              { value: "", label: t("general_settings") },
              { value: "off", label: `${t("disabled")} (${YULA_EFFORT_LABELS.off})` },
              { value: "low", label: `${t("low")} (${YULA_EFFORT_LABELS.low})` },
              { value: "medium", label: `${t("medium")} (${YULA_EFFORT_LABELS.medium})` },
              { value: "high", label: `${t("high")} (${YULA_EFFORT_LABELS.high})` },
            ]}
            disabled={isRO}
          />
        </Field>
      ) : (
        <p className="text-[11.5px] text-muted-foreground">
          {t("effort_unsupported_hint")}
        </p>
      )}
    </>
  );
}
