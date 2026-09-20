"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import type { PlaybookLogItem } from "@my-agent/core";
import { Badge } from "@/components/ui/badge";
import { History } from "lucide-react";

interface PlaybookLogTabProps {
  logs: PlaybookLogItem[];
}

export function PlaybookLogTab({ logs }: PlaybookLogTabProps) {
  const t = useTranslations("Playbooks");

  if (logs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center rounded-lg border border-dashed border-border/80 bg-muted/10">
        <History className="size-8 text-muted-foreground/40 mb-2.5" />
        <p className="text-xs font-medium text-foreground">{t("empty_log_title")}</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden bg-card">
      <table className="w-full text-xs text-left">
        <thead className="bg-muted/40 border-b border-border text-muted-foreground uppercase text-[10px] tracking-wider">
          <tr>
            <th className="px-3.5 py-2.5 font-semibold">{t("col_date")}</th>
            <th className="px-3.5 py-2.5 font-semibold">{t("col_action")}</th>
            <th className="px-3.5 py-2.5 font-semibold">{t("col_title")}</th>
            <th className="px-3.5 py-2.5 font-semibold">{t("col_author")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60 font-mono text-[11px]">
          {logs.map((log, idx) => (
            <tr key={idx} className="hover:bg-muted/30 transition-colors">
              <td className="px-3.5 py-2.5 text-muted-foreground whitespace-nowrap">
                {log.timestamp}
              </td>
              <td className="px-3.5 py-2.5">
                <Badge
                  variant="outline"
                  className={`h-4 px-1.5 text-[9.5px] uppercase font-semibold ${
                    log.action.includes("rejected")
                      ? "text-destructive border-destructive/30"
                      : log.action.includes("proposal")
                        ? "text-amber-600 dark:text-amber-400 border-amber-500/30"
                        : "text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                  }`}
                >
                  {log.action}
                </Badge>
              </td>
              <td className="px-3.5 py-2.5 text-foreground font-sans font-medium">
                {log.title}
              </td>
              <td className="px-3.5 py-2.5 text-muted-foreground font-sans">
                {log.author}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
