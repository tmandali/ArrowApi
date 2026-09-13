"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Field, FieldLabel } from "@/components/ui/field";
import type { AiProviderConfig } from "./settings-types";
import type { SettingsFormState } from "./use-settings-form-state";

/** yula-ai sekmesi: sağlayıcı + model + endpoint + anahtar + thinking. */
export function AiTab({ form }: { form: SettingsFormState }) {
  const t = useTranslations("MySettings");
  const [open, setOpen] = React.useState(true);

  const handleProviderChange = (newProvider: AiProviderConfig["provider"]) => {
    form.setAiProvider(newProvider);
    if (newProvider === "ollama") {
      form.setAiModel("gemma4:12b-mlx");
      form.setAiEndpoint("http://127.0.0.1:11434");
    } else if (newProvider === "google") {
      form.setAiModel("gemini-2.5-flash");
      form.setAiEndpoint("https://generativelanguage.googleapis.com");
    } else if (newProvider === "azure") {
      form.setAiModel("gpt-5.4");
      form.setAiEndpoint("https://tmandali-resource.services.ai.azure.com/openai/v1");
    } else if (newProvider === "openai") {
      form.setAiModel("gpt-4o-mini");
      form.setAiEndpoint("https://api.openai.com/v1");
    } else if (newProvider === "agnes") {
      form.setAiModel("agnes-2.5-flash");
      form.setAiEndpoint("https://apihub.agnes-ai.com/v1");
    }
  };

  return (
    <div className="flex-1 flex flex-col lg:flex-row overflow-y-auto m-0">
      <div className="flex-1 p-6 space-y-6">
      <div className="space-y-3">
        <Collapsible open={open} onOpenChange={setOpen} className="border-b pb-3">
          <CollapsibleTrigger className="flex w-full items-center justify-between py-1 text-xs font-semibold text-foreground hover:text-foreground/80">
            <span>{t("ai_title")}</span>
            <ChevronDown
              className={`size-4 text-muted-foreground transition-transform duration-200 ${
                open ? "rotate-180" : ""
              }`}
            />
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3 pl-2 space-y-4">
            <p className="text-xs text-muted-foreground">
              {t("ai_description")}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field>
                <FieldLabel className="text-xs text-muted-foreground">
                  {t("ai_provider")}
                </FieldLabel>
                <Select
                  value={form.aiProvider}
                  onValueChange={(val: AiProviderConfig["provider"]) => handleProviderChange(val)}
                >
                  <SelectTrigger className="bg-muted/30 border-muted-foreground/20 h-9 text-xs font-medium">
                    <SelectValue placeholder={t("ai_provider_ph")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="azure">Microsoft Foundry (Azure OpenAI)</SelectItem>
                    <SelectItem value="ollama">{t("provider_ollama")}</SelectItem>
                    <SelectItem value="openai">OpenAI / Custom OpenAI-Compatible</SelectItem>
                    <SelectItem value="agnes">Agnes (agnes-2.5-flash)</SelectItem>
                    <SelectItem value="google">Google AI SDK (Gemini 2.5 Flash / Pro)</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              <Field>
                <FieldLabel className="text-xs text-muted-foreground">
                  {t("ai_model")}
                </FieldLabel>
                <Input
                  value={form.aiModel}
                  onChange={(e) => form.setAiModel(e.target.value)}
                  placeholder="gemma4:12b-mlx, gemini-2.5-flash, gpt-4o-mini"
                  className="bg-muted/30 border-muted-foreground/20 font-medium h-9 text-xs"
                />
              </Field>

              <Field>
                <FieldLabel className="text-xs text-muted-foreground">
                  {t("ai_endpoint")}
                </FieldLabel>
                <Input
                  value={form.aiEndpoint}
                  onChange={(e) => form.setAiEndpoint(e.target.value)}
                  placeholder="http://127.0.0.1:11434 or https://your-resource.openai.azure.com/"
                  className="bg-muted/30 border-muted-foreground/20 font-medium h-9 text-xs"
                />
              </Field>

              <Field>
                <FieldLabel className="text-xs text-muted-foreground">
                  {t("ai_api_key")}
                </FieldLabel>
                <div className="relative">
                  <Input
                    type={form.showApiKey ? "text" : "password"}
                    value={form.aiApiKey}
                    onChange={(e) => form.setAiApiKey(e.target.value)}
                    placeholder={form.aiProvider === "ollama" ? t("ai_api_key_ph_local") : "sk-..."}
                    className="bg-muted/30 border-muted-foreground/20 font-medium h-9 text-xs pr-8"
                  />
                  <button
                    type="button"
                    onClick={() => form.setShowApiKey(!form.showApiKey)}
                    className="absolute right-2 top-2.5 text-muted-foreground hover:text-foreground"
                  >
                    {form.showApiKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </Field>

              <Field>
                <FieldLabel className="text-xs text-muted-foreground">
                  {t("ai_thinking")}
                </FieldLabel>
                <Select
                  value={form.aiThinkingLevel}
                  onValueChange={(val: NonNullable<AiProviderConfig["thinkingLevel"]>) =>
                    form.setAiThinkingLevel(val)
                  }
                >
                  <SelectTrigger className="bg-muted/30 border-muted-foreground/20 h-9 text-xs font-medium">
                    <SelectValue placeholder={t("ai_thinking_ph")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="off">{t("think_off")}</SelectItem>
                    <SelectItem value="low">{t("think_low")}</SelectItem>
                    <SelectItem value="medium">{t("think_medium")}</SelectItem>
                    <SelectItem value="high">{t("think_high")}</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  {t("ai_thinking_note")}
                </p>
              </Field>
            </div>

            <div className="pt-1">
              <span className="text-xs text-muted-foreground">
                {t("ai_active")} <strong className="text-foreground">{form.aiProvider.toUpperCase()}</strong> ({form.aiModel})
              </span>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
      </div>
    </div>
  );
}
