"use client";

import { CheckCircle2 } from "lucide-react";

import { isHitlResolved } from "@/lib/contracts/hitl-prompt";

export interface HitlResolutionBadgeProps {
  input?: unknown;
  output?: unknown;
  isPending?: boolean;
}

/**
 * Immutable historical resolution badge for decisions, choices, and confirmations.
 * Renders in chat turn history once a decision is resolved (or subtle indicator if pending),
 * completely replacing heavy inline choice cards.
 */
export function HitlResolutionBadge({
  input,
  output,
  isPending = false,
}: HitlResolutionBadgeProps) {
  const inObj = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const outObj = (output && typeof output === "object" ? output : {}) as Record<string, unknown>;
  const outDetails = (outObj.details && typeof outObj.details === "object" ? outObj.details : {}) as Record<string, unknown>;

  const question =
    typeof inObj.question === "string" && inObj.question.trim()
      ? inObj.question.trim()
      : typeof outDetails.question === "string" && outDetails.question.trim()
        ? outDetails.question.trim()
        : typeof inObj.title === "string" && inObj.title.trim()
          ? inObj.title.trim()
          : typeof outDetails.title === "string" && outDetails.title.trim()
            ? outDetails.title.trim()
            : "Kullanıcı Onayı / Seçimi";

  const resolved = isHitlResolved(output);
  const selected =
    outObj.selected ?? outObj.choice ?? (outObj.approved ? "Evet" : undefined) ?? (resolved ? outObj.value : undefined);

  if (isPending || !resolved) {
    return null;
  }

  return (
    <div className="flex flex-col gap-1 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.04] dark:bg-emerald-500/[0.08] px-3 py-2 text-[12px] transition-all my-1">
      <div className="flex items-center gap-1.5 text-muted-foreground font-medium text-[11.5px]">
        <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />
        <span className="line-clamp-1">{question}</span>
      </div>
      <div className="pl-5 font-medium text-foreground text-[12px]">
        {selected ? String(selected) : "Onaylandı"}
      </div>
    </div>
  );
}
