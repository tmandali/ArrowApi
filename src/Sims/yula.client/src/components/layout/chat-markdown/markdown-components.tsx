"use client";

import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Check, ChevronDown, Copy, Sparkles, Table } from "lucide-react";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { CodeBlock } from "@/components/ui/code-block";
import { cn } from "@/utils/cn";
import { copyToClipboard } from "@/lib/clipboard";
import { useYulaGridStore } from "@/lib/stores/grid";
import { KNOWN_SYSTEM_ACTIONS } from "@/lib/yula-actions";
import { defaultReportScope, reportPageForAction } from "./markdown-entities";
import { useChatMarkdownCallbacks } from "./markdown-context";
import { CriteriaApplyChip, FileOpenChip } from "./markdown-chips";
import { extractCodeDetails } from "./markdown-component-map";

export function MarkdownPreBlock({ children }: { children?: React.ReactNode }) {
  const t = useTranslations("ChatMarkdown");
  const [copied, setCopied] = React.useState(false);
  const [open, setOpen] = React.useState(true);
  const { text, language } = React.useMemo(() => extractCodeDetails(children), [children]);

  const lineCount = React.useMemo(() => (text ? text.split("\n").length : 1), [text]);

  const handleCopy = React.useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!text) return;
      const success = await copyToClipboard(text);
      if (success) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    },
    [text],
  );

  const isSql = language === "sql" || language === "sqlite" || /select\s+.*from\s+/i.test(text);

  const handleShowInGrid = React.useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!text) return;
      useYulaGridStore.getState().setCustomQuerySql(text);
    },
    [text]
  );

  const langTitle = (language ?? "code").toUpperCase();

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="group relative my-1 overflow-hidden rounded-lg border border-border/40 bg-muted/20 dark:bg-muted/20"
    >
      <div
        onClick={() => setOpen((prev) => !prev)}
        className="flex cursor-pointer items-center justify-between border-b border-border/30 bg-muted/40 px-2.5 py-1 text-[10.5px] font-medium text-muted-foreground hover:bg-muted/60 transition-colors select-none"
      >
        <div className="flex items-center gap-1.5">
          <ChevronDown
            className={cn(
              "size-3 text-muted-foreground/70 transition-transform duration-200",
              !open && "-rotate-90"
            )}
          />
          <span className="font-mono font-semibold tracking-wider text-foreground/80">
            {langTitle}
          </span>
          <span className="text-[10px] text-muted-foreground/60 font-mono">
            ({t("line_count", { count: lineCount })})
          </span>
        </div>

        <div className="flex items-center gap-1">
          {isSql ? (
            <button
              type="button"
              onClick={handleShowInGrid}
              title={t("show_in_grid")}
              className="rounded-md p-0.5 text-sky-600 dark:text-sky-400 hover:bg-sky-500/10 transition-colors cursor-pointer select-none"
            >
              <Table className="size-3.5 shrink-0" />
            </button>
          ) : null}

          <button
            type="button"
            onClick={handleCopy}
            title={copied ? t("code_copied") : t("copy_code")}
            className="rounded-md p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
          >
            {copied ? (
              <Check className="size-3.5 text-emerald-500" />
            ) : (
              <Copy className="size-3.5" />
            )}
          </button>
        </div>
      </div>

      <CollapsibleContent>
        {language ? (
          <CodeBlock
            value={text}
            language={language}
            showCopyButton={false}
            className="max-h-64 border-0 p-2 text-[11px] shadow-none rounded-none"
          />
        ) : (
          <pre className="max-h-64 overflow-auto p-2 font-mono text-[11px] leading-snug text-foreground/90">
            {children}
          </pre>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

export function MarkdownHeading({ children }: { children?: React.ReactNode }) {
  return (
    <div className="mb-0.5 mt-2 flex items-center gap-1.5">
      <span className="h-3 w-0.5 rounded-full bg-orange-500/70 dark:bg-orange-400/70" />
      <span className="text-[12px] font-semibold text-foreground">{children}</span>
    </div>
  );
}

/** yula-prompt / yula-report / yula-file protokollü linkleri bileşenlere çevirir */
export function ChatMarkdownLink({
  href,
  children,
}: {
  href?: string;
  children?: React.ReactNode;
}) {
  const t = useTranslations("ChatMarkdown");
  const { onPrompt, onNavigateReport, isExecutionConfirmation } =
    useChatMarkdownCallbacks();

  if (!href) return <span>{children}</span>;

  if (href.startsWith("yula-prompt:")) {
    const prompt = decodeURIComponent(href.slice("yula-prompt:".length));
    return (
      <button
        type="button"
        onClick={() => onPrompt(prompt)}
        title={t("run_cmd", { cmd: prompt })}
        className="inline-flex items-center gap-1.5 my-0.5 mx-1 px-2 py-0.5 rounded-md bg-orange-500/10 text-orange-600 dark:text-orange-400 hover:bg-orange-500/20 font-medium text-[11.5px] border border-orange-500/25 transition-all cursor-pointer select-none align-middle hover:scale-[1.02] active:scale-[0.98]"
      >
        <Sparkles className="size-3 shrink-0 text-orange-500" />
        <span>{children}</span>
      </button>
    );
  }

  if (href.startsWith("yula-report:")) {
    const [promptEnc, labelEnc] = href.slice("yula-report:".length).split("|");
    const prompt = decodeURIComponent(promptEnc ?? "");
    const label = decodeURIComponent(labelEnc ?? "");
    // Kayıtlı rapor: "X hazırla" mesajı göndermek yerine ekranı açar.
    const action = KNOWN_SYSTEM_ACTIONS.find((a) => a.prompt === prompt);
    const page = reportPageForAction(action);
    if (page) {
      return (
        <Link
          href={page}
          title={t("open_report_screen", { title: label })}
          className="inline cursor-pointer bg-transparent p-0 text-left align-baseline font-semibold text-foreground transition-colors hover:text-orange-600 dark:hover:text-orange-400 hover:underline"
        >
          {children}
        </Link>
      );
    }
    return (
      <button
        type="button"
        onClick={() => {
          if (isExecutionConfirmation) {
            const navigated = onNavigateReport(label);
            if (navigated) return;
          }
          onPrompt(prompt);
        }}
        title={isExecutionConfirmation ? t("open_report_results", { title: label }) : t("open_report_screen", { title: label })}
        className="inline cursor-pointer bg-transparent p-0 text-left align-baseline font-semibold text-foreground transition-colors hover:text-orange-600 dark:hover:text-orange-400 hover:underline"
      >
        {children}
      </button>
    );
  }

  if (href.startsWith("yula-file:")) {
    const [pathEnc, query] = href.slice("yula-file:".length).split("?label=");
    const path = decodeURIComponent(pathEnc ?? "");
    const label = decodeURIComponent((query ?? "").replace(/^label=/, ""));
    return <FileOpenChip path={path} label={label || path} />;
  }

  if (href.startsWith("yula-criteria:")) {
    const raw = href.slice("yula-criteria:".length);
    let scope = defaultReportScope();
    const criteria: Record<string, unknown> = {};

    try {
      if (raw.startsWith("{")) {
        const parsed = JSON.parse(decodeURIComponent(raw));
        scope = parsed.scope || defaultReportScope();
        Object.assign(criteria, parsed.criteria || {});
      } else {
        const [scopePart, queryPart] = raw.split("?");
        scope = decodeURIComponent(scopePart || defaultReportScope());
        if (queryPart) {
          const params = new URLSearchParams(queryPart);
          params.forEach((v, k) => {
            criteria[k] = v;
          });
        }
      }
    } catch (e) {
      console.warn("Failed to parse yula-criteria URL:", e);
    }

    return (
      <CriteriaApplyChip scope={scope} criteria={criteria}>
        {children}
      </CriteriaApplyChip>
    );
  }

  if (href.startsWith("/")) {
    return (
      <Link
        href={href}
        className="text-orange-600 font-semibold hover:underline dark:text-orange-400"
      >
        {children}
      </Link>
    );
  }

  return (
    <a href={href} className="text-orange-600 hover:underline dark:text-orange-400">
      {children}
    </a>
  );
}
