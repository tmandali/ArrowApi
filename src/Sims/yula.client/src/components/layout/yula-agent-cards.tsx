"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil, Plus } from "lucide-react";
import { cn } from "@/utils/cn";
import { useUserAgentsStore } from "@/lib/stores/user-agents";
import { filterAgentsByScope } from "@/lib/yula-user-agent";
import { agentSessionPath } from "@/lib/workspace-paths";
import { AgentAvatar, agentInitials } from "@/features/system/components/agents/agent-avatar";

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
}: {
  workspaceId?: string | null;
  onManage: (editingId?: string | null) => void;
  className?: string;
  showAll?: boolean;
}) {
  const router = useRouter();
  const agents = useUserAgentsStore((s) => s.agents);
  const activeAgentId = useUserAgentsStore((s) => s.activeAgentId);

  const inScope = React.useMemo(
    () => (showAll ? agents : filterAgentsByScope(agents, workspaceId)),
    [agents, workspaceId, showAll],
  );

  return (
    <div className={cn("w-full max-w-3xl px-3 pt-2 animate-in fade-in-50 slide-in-from-bottom-2 duration-300", className)}>
      <div className="flex items-center justify-between mb-3 px-1">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">
          Ajanlar (Agents)
        </h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                "group relative flex items-start gap-3.5 rounded-xl border p-3.5 text-left transition-all duration-200 hover:shadow-sm",
                isActive
                  ? "border-primary/60 bg-primary/[0.06] hover:border-primary"
                  : "border-border/60 bg-background/50 hover:bg-accent/40 hover:border-primary/40",
              )}
            >
              {a.avatar ? (
                <AgentAvatar
                  value={a.avatar}
                  name={a.name}
                  className="size-10 shrink-0 rounded-lg"
                />
              ) : (
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-orange-500 text-xs font-bold text-white">
                  {agentInitials(a.name)}
                </span>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <h3 className="text-xs font-semibold tracking-tight truncate">
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
