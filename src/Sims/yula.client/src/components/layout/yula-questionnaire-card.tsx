"use client";

import * as React from "react";
import {
  Questionnaire,
  QuestionnaireActions,
  QuestionnaireChoice,
  QuestionnaireChoices,
  QuestionnaireDescription,
  QuestionnaireError,
  QuestionnaireInput,
  QuestionnaireItem,
  QuestionnaireNext,
  QuestionnairePrevious,
  QuestionnaireProgress,
  QuestionnaireSkip,
  QuestionnaireSubmit,
  QuestionnaireTitle,
} from "@/components/ui/questionnaire";
import { useYulaChat } from "@/hooks/use-yula-chat";
import { cn } from "@/utils/cn";
import { MessageCircleQuestionMark, Check } from "lucide-react";

export interface YulaQuestionChoice {
  value: string;
  label: string;
  description?: string;
}

export interface YulaQuestion {
  id: string;
  prompt: string;
  description?: string;
  required?: boolean;
  multiple?: boolean;
  defaultValue?: string;
  choices: YulaQuestionChoice[];
}

function asQuestions(value: unknown): YulaQuestion[] {
  const root = value as { questions?: unknown } | null;
  const raw = root && Array.isArray(root.questions) ? root.questions : [];
  return raw
    .map((q): YulaQuestion | null => {
      const o = q as Partial<YulaQuestion>;
      const choices = Array.isArray(o.choices)
        ? o.choices.filter(
            (c): c is YulaQuestionChoice =>
              !!c && typeof c.value === "string" && typeof c.label === "string",
          )
        : [];
      if (typeof o.id !== "string" || typeof o.prompt !== "string") return null;
      if (choices.length === 0) return null;
      return {
        id: o.id,
        prompt: o.prompt,
        description: typeof o.description === "string" ? o.description : undefined,
        required: o.required === true,
        multiple: o.multiple === true,
        defaultValue: typeof o.defaultValue === "string" ? o.defaultValue : undefined,
        choices,
      } satisfies YulaQuestion;
    })
    .filter((q): q is YulaQuestion => q !== null)
    .slice(0, 3);
}

interface SubmittedAnswers {
  answers: Record<string, string[]>;
  freeform: Record<string, string>;
  skipped: string[];
}

export function YulaQuestionnaireCard({
  messageId,
  input,
  output,
}: {
  messageId?: string;
  input?: unknown;
  output?: unknown;
}) {
  const yula = useYulaChat();
  const questions = React.useMemo(
    () =>
      asQuestions(output).length > 0
        ? asQuestions(output)
        : asQuestions(input),
    [input, output],
  );
  const [submitted, setSubmitted] = React.useState<SubmittedAnswers | null>(null);
  const [freeform, setFreeform] = React.useState<Record<string, string>>({});
  const [picked, setPicked] = React.useState<Record<string, string[]>>({});

  // Bu turdan sonra gelen bir kullanıcı mesajı varsa soru cevaplanmış sayılır
  const answeredByFollowUp = React.useMemo(() => {
    if (!messageId) return false;
    const idx = yula.messages.findIndex((m) => m.id === messageId);
    if (idx < 0) return false;
    return yula.messages.slice(idx + 1).some((m) => m.role === "user");
  }, [yula.messages, messageId]);

  const answered = submitted !== null || answeredByFollowUp;

  const handleChoiceChange = React.useCallback(
    (questionId: string, multiple: boolean) =>
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setPicked((prev) => {
          const current = prev[questionId] ?? [];
          if (multiple) {
            return {
              ...prev,
              [questionId]: e.target.checked
                ? [...current, value]
                : current.filter((v) => v !== value),
            };
          }
          return { ...prev, [questionId]: [value] };
        });
      },
    [],
  );

  const handleSubmit = React.useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (questions.length === 0 || yula.busy) return;
      const form = new FormData(e.currentTarget);
      const answers: Record<string, string[]> = {};
      const skipped: string[] = [];
      const lines: string[] = [];
      for (const q of questions) {
        // FormData birincil, lokal ayna yedek (klavye kısayolları dahil).
        // Serbest metin headless input üzerinden de FormData'ya düşebilir —
        // çift yazımı önlemek için şık değerlerinden ayıkla, tek kaynaktan ekle.
        const free = (freeform[q.id] ?? "").trim();
        const fromForm = form.getAll(q.id).map(String).filter(Boolean);
        const merged = fromForm.length > 0 ? [...new Set(fromForm)] : [...new Set(picked[q.id] ?? [])];
        const vals = free ? merged.filter((v) => v.trim() !== free) : merged;
        answers[q.id] = vals;
        const labels = vals.map(
          (v) => q.choices.find((c) => c.value === v)?.label ?? v,
        );
        if (free) labels.push(free);
        if (labels.length === 0) {
          skipped.push(q.id);
          lines.push(
            q.defaultValue
              ? `• ${q.prompt}: (atlandı → varsayılan: ${q.defaultValue})`
              : `• ${q.prompt}: (atlandı)`,
          );
        } else {
          lines.push(`• ${q.prompt}: ${labels.join(", ")}`);
        }
      }
      setSubmitted({ answers, freeform: { ...freeform }, skipped });
      yula.sendMessageText(lines.join("\n"));
    },
    [questions, picked, freeform, yula],
  );

  if (questions.length === 0) return null;

  if (answered) {
    return (
      <div className="flex flex-col gap-1.5 rounded-lg border border-border/70 bg-muted/30 px-3 py-2.5">
        <div className="flex items-center gap-1.5 text-[12px] font-semibold text-muted-foreground">
          <Check className="size-3.5 text-emerald-500" />
          Cevaplanan sorular
        </div>
        {questions.map((q) => {
          const vals = submitted?.answers[q.id] ?? [];
          const free = (submitted?.freeform[q.id] ?? "").trim();
          const labels = vals.map(
            (v) => q.choices.find((c) => c.value === v)?.label ?? v,
          );
          if (free) labels.push(free);
          const wasSkipped =
            submitted != null && submitted.skipped.includes(q.id);
          return (
            <div key={q.id} className="text-[12px] leading-relaxed">
              <span className="font-medium text-foreground">{q.prompt}</span>
              <span className="text-muted-foreground">
                {" — "}
                {labels.length > 0
                  ? labels.join(", ")
                  : wasSkipped
                    ? q.defaultValue
                      ? `(atlandı → varsayılan: ${q.defaultValue})`
                      : "(atlandı)"
                    : "(cevaplandı)"}
              </span>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-lg border border-amber-500/35 bg-amber-500/[0.06] px-3 py-2.5",
        "dark:border-amber-400/25 dark:bg-amber-400/[0.05]",
      )}
    >
      <div className="flex items-center gap-1.5 text-[12px] font-semibold text-amber-900 dark:text-amber-200">
        <MessageCircleQuestionMark className="size-3.5 shrink-0" />
        Devam etmek için cevabınız gerekiyor
      </div>
      <Questionnaire
        items={questions.map((q) => ({ name: q.id, required: q.required ?? false }))}
        shortcuts="letters"
        onSubmit={handleSubmit}
      >
        <QuestionnaireProgress />
        {questions.map((q) => (
          <QuestionnaireItem
            key={q.id}
            name={q.id}
            required={q.required}
            multiple={q.multiple}
          >
            <QuestionnaireTitle>{q.prompt}</QuestionnaireTitle>
            {q.description ? (
              <QuestionnaireDescription>{q.description}</QuestionnaireDescription>
            ) : null}
            <QuestionnaireChoices>
              {q.choices.map((c) => (
                <QuestionnaireChoice
                  key={c.value}
                  value={c.value}
                  onChange={handleChoiceChange(q.id, q.multiple === true)}
                >
                  <span className="font-medium">{c.label}</span>
                  {c.description ? (
                    <span className="text-muted-foreground">{c.description}</span>
                  ) : null}
                </QuestionnaireChoice>
              ))}
              <QuestionnaireInput
                aria-label="Kendi cevabınız"
                placeholder="Kendi cevabınızı yazın…"
                value={freeform[q.id] ?? ""}
                onChange={(e) =>
                  setFreeform((prev) => ({ ...prev, [q.id]: e.target.value }))
                }
              />
            </QuestionnaireChoices>
            <QuestionnaireError />
          </QuestionnaireItem>
        ))}
        <QuestionnaireActions>
          <QuestionnairePrevious />
          <QuestionnaireSkip />
          <QuestionnaireNext />
          <span className="flex-1" />
          <QuestionnaireSubmit>Gönder</QuestionnaireSubmit>
        </QuestionnaireActions>
      </Questionnaire>
    </div>
  );
}
