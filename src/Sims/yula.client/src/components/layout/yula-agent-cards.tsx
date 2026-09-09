"use client";

import * as React from "react";
import { Bot, Check, Plus } from "lucide-react";
import { cn } from "@/utils/cn";
import { useUserAgentsStore } from "@/lib/stores/user-agents";
import { filterAgentsByScope } from "@/lib/yula-user-agent";
import { YulaThinkingToggle } from "@/components/layout/yula-model-selector";

/**
 * Ajan kart ızgarası (workspace kartları deseni): boş sohbette gösterilir.
 * Varsayılan Yula için kart yoktur — seçim yokluğu = Yula.
 * Karta tıklama seçer/seçimi kaldırır.
 */
export function YulaAgentCards({
  workspaceId,
  onManage,
  className,
}: {
  workspaceId?: string | null;
  onManage: (editingId?: string | null) => void;
  className?: string;
}) {
  const agents = useUserAgentsStore((s) => s.agents);
  const activeAgentId = useUserAgentsStore((s) => s.activeAgentId);
  const setActiveAgentId = useUserAgentsStore((s) => s.setActiveAgentId);

  const inScope = React.useMemo(
    () => filterAgentsByScope(agents, workspaceId),
    [agents, workspaceId],
  );

  return (
    <div className={cn("w-full max-w-3xl px-3 pt-2 animate-in fade-in-50 slide-in-from-bottom-2 duration-300", className)}>
      <div className="flex items-center justify-between mb-3 px-1">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">
          Ajanlar (Agents)
        </h2>
        <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
          Düşünme
          <YulaThinkingToggle />
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {inScope.map((a) => {
          const isActive = a.id === activeAgentId;
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => setActiveAgentId(isActive ? null : a.id)}
              title={isActive ? "Seçimi kaldır (varsayılan Yula)" : `${a.name} ile konuş`}
              className={cn(
                "group relative flex items-start gap-3.5 rounded-xl border p-3.5 text-left transition-all duration-200 hover:shadow-sm",
                isActive
                  ? "border-primary/60 bg-primary/[0.06] hover:border-primary"
                  : "border-border/60 bg-background/50 hover:bg-accent/40 hover:border-primary/40",
              )}
            >
              <div
                className={cn(
                  "flex size-10 shrink-0 items-center justify-center rounded-lg transition-colors duration-200",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground",
                )}
              >
                <Bot className="size-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <h3 className="text-xs font-semibold tracking-tight truncate">
                    {a.name}
                  </h3>
                  {isActive ? (
                    <Check className="size-3.5 text-primary shrink-0" />
                  ) : null}
                </div>
                <p className="mt-0.5 text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                  {a.description || "Özel ajan kimliği"}
                </p>
                {a.model ? (
                  <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground/70">
                    {a.model}
                  </p>
                ) : null}
              </div>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => onManage(null)}
          className="group flex items-center gap-3.5 rounded-xl border border-dashed border-border p-3.5 text-left transition-all duration-200 hover:border-primary/50"
        >
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground group-hover:text-primary transition-colors">
            <Plus className="size-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-xs font-semibold tracking-tight text-muted-foreground group-hover:text-foreground">
              Yeni ajan
            </h3>
            <p className="mt-0.5 text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
              Talimat + araç + skill setiyle kendi kimliğini tanımla
            </p>
          </div>
        </button>
      </div>
    </div>
  );
}
