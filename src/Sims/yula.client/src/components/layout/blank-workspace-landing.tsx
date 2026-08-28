"use client";

import * as React from "react";
import { type LucideIcon, Sparkles } from "lucide-react";
import { WorkspacePinnedItemsGrid } from "@/components/layout/workspace-pinned-items-grid";

interface BlankWorkspaceLandingProps {
  title: string;
  description: string;
  icon: LucideIcon;
}

export function BlankWorkspaceLanding({
  title,
  description,
  icon: Icon,
}: BlankWorkspaceLandingProps) {
  return (
    <div className="flex h-full min-h-[400px] flex-1 flex-col items-center justify-start py-8 px-4 text-center select-none animate-in fade-in-50 duration-200 overflow-y-auto">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-3 shadow-sm ring-1 ring-primary/20">
        <Icon className="size-7" />
      </div>
      <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
      <p className="mt-1 max-w-sm text-xs text-muted-foreground/80 leading-relaxed">
        {description}
      </p>

      {/* Workspace Pinned Items Section */}
      <WorkspacePinnedItemsGrid className="mt-6" />

      <div className="mt-6 flex items-center gap-2 rounded-full border border-border/40 bg-muted/30 px-3.5 py-1.5 text-xs text-muted-foreground/70">
        <Sparkles className="size-3.5 text-amber-500 shrink-0" />
        <span>
          Arama yapmak için header arama kutusunu veya{" "}
          <kbd className="font-mono text-[10px] bg-muted px-1.5 py-0.5 rounded border border-border/50">⌘K</kbd>{" "}
          tuşlarını kullanabilirsiniz.
        </span>
      </div>
    </div>
  );
}
