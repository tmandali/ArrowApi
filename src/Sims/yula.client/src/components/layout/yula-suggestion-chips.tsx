"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Compass, FileSpreadsheet, LineChart, Sparkles } from "lucide-react";
import { cn } from "@/utils/cn";
import { useYulaChat } from "@/hooks/use-yula-chat";
import { findReport } from "@/features/reports/report-registry";
import {
  asSuggestions,
  type YulaSuggestion,
  type YulaSuggestionKind,
} from "@/lib/yula-suggestions";

function kindIcon(kind: YulaSuggestionKind) {
  switch (kind) {
    case "report":
      return FileSpreadsheet;
    case "navigation":
      return Compass;
    case "analysis":
      return LineChart;
    case "finding":
    default:
      return Sparkles;
  }
}

/**
 * Yapılandırılmış öneri çipleri (suggest_next_steps çıktısı).
 * Tıklama amaca göre dallanır: finding/analysis → prompt gönderilir,
 * report/navigation → uygulama-içi yönlendirme (kayıtsız scope/yol
 * varsa prompt yedeğine düşer). Prose heuristiği yedeği durur.
 */
export function YulaSuggestionChips({
  input,
  output,
}: {
  input?: unknown;
  output?: unknown;
}) {
  const yula = useYulaChat();
  const router = useRouter();
  const [used, setUsed] = React.useState<ReadonlySet<number>>(new Set());
  const suggestions = React.useMemo(() => {
    const fromInput = asSuggestions(input);
    return fromInput.length > 0 ? fromInput : asSuggestions(output);
  }, [input, output]);
  const canSend = !yula.busy;

  const handleClick = React.useCallback(
    (index: number, suggestion: YulaSuggestion) => {
      if (suggestion.kind === "report") {
        const pagePath = suggestion.scope
          ? (findReport(suggestion.scope)?.pagePath ?? null)
          : null;
        if (pagePath) {
          setUsed((prev) => new Set(prev).add(index));
          router.push(pagePath);
          return;
        }
      }
      if (suggestion.kind === "navigation" && suggestion.path) {
        setUsed((prev) => new Set(prev).add(index));
        router.push(suggestion.path);
        return;
      }
      const prompt = suggestion.prompt?.trim() || suggestion.title;
      if (!prompt || !canSend) return;
      setUsed((prev) => new Set(prev).add(index));
      yula.sendMessageText(prompt);
    },
    [canSend, router, yula],
  );

  if (suggestions.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 px-1 py-0.5">
      {suggestions.map((s, idx) => {
        const Icon = kindIcon(s.kind);
        const isUsed = used.has(idx);
        return (
          <button
            key={`${s.kind}-${s.title.slice(0, 48)}-${idx}`}
            type="button"
            onClick={() => handleClick(idx, s)}
            disabled={s.kind !== "report" && s.kind !== "navigation" && !canSend}
            title={
              s.kind === "report" || s.kind === "navigation"
                ? `"${s.title}" ekranını açmak için tıklayın`
                : `"${s.prompt ?? s.title}" olarak sormak için tıklayın`
            }
            className={cn(
              "inline-flex max-w-full cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-medium transition-all select-none",
              "border-orange-500/30 bg-orange-500/10 text-orange-700 hover:bg-orange-500/20 dark:text-orange-300",
              "disabled:cursor-default disabled:opacity-60",
              isUsed && "opacity-60",
            )}
          >
            <Icon className="size-3.5 shrink-0 text-orange-500" />
            <span className="truncate">{s.title}</span>
          </button>
        );
      })}
    </div>
  );
}
