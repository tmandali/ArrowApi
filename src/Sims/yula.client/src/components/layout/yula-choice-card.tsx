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
        const rationale = o.rationale != null ? String(o.rationale).trim() : undefined;
        const badge = o.badge != null ? String(o.badge).trim() : undefined;
        return { label, value, description, rationale, badge };
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

  const hasDetailedChoices = React.useMemo(() => {
    return (choiceData?.options ?? []).some((o) => Boolean(o.description || o.rationale));
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
    if (!nextUser?.parts) return "";
    const text = nextUser.parts
      .filter((p) => p.type === "text")
      .map((p) => (p as { text?: string }).text ?? "")
      .join("\n")
      .trim();
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

  // Canlı seçim kartı görünümü — Ayrıntılı kart listesi veya kompakt yatay bar
  if (hasDetailedChoices) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-border/70 bg-card/60 dark:bg-card/40 p-3 shadow-2xs transition-all my-1.5">
        {/* Soru Başlığı */}
        <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-foreground/90 leading-tight">
          <HelpCircle className="size-4 text-primary shrink-0" />
          <span>{choiceData.question || t("default_question")}</span>
        </div>

        {/* Seçenek Listesi (Ayrıntılı Kart Görünümü) */}
        <div className="flex flex-col gap-2 pt-1">
          {choiceData.options.map((opt, idx) => {
            const isFirst = idx === 0;
            return (
              <div
                key={`${opt.label}-${idx}`}
                className={cn(
                  "flex flex-col gap-1.5 rounded-lg border p-2.5 transition-all text-left",
                  isFirst
                    ? "border-primary/40 bg-primary/[0.03] dark:bg-primary/[0.06] hover:border-primary/60"
                    : "border-border/70 bg-background/60 hover:border-border hover:bg-muted/30",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-[12.5px] text-foreground">
                      {opt.label}
                    </span>
                    {opt.badge ? (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10.5px] font-medium bg-primary/10 text-primary border border-primary/20">
                        {opt.badge}
                      </span>
                    ) : isFirst ? (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10.5px] font-medium bg-primary/10 text-primary border border-primary/20">
                        {t("recommended") || "Önerilen"}
                      </span>
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    disabled={yula.busy}
                    onClick={() => handleSelect(opt)}
                    variant={isFirst ? "default" : "outline"}
                    className="h-6 px-2.5 text-[11.5px] shrink-0 font-medium cursor-pointer"
                  >
                    {t("select") || "Seç"}
                  </Button>
                </div>
                {opt.description ? (
                  <p className="text-[12px] text-foreground/80 leading-relaxed m-0">
                    {opt.description}
                  </p>
                ) : null}
                {opt.rationale ? (
                  <div className="flex items-start gap-1.5 text-[11.5px] text-muted-foreground bg-muted/40 rounded px-2 py-1 border border-border/40 mt-0.5">
                    <span className="font-medium text-foreground/70 shrink-0">
                      {t("rationale_label") || "Gerekçe / Etki"}:
                    </span>
                    <span className="leading-snug">{opt.rationale}</span>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        {/* Serbest Giriş Seçeneği */}
        {choiceData.allowCustom && !showCustomInput ? (
          <button
            type="button"
            onClick={() => setShowCustomInput(true)}
            className="inline-flex items-center gap-1 text-[11.5px] text-muted-foreground hover:text-foreground px-2 py-1 rounded-md hover:bg-muted/40 transition-colors cursor-pointer self-start mt-0.5"
            title={customPlaceholder}
          >
            <span>{t("custom_reply") || "Farklı bir şey yaz..."}</span>
          </button>
        ) : null}

        {/* Serbest Giriş Formu */}
        {choiceData.allowCustom && showCustomInput ? (
          <form onSubmit={handleCustomSubmit} className="pt-1 flex items-center gap-1.5 animate-in fade-in-0 slide-in-from-top-1 duration-150">
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

  // Canlı seçim kartı görünümü — Kompakt, ergonomik yatay buton barı
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border/70 bg-card/60 dark:bg-card/40 p-2.5 shadow-2xs transition-all">
      {/* Soru Başlığı */}
      <div className="flex items-center gap-1.5 text-[12px] font-medium text-foreground/90 leading-tight">
        <HelpCircle className="size-3.5 text-primary shrink-0" />
        <span>{choiceData.question || t("default_question")}</span>
      </div>

      {/* Seçenek Butonları (Kompakt Yatay Aksiyon Barı) */}
      <div className="flex flex-wrap items-center gap-1.5">
        {choiceData.options.map((opt, idx) => {
          const isFirst = idx === 0;
          const isCancel =
            opt.value === "cancel" ||
            opt.label.toLowerCase().includes("vazgeç") ||
            opt.label.toLowerCase().includes("cancel");

          return (
            <button
              key={`${opt.label}-${idx}`}
              type="button"
              disabled={yula.busy}
              onClick={() => handleSelect(opt)}
              onMouseEnter={() => setHoveredDesc(opt.description || null)}
              onMouseLeave={() => setHoveredDesc(null)}
              title={opt.description}
              className={cn(
                "group inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-medium transition-all cursor-pointer select-none",
                "active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed",
                isFirst
                  ? "bg-primary text-primary-foreground shadow-2xs hover:bg-primary/90"
                  : isCancel
                  ? "border border-border/50 bg-background/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                  : "border border-border/70 bg-background/80 text-foreground/90 hover:bg-muted/80 hover:border-border",
              )}
            >
              <span>{opt.label}</span>
            </button>
          );
        })}

        {choiceData.allowCustom && !showCustomInput ? (
          <button
            type="button"
            onClick={() => setShowCustomInput(true)}
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground px-2 py-1 rounded-md hover:bg-muted/40 transition-colors cursor-pointer"
            title={customPlaceholder}
          >
            <span>{t("custom_reply") || "Farklı bir şey yaz..."}</span>
          </button>
        ) : null}
      </div>

      {/* Buton üzerine gelindiğinde görünen açıklama ipucu */}
      {hoveredDesc ? (
        <div className="text-[11px] text-muted-foreground/80 pl-1 leading-tight animate-in fade-in-0 duration-150">
          • {hoveredDesc}
        </div>
      ) : null}

      {/* Açılabilir Serbest Giriş (Watermarklı Text Box) */}
      {choiceData.allowCustom && showCustomInput ? (
        <form onSubmit={handleCustomSubmit} className="pt-0.5 flex items-center gap-1.5 animate-in fade-in-0 slide-in-from-top-1 duration-150">
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
