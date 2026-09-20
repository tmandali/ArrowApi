"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { HelpCircle, CheckCircle2, CornerDownLeft } from "lucide-react";
import { cn } from "@/utils/cn";
import { useYulaChat } from "@/hooks/use-yula-chat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface UserChoiceOption {
  label: string;
  value?: string;
  description?: string;
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

  // Eğer hâlâ soru bulunamadıysa content text parsing ([User Decision Required]: ...)
  if (!question && Array.isArray(outObj.content)) {
    const textPart = outObj.content.find(
      (c: any) => c && typeof c === "object" && c.type === "text" && typeof c.text === "string"
    ) as { text: string } | undefined;
    if (textPart?.text) {
      const match = textPart.text.match(/\[User Decision Required\]:\s*(.*?)(?:\nOptions:|$)/s);
      if (match && match[1]) {
        question = match[1].trim();
      }
    }
  }

  // 2. Seçenekleri çöz: input.options -> output.details.options -> output.options -> text options JSON parsing
  let rawOptions: unknown[] = [];
  if (Array.isArray(inObj.options) && inObj.options.length > 0) {
    rawOptions = inObj.options;
  } else if (Array.isArray(outDetails.options) && outDetails.options.length > 0) {
    rawOptions = outDetails.options;
  } else if (Array.isArray(outObj.options) && outObj.options.length > 0) {
    rawOptions = outObj.options;
  } else if (Array.isArray(outObj.content)) {
    const textPart = outObj.content.find(
      (c: any) => c && typeof c === "object" && c.type === "text" && typeof c.text === "string"
    ) as { text: string } | undefined;
    if (textPart?.text) {
      const optMatch = textPart.text.match(/Options:\s*(\[.*?\])/s);
      if (optMatch && optMatch[1]) {
        try {
          const parsed = JSON.parse(optMatch[1]);
          if (Array.isArray(parsed)) rawOptions = parsed;
        } catch {}
      }
    }
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
        return { label, value, description };
      }
      return { label: String(opt).trim() };
    })
    .filter((o) => o.label.length > 0);

  if (!question && options.length === 0 && !allowCustom) return null;

  return {
    question: question || "",
    options,
    allowCustom,
    customPlaceholder,
  };
}

export function YulaChoiceCard({
  messageId,
  input,
  output,
}: {
  messageId?: string;
  input?: unknown;
  output?: unknown;
}) {
  const yula = useYulaChat();
  const choiceData = React.useMemo(
    () => parseChoiceData(input, output),
    [input, output],
  );

  const [selectedLabel, setSelectedLabel] = React.useState<string | null>(null);
  const [customInput, setCustomInput] = React.useState("");

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

  // Takip mesajındaki metin
  const followUpText = React.useMemo(() => {
    if (!messageId) return "";
    const idx = yula.messages.findIndex((m) => m.id === messageId);
    if (idx < 0) return "";
    return yula.messages
      .slice(idx + 1)
      .filter((m) => m.role === "user")
      .map((m) =>
        m.parts
          ?.filter((p) => p.type === "text")
          ?.map((p) => (p as { text?: string }).text ?? "")
          ?.join("\n"),
      )
      .join("\n")
      .trim();
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

      yula.sendMessageText(textToSend);
    },
    [yula, isAnswered],
  );

  const handleCustomSubmit = React.useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      const trimmed = customInput.trim();
      if (!trimmed || yula.busy || isAnswered) return;
      setSelectedLabel(trimmed);
      yula.sendMessageText(trimmed);
    },
    [customInput, yula, isAnswered],
  );

  if (!choiceData) return null;

  // Yanıtlanmış kart görünümü
  if (isAnswered) {
    const displayText = selectedLabel || followUpText || t("option_selected");
    return (
      <div className="flex flex-col gap-1 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.04] dark:bg-emerald-500/[0.08] px-3.5 py-2.5 text-[12.5px] transition-all">
        <div className="flex items-center gap-2 text-muted-foreground font-medium">
          <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />
          <span className="line-clamp-1">{choiceData.question || t("default_question")}</span>
        </div>
        <div className="pl-5 font-semibold text-foreground">
          {displayText}
        </div>
      </div>
    );
  }

  // Canlı seçim kartı görünümü
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-primary/25 bg-gradient-to-br from-primary/[0.04] via-card to-orange-500/[0.04] dark:from-primary/10 dark:via-card dark:to-orange-500/10 p-3.5 shadow-xs transition-all">
      {/* Soru Başlığı */}
      <div className="flex items-start gap-2 text-[13px] font-semibold text-foreground leading-snug">
        <HelpCircle className="size-4 text-primary shrink-0 mt-0.5" />
        <span>{choiceData.question || t("default_question")}</span>
      </div>

      {/* Seçenek Butonları */}
      <div className="flex flex-col gap-1.5">
        {choiceData.options.map((opt, idx) => (
          <button
            key={`${opt.label}-${idx}`}
            type="button"
            disabled={yula.busy}
            onClick={() => handleSelect(opt)}
            className={cn(
              "group relative flex flex-col items-start gap-0.5 rounded-lg border border-border/70 bg-background/90 hover:bg-primary/[0.06] hover:border-primary/50 dark:hover:border-primary/60 px-3 py-2 text-left transition-all cursor-pointer",
              "active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
            )}
          >
            <div className="flex w-full items-center justify-between gap-2">
              <span className="text-[12.5px] font-medium text-foreground group-hover:text-primary transition-colors">
                {opt.label}
              </span>
              {opt.value && opt.value !== opt.label ? (
                <span className="shrink-0 rounded bg-muted/80 px-1.5 py-0.5 font-mono text-[10.5px] text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                  {opt.value}
                </span>
              ) : null}
            </div>
            {opt.description ? (
              <span className="text-[11.5px] text-muted-foreground/90 leading-tight">
                {opt.description}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {/* Doğrudan Görünür Serbest Giriş (Watermarklı Text Box) */}
      {choiceData.allowCustom ? (
        <form onSubmit={handleCustomSubmit} className="pt-1 flex items-center gap-1.5">
          <Input
            type="text"
            placeholder={customPlaceholder}
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            disabled={yula.busy}
            className="h-8 text-[12px] bg-background/90 placeholder:text-muted-foreground/60 border-border/80 focus-visible:ring-primary/40"
          />
          <Button
            type="submit"
            size="sm"
            disabled={!customInput.trim() || yula.busy}
            className="h-8 px-2.5 text-[12px] shrink-0"
          >
            <CornerDownLeft className="size-3.5 mr-1" />
            {t("send")}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
