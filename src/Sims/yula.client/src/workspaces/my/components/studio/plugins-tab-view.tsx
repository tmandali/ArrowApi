"use client";

import * as React from "react";
import { pluginRegistry, type AgentPlugin } from "@/lib/plugins/yula-plugins";
import { Badge } from "@/components/ui/badge";
import { panelHeaderClass } from "@/components/layout/panel-chrome";
import { Blocks, CheckCircle2, Cpu, Wrench } from "lucide-react";
import { useTranslations } from "next-intl";
import { useScreenAgentContext } from "@/hooks/use-screen-agent-context";
import { usePluginsAgentBinding } from "./use-plugins-agent-binding";

export function PluginsTabView() {
  const t = useTranslations("Studio");
  const [plugins] = React.useState<AgentPlugin[]>(() => pluginRegistry.getAll());

  useScreenAgentContext({
    screenId: "my-plugins",
    screenTitle: t("plugins_title"),
    workspaceId: "my",
    activeDataSummary: {
      isViewingResults: false,
      jobId: undefined,
    },
    quickPrompts: [
      t("prompt_list_plugins"),
      t("prompt_check_python_plugin"),
    ],
    stateExtra: {
      pluginsCount: plugins.length,
    },
  });

  usePluginsAgentBinding({ plugins });

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <div className={panelHeaderClass}>
        <div className="flex items-center gap-2">
          <Blocks className="size-4 text-primary" />
          <span className="text-xs font-semibold text-foreground">
            Kurumsal Eklentiler & Modüller
          </span>
          <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-normal">
            {plugins.length}
          </Badge>
        </div>
        <span className="text-[11px] text-muted-foreground">
          Python AI Sidecar & DuckDB Modülleri
        </span>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
        {plugins.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center rounded-lg border border-dashed border-border/80 bg-muted/10">
            <Blocks className="size-8 text-muted-foreground/40 mb-2.5" />
            <p className="text-xs font-medium text-foreground">Henüz kayıtlı harici eklenti bulunmuyor</p>
            <p className="text-[11px] text-muted-foreground mt-1 max-w-sm">
              Yeni eklentiler <code className="text-primary font-mono text-[10.5px]">pluginRegistry.register(...)</code> ile sisteme dinamik olarak bağlanır.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {plugins.map((plugin) => {
              const toolEntries = Object.entries(plugin.tools ?? {});
              const skillList = plugin.skills ?? [];

              return (
                <div
                  key={plugin.id}
                  className="rounded-lg border border-border/70 bg-card p-3.5 space-y-3 shadow-none hover:border-border transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5">
                      <div className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
                        <Cpu className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                        {plugin.name}
                      </div>
                      <p className="text-[11.5px] text-muted-foreground line-clamp-2">
                        {plugin.description || "Açıklama belirtilmemiş."}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className="text-[10px] shrink-0 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 flex items-center gap-1 font-medium py-0 h-5"
                    >
                      <CheckCircle2 className="size-3" />
                      Aktif {plugin.version ? `v${plugin.version}` : ""}
                    </Badge>
                  </div>

                  {toolEntries.length > 0 && (
                    <div className="space-y-1">
                      <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                        <Wrench className="size-3 text-primary" />
                        Sağlanan Araçlar ({toolEntries.length}):
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {toolEntries.map(([toolName, def]) => (
                          <Badge
                            key={toolName}
                            variant="secondary"
                            className="text-[10.5px] font-mono font-normal bg-muted/60 text-foreground py-0 h-5"
                            title={def?.description}
                          >
                            {toolName}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {skillList.length > 0 && (
                    <div className="space-y-1">
                      <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                        <Blocks className="size-3 text-sky-500" />
                        Sağlanan Beceriler ({skillList.length}):
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {skillList.map((skill) => (
                          <Badge
                            key={skill.name}
                            variant="outline"
                            className="text-[10.5px] font-normal border-sky-500/30 text-sky-600 dark:text-sky-400 py-0 h-5"
                            title={skill.description}
                          >
                            {skill.name}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
