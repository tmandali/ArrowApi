"use client";

import { cn } from "@/utils/cn";

export type RecordMode = "new" | "edit" | "view";

const MODE_LABEL: Record<RecordMode, string> = {
  new: "Yeni",
  edit: "Düzenleme",
  view: "Salt okunur",
};

const MODE_CLASS: Record<RecordMode, string> = {
  new: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  edit: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  view: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400",
};

/**
 * Kayıt sayfa modu rozeti (new/edit/view): detay başlığı yanında
 * tipe göre renklendirilir.
 */
export function RecordModeChip({
  mode,
  className,
}: {
  mode: RecordMode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "shrink-0 rounded px-1.5 py-px font-sans text-[10px] font-medium",
        MODE_CLASS[mode],
        className,
      )}
    >
      {MODE_LABEL[mode]}
    </span>
  );
}
