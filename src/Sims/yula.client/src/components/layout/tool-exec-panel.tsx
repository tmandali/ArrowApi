"use client";

import * as React from "react";
import { ChevronDown, Wrench } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChatMarkdown } from "./chat-markdown";
import { cn } from "@/utils/cn";

/**
 * Kartı olmayan araçların (profile_grid_table, analyze_grid_data, run_report…)
 * teknik detay katmanı — İstek/Yanıt ayrımı olmadan birleşik Markdown kod bloğu
 * ve Shiki renklendirmeli kopyalanabilir görünüm sunar.
 */
export function ToolExecPanel({
  toolName,
  input,
  output,
  errorText,
  isError,
  className,
}: {
  toolName: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
  isError?: boolean;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);

  const payload: Record<string, unknown> = {};
  if (input !== undefined && input !== null) {
    payload.input = input;
  }
  if (errorText) {
    payload.error = errorText;
  } else if (output !== undefined && output !== null) {
    payload.output = output;
  }

  if (Object.keys(payload).length === 0) return null;

  const markdownText = "```json\n" + JSON.stringify(payload, null, 2) + "\n```";

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className={cn("w-full space-y-1.5", className)}
    >
      <CollapsibleTrigger className="group/exec flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground">
        <Wrench
          className={cn(
            "size-3.5 shrink-0",
            isError
              ? "text-red-500/80 dark:text-red-400/80"
              : "text-sky-500/80 dark:text-sky-400/80",
          )}
        />
        <span>Araç Çalıştırma</span>
        <span className="font-normal text-foreground/60">· {toolName}</span>
        <ChevronDown className="size-3 shrink-0 transition-transform duration-200 group-data-[state=open]/exec:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="border-l-2 border-sky-500/30 pl-3 dark:border-sky-400/30">
          <ChatMarkdown
            text={markdownText}
            isExecutionConfirmation={false}
            columns={[]}
            onPrompt={() => {}}
            onNavigateReport={() => false}
          />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
