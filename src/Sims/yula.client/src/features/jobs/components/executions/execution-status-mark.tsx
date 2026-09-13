"use client";

import { CircleCheck, CircleX, Loader2, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { statusTone } from "@/features/jobs/lib/status-tone";
import { cn } from "@/utils/cn";

export function ExecutionStatusMark({
  status,
  onDelete,
  t,
}: {
  status: string;
  onDelete?: () => void;
  t: (key: string) => string;
}) {
  switch (status) {
    case "Completed": {
      const mark = (
        <span
          className="relative block size-4 shrink-0"
          role="img"
          aria-label="Completed"
        >
          <CircleCheck
            className="absolute inset-0 size-4 text-primary/70 transition-opacity group-hover:opacity-0 dark:text-sidebar-primary/80"
            aria-hidden
          />
          <Trash2
            className="absolute inset-0 size-4 text-destructive/70 opacity-0 transition-opacity group-hover:opacity-100"
            aria-hidden
          />
        </span>
      );
      if (!onDelete) return mark;
      return (
        <span
          role="button"
          tabIndex={-1}
          title={t("delete_execution")}
          aria-label={t("delete_execution")}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onDelete();
          }}
          className="flex size-5 shrink-0 items-center justify-center rounded"
        >
          {mark}
        </span>
      );
    }
    case "Failed":
    case "Cancelled":
    case "Canceled": {
      const isFailed = status === "Failed";
      const Icon = CircleX;
      const mark = (
        <span
          className="relative block size-4 shrink-0"
          role="img"
          aria-label={status}
        >
          <Icon
            className={cn(
              "absolute inset-0 size-4 transition-opacity",
              isFailed ? "text-destructive/70" : "text-muted-foreground/70",
              onDelete && "group-hover:opacity-0"
            )}
            aria-hidden
          />
          {onDelete ? (
            <Trash2
              className="absolute inset-0 size-4 text-destructive/70 opacity-0 transition-opacity group-hover:opacity-100"
              aria-hidden
            />
          ) : null}
        </span>
      );
      if (!onDelete) return mark;
      return (
        <span
          role="button"
          tabIndex={-1}
          title={`Delete ${status.toLowerCase()} execution`}
          aria-label={`Delete ${status.toLowerCase()} execution`}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onDelete();
          }}
          className="flex size-5 shrink-0 items-center justify-center rounded"
        >
          {mark}
        </span>
      );
    }
    case "Running":
      return (
        <Loader2
          className="size-3.5 shrink-0 animate-spin text-primary/60"
          aria-label="Running"
        />
      );
    case "Queued":
      return (
        <span
          className="size-2 shrink-0 rounded-full bg-orange-500/50"
          title="Queued"
          aria-label="Queued"
        />
      );
    default:
      return (
        <Badge
          variant={statusTone(status)}
          className="h-5 shrink-0 px-1.5 text-[10px]"
        >
          {status}
        </Badge>
      );
  }
}
