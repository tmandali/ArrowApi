"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { HelpCircle, CheckCircle2, CornerDownLeft } from "lucide-react";
import { cn } from "@/utils/cn";
import { useYulaChat } from "@/hooks/use-yula-chat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { getMessageText } from "@my-agent/core";

export interface UserChoiceOption {
  label: string;
  value?: string;
  description?: string;
  rationale?: string;
  badge?: string;
}

export interface UserChoiceData {
  question: string;
  options: UserChoiceOption[];
  allowCustom: boolean;
  customPlaceholder?: string;
}

// eslint-disable-next-line react/only-export-components -- parser + bileşen aynı dosyada; saf veri çözümleyici
export function parseChoiceData(input?: unknown, output?: unknown): UserChoiceData | null {
  const inObj = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const outObj = (output && typeof output === "object" ? output : {}) as Record<string, unknown>;
  const outDetails = (outObj.details && typeof outObj.details === "object" ? outObj.details : {}) as Record<string, unknown>;

  if (Object.keys(inObj).length === 0 && Object.keys(outObj).length === 0) {
    return null;
  }

  // 1. Soru metnini çöz: input.question -> output.details.question -> output.question -> text parsing
  let question = "";
  if (typeof inObj.question === "string" && inObj.question.trim()) {
    question = inObj.question.trim();
  } else if (typeof outDetails.question === "string" && outDetails.question.trim()) {
    question = outDetails.question.trim();
  } else if (typeof outObj.question === "string" && outObj.question.trim()) {
    question = outObj.question.trim();
  }

  // 2. Seçenekleri çöz: input.options -> output.details.options -> output.options
  let rawOptions: unknown[] = [];
  if (Array.isArray(inObj.options) && inObj.options.length > 0) {
    rawOptions = inObj.options;
  } else if (Array.isArray(outDetails.options) && outDetails.options.length > 0) {
    rawOptions = outDetails.options;
  } else if (Array.isArray(outObj.options) && outObj.options.length > 0) {
    rawOptions = outObj.options;
  }

  // 3. allow_custom bayrağı
  const allowCustom =
    inObj.allow_custom !== undefined
      ? inObj.allow_custom !== false
      : outDetails.allow_custom !== undefined
        ? outDetails.allow_custom !== false
        : outObj.allow_custom !== undefined
          ? outObj.allow_custom !== false
          : true;

  // 4. custom_placeholder
  const rawPlaceholder =
    inObj.custom_placeholder ?? outDetails.custom_placeholder ?? outObj.custom_placeholder;
  const customPlaceholder =
    typeof rawPlaceholder === "string" && rawPlaceholder.trim().length > 0
      ? rawPlaceholder.trim()
      : undefined;

  const options: UserChoiceOption[] = rawOptions
    .map((opt) => {
      if (typeof opt === "string") {
        return { label: opt.trim(), value: opt.trim() };
      }
      if (opt && typeof opt === "object") {
        const o = opt as Record<string, unknown>;
        const label = String(o.label ?? o.value ?? "").trim();
        const value = o.value != null ? String(o.value).trim() : undefined;
        const description = o.description != null ? String(o.description).trim() : undefined;
        const rationale = o.rationale != null ? String(o.rationale).trim() : undefined;
        const badge = o.badge != null ? String(o.badge).trim() : undefined;
        return { label, value, description, rationale, badge };
      }
      return { label: String(opt).trim() };
    })
    .filter((o) => o.label.length > 0);

  if (!question && options.length === 0) return null;

  return {
    question: question || "",
    options,
    allowCustom,
    customPlaceholder,
  };
}

export function YulaChoiceCard({
  messageId,
  toolCallId,
  input,
  output,
}: {
  messageId?: string;
  toolCallId?: string;
  input?: unknown;
  output?: unknown;
}) {
  const yula = useYulaChat();
  const choiceData = React.useMemo(
    () => parseChoiceData(input, output),
    [input, output],
  );

  const hasDescriptions = React.useMemo(() => {
    return (choiceData?.options ?? []).some((o) => Boolean(o.description));
  }, [choiceData]);

  const [selectedLabel, setSelectedLabel] = React.useState<string | null>(null);
  const [customInput, setCustomInput] = React.useState("");
  const [showCustomInput, setShowCustomInput] = React.useState(choiceData?.options.length === 0);
  const [hoveredDesc, setHoveredDesc] = React.useState<string | null>(null);

  const t = useTranslations("ChoiceCard");

  // Watermark / placeholder metni: Yalnızca model tarafından dinamik sağlanan hint
  const customPlaceholder = choiceData?.customPlaceholder;

  // Bu mesajdan sonra gelen kullanıcı mesajı varsa yanıtlanmış sayılır
  const answeredByFollowUp = React.useMemo(() => {
    if (!messageId) return false;
    const idx = yula.messages.findIndex((m) => m.id === messageId);
    if (idx < 0) return false;
    return yula.messages.slice(idx + 1).some((m) => m.role === "user");
  }, [yula.messages, messageId]);

  // Takip mesajındaki metin (yalnızca hemen sonraki kullanıcı yanıtı, maks 80 kr)
  const followUpText = React.useMemo(() => {
    if (!messageId) return "";
    const idx = yula.messages.findIndex((m) => m.id === messageId);
    if (idx < 0) return "";
    const nextUser = yula.messages.slice(idx + 1).find((m) => m.role === "user");
    const text = getMessageText(nextUser);
    return text.length > 80 ? `${text.slice(0, 80)}…` : text;
  }, [yula.messages, messageId]);

  const isAnswered = selectedLabel !== null || answeredByFollowUp;

  const handleSelect = React.useCallback(
    (opt: UserChoiceOption) => {
      if (yula.busy || isAnswered) return;
      setSelectedLabel(opt.label);

      // Gönderilecek metin: Değer etiketten farklı ve anlamlıysa parantezde belirt
      const textToSend =
        opt.value && opt.value !== opt.label
          ? `${opt.label} (${opt.value})`
          : opt.label;

      if (yula.respondToChoice) {
        yula.respondToChoice(textToSend);
      } else if (yula.steer) {
        if (toolCallId && yula.addToolOutput) {
          yula.addToolOutput({
            toolCallId,
            output: { selected: opt.label, value: opt.value || opt.label },
          });
        }
        yula.steer(textToSend);
      } else {
        if (toolCallId && yula.addToolOutput) {
          yula.addToolOutput({
            toolCallId,
            output: { selected: opt.label, value: opt.value || opt.label },
          });
        }
        yula.sendMessageText(textToSend);
      }
    },
    [yula, isAnswered, toolCallId],
  );

  const handleCustomSubmit = React.useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      const trimmed = customInput.trim();
      if (!trimmed || yula.busy || isAnswered) return;
      setSelectedLabel(trimmed);

      if (yula.respondToChoice) {
        yula.respondToChoice(trimmed);
      } else if (yula.steer) {
        if (toolCallId && yula.addToolOutput) {
          yula.addToolOutput({
            toolCallId,
            output: { selected: trimmed, value: trimmed },
          });
        }
        yula.steer(trimmed);
      } else {
        if (toolCallId && yula.addToolOutput) {
          yula.addToolOutput({
            toolCallId,
            output: { selected: trimmed, value: trimmed },
          });
        }
        yula.sendMessageText(trimmed);
      }
    },
    [customInput, yula, isAnswered, toolCallId],
  );

  if (!choiceData) return null;

  // Yanıtlanmış kart görünümü — Kompakt özet
  if (isAnswered) {
    const displayText = selectedLabel || followUpText || t("option_selected");
    return (
      <div className="flex flex-col gap-1 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.04] dark:bg-emerald-500/[0.08] px-3 py-2 text-[12px] transition-all">
        <div className="flex items-center gap-1.5 text-muted-foreground font-medium text-[11.5px]">
          <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />
          <span className="line-clamp-1">{choiceData.question || t("default_question")}</span>
        </div>
        <div className="pl-5 font-medium text-foreground text-[12px]">
          {displayText}
        </div>
      </div>
    );
  }

  // Canlı seçim kartı görünümü — Ekran standartlarına uygun, sade ve zarif shadcn kartı
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.03] dark:bg-amber-500/[0.06] p-2.5 shadow-2xs transition-all my-1.5">
      {/* Soru ve Askıya Alma Durum Başlığı */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[12px] font-medium text-foreground/90 leading-tight">
          <HelpCircle className="size-3.5 text-primary shrink-0" />
          <span>{choiceData.question || t("default_question")}</span>
        </div>
        <Badge
          variant="outline"
          className="animate-pulse bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 text-[10px] h-4.5 px-1.5 shrink-0 font-medium"
        >
          {t("waiting_approval")}
        </Badge>
      </div>

      {/* Seçenekler: Açıklama varsa tek satırlı şık liste, yoksa kompakt buton çipleri */}
      {hasDescriptions ? (
        <div className="flex flex-col gap-1 pt-0.5">
          {choiceData.options.map((opt, idx) => {
            const isFirst = idx === 0;
            const isCancel =
              opt.value === "cancel" ||
              opt.label.toLowerCase().includes("vazgeç") ||
              opt.label.toLowerCase().includes("cancel");

            return (
              <Button
                key={`${opt.label}-${idx}`}
                type="button"
                variant="outline"
                size="sm"
                disabled={yula.busy}
                onClick={() => handleSelect(opt)}
                title={opt.description ? `${opt.label} — ${opt.description}` : opt.label}
                className={cn(
                  "h-8 w-full justify-between gap-2 px-2.5 text-[12px] font-normal cursor-pointer transition-all select-none group",
                  isFirst
                    ? "border-primary/50 bg-primary/[0.04] dark:bg-primary/[0.08] text-foreground hover:bg-primary/[0.09] hover:border-primary font-medium shadow-2xs"
                    : isCancel
                    ? "border-transparent bg-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                    : "border-border/70 bg-background/70 text-foreground/90 hover:bg-muted/70 hover:border-border",
                )}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1 truncate">
                  <span className="font-medium shrink-0">{opt.label}</span>
                  {opt.description ? (
                    <span className="text-[11.5px] text-muted-foreground truncate font-normal">
                      — {opt.description}
                    </span>
                  ) : null}
                </div>
                {opt.badge ? (
                  <Badge
                    variant={isFirst ? "secondary" : "outline"}
                    className={cn(
                      "text-[10px] h-4.5 px-1.5 shrink-0 font-normal",
                      isFirst
                        ? "bg-primary/10 text-primary border-primary/25"
                        : "border-border/60 text-muted-foreground",
                    )}
                  >
                    {opt.badge}
                  </Badge>
                ) : isFirst ? (
                  <Badge
                    variant="secondary"
                    className="bg-primary/10 text-primary border-primary/25 text-[10px] h-4.5 px-1.5 shrink-0 font-normal"
                  >
                    {t("recommended") || "Önerilen"}
                  </Badge>
                ) : null}
              </Button>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          {choiceData.options.map((opt, idx) => {
            const isFirst = idx === 0;
            const isCancel =
              opt.value === "cancel" ||
              opt.label.toLowerCase().includes("vazgeç") ||
              opt.label.toLowerCase().includes("cancel");

            return (
              <Button
                key={`${opt.label}-${idx}`}
                type="button"
                variant={isFirst ? "default" : isCancel ? "ghost" : "outline"}
                size="sm"
                disabled={yula.busy}
                onClick={() => handleSelect(opt)}
                onMouseEnter={() => setHoveredDesc(opt.description || null)}
                onMouseLeave={() => setHoveredDesc(null)}
                title={opt.description}
                className={cn(
                  "h-7 px-2.5 text-[12px] font-medium cursor-pointer transition-all select-none",
                  isFirst && "shadow-2xs",
                  isCancel && "text-muted-foreground hover:bg-muted hover:text-foreground",
                  !isFirst && !isCancel && "border-border/70 bg-background/80 text-foreground/90 hover:bg-muted/80",
                )}
              >
                <span>{opt.label}</span>
                {opt.badge ? (
                  <span
                    className={cn(
                      "ml-1 text-[10px] px-1 py-0.2 rounded font-normal",
                      isFirst
                        ? "bg-primary-foreground/20 text-primary-foreground"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {opt.badge}
                  </span>
                ) : null}
              </Button>
            );
          })}
        </div>
      )}

      {/* Buton üzerine gelindiğinde görünen açıklama ipucu (yalnızca yatay çip modunda) */}
      {!hasDescriptions && hoveredDesc ? (
        <div className="text-[11px] text-muted-foreground/80 pl-1 leading-tight animate-in fade-in-0 duration-150">
          • {hoveredDesc}
        </div>
      ) : null}

      {/* Serbest Giriş Seçeneği */}
      {choiceData.allowCustom && !showCustomInput ? (
        <button
          type="button"
          onClick={() => setShowCustomInput(true)}
          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded-md hover:bg-muted/40 transition-colors cursor-pointer self-start"
          title={customPlaceholder}
        >
          <span>{t("custom_reply") || "Farklı bir şey yaz..."}</span>
        </button>
      ) : null}

      {/* Serbest Giriş Formu */}
      {choiceData.allowCustom && showCustomInput ? (
        <form
          onSubmit={handleCustomSubmit}
          className="pt-0.5 flex items-center gap-1.5 animate-in fade-in-0 slide-in-from-top-1 duration-150"
        >
          <Input
            type="text"
            autoFocus
            placeholder={customPlaceholder}
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            disabled={yula.busy}
            className="h-7 text-[11.5px] bg-background/90 placeholder:text-muted-foreground/60 border-border/80 focus-visible:ring-primary/40"
          />
          <Button
            type="submit"
            size="sm"
            disabled={!customInput.trim() || yula.busy}
            className="h-7 px-2.5 text-[11.5px] shrink-0"
          >
            <CornerDownLeft className="size-3 mr-1" />
            {t("send")}
          </Button>
          {choiceData.options.length > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowCustomInput(false)}
              className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground"
            >
              ✕
            </Button>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}
