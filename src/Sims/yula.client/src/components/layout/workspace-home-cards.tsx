"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { WORKSPACE_CARDS } from "@/lib/workspace-cards";

export function WorkspaceHomeCards() {
  return (
    <div className="w-full max-w-3xl px-3 pt-2 animate-in fade-in-50 slide-in-from-bottom-2 duration-300">
      <div className="flex items-center justify-between mb-3 px-1">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">
          Çalışma Alanları (Workspaces)
        </h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {WORKSPACE_CARDS.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.id}
              href={item.url}
              className="group relative flex items-start gap-3.5 rounded-xl border border-border/60 bg-background/50 hover:bg-accent/40 p-3.5 transition-all duration-200 hover:border-primary/40 hover:shadow-sm"
            >
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors duration-200">
                <Icon className="size-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <h3 className="text-xs font-semibold tracking-tight truncate">
                    <span className="text-primary dark:text-sidebar-primary">
                      {item.titleLead}
                    </span>{" "}
                    <span className="text-orange-600 dark:text-orange-400">
                      {item.titleTrail}
                    </span>
                  </h3>
                  <ChevronRight className="size-3.5 text-muted-foreground/40 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
                </div>
                <p className="mt-0.5 text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                  {item.description}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
