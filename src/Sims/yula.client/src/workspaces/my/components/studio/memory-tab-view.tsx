"use client";

import * as React from "react";
import { agentMemory, type MemoryEntry } from "@my-agent/core";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { panelHeaderClass } from "@/components/layout/panel-chrome";
import { Brain, Trash2, RefreshCw, HardDrive, Clock, Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { useScreenAgentContext } from "@/hooks/use-screen-agent-context";
import { useAgentComponent } from "@my-agent/react";

export function MemoryTabView() {
  const t = useTranslations("Studio");
  const [entries, setEntries] = React.useState<MemoryEntry[]>(() => agentMemory.getAll());
  const [justCleared, setJustCleared] = React.useState(false);

  const reload = React.useCallback(() => {
    setEntries(agentMemory.getAll());
  }, []);

  useScreenAgentContext({
    screenId: "my-memory",
    screenTitle: t("memory_title"),
    workspaceId: "my",
    activeDataSummary: {
      isViewingResults: false,
      jobId: undefined,
    },
    quickPrompts: [
      t("prompt_list_memory"),
      t("prompt_clear_memory"),
    ],
    stateExtra: {
      factsCount: entries.length,
    },
  });

  useAgentComponent({
    id: "entity_form:agent_memory",
    meta: {
      entity: "agent_memory",
      screenTitle: "Kalıcı Bellek & Tercihler",
      workspace: "my",
      factsCount: entries.length,
      facts: entries.map((e) => ({
        key: e.key,
        value: e.value,
        scope: e.scope,
        description: e.description || e.key,
      })),
    },
    actions: {
      READ: {
        description: "Reads user preferences and facts stored in persistent memory.",
        whenToCall: "When inspecting what Yula remembers about user habits or preferences.",
        whenNotToCall: "When not on memory screen.",
      },
      FORGET: {
        description: "Removes a specific memory fact by key ({ key: string }).",
        whenToCall: "When the user asks to forget or remove a specific stored preference.",
        whenNotToCall: "When inspecting memory.",
      },
      CLEAR_ALL: {
        description: "Clears all remembered facts from persistent memory.",
        whenToCall: "When the user explicitly asks to clear or reset all memory.",
        whenNotToCall: "When deleting a single item.",
      },
    },
    onAction: async (action, payload) => {
      if (action === "READ") {
        return {
          success: true,
          factsCount: entries.length,
          facts: entries.map((e) => ({
            key: e.key,
            value: e.value,
            scope: e.scope,
            description: e.description || e.key,
          })),
        };
      }
      if (action === "FORGET" && typeof payload?.key === "string") {
        agentMemory.forget(payload.key);
        reload();
        return { success: true, message: `Forgot '${payload.key}'` };
      }
      if (action === "CLEAR_ALL") {
        agentMemory.clear("all");
        reload();
        return { success: true, message: "Cleared all persistent memory facts." };
      }
      return { success: false, error: `Unknown action: ${action}` };
    },
  });

  const handleForget = (key: string) => {
    agentMemory.forget(key);
    reload();
  };

  const handleClearAll = () => {
    agentMemory.clear("all");
    setJustCleared(true);
    setTimeout(() => setJustCleared(false), 1500);
    reload();
  };

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <div className={panelHeaderClass}>
        <div className="flex items-center gap-2">
          <Brain className="size-4 text-indigo-500" />
          <span className="text-xs font-semibold text-foreground">
            Kalıcı Bellek & Tercihler
          </span>
          <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-normal">
            {entries.length}
          </Badge>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={reload}
            className="text-xs h-7 px-2.5 gap-1.5 cursor-pointer"
          >
            <RefreshCw className="size-3" />
            Yenile
          </Button>
          {entries.length > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleClearAll}
              className="text-xs h-7 px-2.5 gap-1.5 cursor-pointer"
            >
              {justCleared ? <Check className="size-3" /> : <Trash2 className="size-3" />}
              {justCleared ? "Temizlendi" : "Tümünü Sil"}
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
        <p className="text-xs text-muted-foreground">
          Yula AI ile yaptığınız sohbetlerde <code className="text-primary font-mono text-[10.5px]">remember_fact</code> aracıyla saklanan kişisel tercihleriniz ve çalışma parametreleri.
        </p>

        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center rounded-lg border border-dashed border-border/80 bg-muted/10">
            <Brain className="size-8 text-muted-foreground/40 mb-2.5" />
            <p className="text-xs font-medium text-foreground">Kayıtlı kullanıcı tercihi veya bellek bulunmuyor</p>
            <p className="text-[11px] text-muted-foreground mt-1 max-w-sm">
              Sohbette <em>&quot;benim varsayılan mağazam her zaman Kadıköy olsun&quot;</em> veya <em>&quot;raporları hep Excel indir&quot;</em> dediğinizde Yula bunu otomatik olarak hafızasına kaydeder.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden bg-card">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-muted/40 border-b border-border text-muted-foreground uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="px-3.5 py-2.5 font-semibold">Anahtar (Key)</th>
                    <th className="px-3.5 py-2.5 font-semibold">Kayıtlı Değer</th>
                    <th className="px-3.5 py-2.5 font-semibold">Kapsam</th>
                    <th className="px-3.5 py-2.5 font-semibold">Açıklama</th>
                    <th className="px-3.5 py-2.5 font-semibold text-right">İşlem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {entries.map((entry) => (
                    <tr key={entry.key} className="hover:bg-muted/30 transition-colors">
                      <td className="px-3.5 py-2.5 font-mono font-medium text-foreground">
                        {entry.key}
                      </td>
                      <td className="px-3.5 py-2.5 text-muted-foreground max-w-xs truncate">
                        {typeof entry.value === "object" ? JSON.stringify(entry.value) : String(entry.value)}
                      </td>
                      <td className="px-3.5 py-2.5">
                        <Badge
                          variant="outline"
                          className={`text-[10px] font-normal gap-1 h-5 py-0 ${
                            entry.scope === "persistent"
                              ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10"
                              : "border-sky-500/30 text-sky-600 dark:text-sky-400 bg-sky-500/10"
                          }`}
                        >
                          {entry.scope === "persistent" ? (
                            <>
                              <HardDrive className="size-2.5" /> Kalıcı (localStorage)
                            </>
                          ) : (
                            <>
                              <Clock className="size-2.5" /> Oturum (Session)
                            </>
                          )}
                        </Badge>
                      </td>
                      <td className="px-3.5 py-2.5 text-muted-foreground">
                        {entry.description || "—"}
                      </td>
                      <td className="px-3.5 py-2.5 text-right">
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => handleForget(entry.key)}
                          className="text-muted-foreground hover:text-destructive cursor-pointer"
                          title="Bu kaydı sil"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
