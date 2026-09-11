"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil, Plus } from "lucide-react";
import { cn } from "@/utils/cn";
import { useUserAgentsStore } from "@/lib/stores/user-agents";
import { filterAgentsByScope } from "@/lib/yula-user-agent";
import { agentSessionPath } from "@/lib/workspace-paths";
import { AgentAvatar } from "@/features/system/components/agents/agent-avatar";
import { agentInitials } from "@/features/system/components/agents/agent-initials";

/**
 * Ajan kart ızgarası (workspace kartları deseni): boş sohbette gösterilir.
 * Varsayılan Yula için kart yoktur — seçim yokluğu = Yula.
 * Karta tıklama SADECE ayrı ajan oturumuna gider (/agents/<id>); global
 * seçimi değiştirmez. Tik, dock anahtarıyla seçili global personayı gösterir.
 * `showAll` (ana sayfa başlatıcı): kapsam filtresi uygulanmaz, tüm ajanlar
 * listelenir — oturumlar zaten kapsam bağımsız açılır.
 */
export function YulaAgentCards({
  workspaceId,
  onManage,
  className,
  showAll = false,
  columns = 2,
  showCreate = true,
  variant = "chat",
}: {
  workspaceId?: string | null;
  onManage: (editingId?: string | null) => void;
  className?: string;
  showAll?: boolean;
  /** Kart ızgarası sütun sayısı (sohbet: 2, landing: 4). */
  columns?: 2 | 4;
  /** Sondaki "Yeni ajan" oluşturma kartı (landing'te gizli). */
  showCreate?: boolean;
  /** Görsel dil: sohbet (vurgulu kart) veya landing (soft muted kutu). */
  variant?: "chat" | "landing";
}) {
  const router = useRouter();
  const agents = useUserAgentsStore((s) => s.agents);
  const activeAgentId = useUserAgentsStore((s) => s.activeAgentId);

  const inScope = React.useMemo(
    () => (showAll ? agents : filterAgentsByScope(agents, workspaceId)),
    [agents, workspaceId, showAll],
  );

  const isLanding = variant === "landing";

  return (
    <div className={cn("w-full max-w-3xl px-3 pt-2 animate-in fade-in-50 slide-in-from-bottom-2 duration-300", className)}>
      {isLanding ? (
        <div className="flex items-center gap-1.5 px-1 text-[11px] font-medium text-muted-foreground/80">
          <span>Ajanlar</span>
          <span className="text-[10px] text-muted-foreground/60">({inScope.length})</span>
        </div>
      ) : (
        <div className="flex items-center justify-between mb-3 px-1">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">
            Ajanlar (Agents)
          </h2>
        </div>
      )}
      <div className={cn("grid grid-cols-1 gap-3", columns === 4 ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-2")}>
        {inScope.map((a) => {
          const isActive = a.id === activeAgentId;
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => {
                router.push(agentSessionPath(a.id));
              }}
              title={`${a.name} ile ayrı oturumda konuş`}
              className={cn(
                "group relative flex items-start gap-3 rounded-xl p-3.5 text-left transition-colors duration-200",
                isLanding
                  ? isActive
                    ? "bg-primary/[0.06] hover:bg-primary/[0.10]"
                    : "bg-muted/25 hover:bg-muted/40"
                  : isActive
                    ? "border border-primary/60 bg-primary/[0.06] hover:border-primary"
                    : "border border-border/60 bg-background/50 hover:bg-accent/40 hover:border-primary/40",
              )}
            >
              {a.avatar ? (
                <AgentAvatar
                  value={a.avatar}
                  name={a.name}
                  className={cn("shrink-0 rounded-lg", isLanding ? "size-9" : "size-10")}
                />
              ) : (
                <span
                  className={cn(
                    "flex shrink-0 items-center justify-center rounded-lg text-xs font-bold",
                    isLanding
                      ? "size-9 bg-orange-500/15 text-orange-700 dark:text-orange-400"
                      : "size-10 bg-orange-500 text-white",
                  )}
                >
                  {agentInitials(a.name)}
                </span>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <h3
                    className={cn(
                      "truncate tracking-tight",
                      isLanding
                        ? "text-xs font-medium text-foreground/90 group-hover:text-primary"
                        : "text-xs font-semibold",
                    )}
                  >
                    {a.name}
                  </h3>
                  <span className="flex shrink-0 items-center gap-0.5">
                    {isActive ? (
                      <Check className="size-3.5 text-primary shrink-0" />
                    ) : null}
                    <span
                      role="button"
                      tabIndex={0}
                      title={`${a.name} — düzenle`}
                      aria-label={`${a.name} düzenle`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onManage(a.id);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          e.stopPropagation();
                          onManage(a.id);
                        }
                      }}
                      className="rounded border-0 bg-transparent p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                    >
                      <Pencil className="size-3.5" />
                    </span>
                  </span>
                </div>
                <p className={cn("mt-0.5 text-[11px] line-clamp-2 leading-relaxed", isLanding ? "text-muted-foreground/70" : "text-muted-foreground")}>
                  {a.description || "Özel ajan kimliği"}
                </p>
                {a.model && !isLanding ? (
                  <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground/70">
                    {a.model}
                  </p>
                ) : null}
              </div>
            </button>
          );
        })}
        {showCreate ? (
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
        ) : null}
      </div>
    </div>
  );
}
