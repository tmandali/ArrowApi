"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SkillManagementView, AgentManagementView } from "@/features/system";
import { PluginsTabView } from "./plugins-tab-view";
import { MemoryTabView } from "./memory-tab-view";
import { PageHeaderTitle } from "@/components/layout/page-header-title";
import { WorkspacePageShell } from "@/components/layout/workspace-page-shell";
import { AIChatAssistant } from "@/components/layout/ai-chat/ai-chat-assistant";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Sparkles, Bot, Blocks, Brain } from "lucide-react";

export type StudioTabId = "skills" | "agents" | "plugins" | "memory";

export function YulaStudioView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const tabParam = searchParams.get("tab") as StudioTabId | null;
  const validTabs: StudioTabId[] = ["skills", "agents", "plugins", "memory"];
  const currentTab = tabParam && validTabs.includes(tabParam) ? tabParam : "skills";

  const handleTabChange = (val: string) => {
    const nextTab = val as StudioTabId;
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", nextTab);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <WorkspacePageShell
      title={
        <div className="flex items-center gap-2.5">
          <PageHeaderTitle>Yula Stüdyo</PageHeaderTitle>
          <span className="text-[11px] font-normal text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-md border border-border/60">
            AI Yetenek Merkezi
          </span>
        </div>
      }
      actions={<AIChatAssistant />}
    >
      <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background">
        <Tabs
          value={currentTab}
          onValueChange={handleTabChange}
          className="flex h-full min-h-0 flex-1 flex-col"
        >
          <div className="border-b border-border/80 px-6 pt-3 bg-muted/20">
            <TabsList className="h-10 bg-muted/60 p-1 border border-border/60 rounded-lg">
              <TabsTrigger
                value="skills"
                className="text-xs gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-xs cursor-pointer"
              >
                <Sparkles className="size-3.5 text-amber-500" />
                Beceriler & Slash Komutları
              </TabsTrigger>
              <TabsTrigger
                value="agents"
                className="text-xs gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-xs cursor-pointer"
              >
                <Bot className="size-3.5 text-primary" />
                Personalar & Ajanlar
              </TabsTrigger>
              <TabsTrigger
                value="plugins"
                className="text-xs gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-xs cursor-pointer"
              >
                <Blocks className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                Kurumsal Eklentiler
              </TabsTrigger>
              <TabsTrigger
                value="memory"
                className="text-xs gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-xs cursor-pointer"
              >
                <Brain className="size-3.5 text-indigo-500" />
                Kalıcı Bellek & Tercihler
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
            <TabsContent value="skills" className="flex-1 min-h-0 m-0 border-none outline-none data-[state=active]:flex data-[state=active]:flex-col">
              <SkillManagementView />
            </TabsContent>

            <TabsContent value="agents" className="flex-1 min-h-0 m-0 border-none outline-none data-[state=active]:flex data-[state=active]:flex-col">
              <AgentManagementView />
            </TabsContent>

            <TabsContent value="plugins" className="flex-1 min-h-0 m-0 border-none outline-none data-[state=active]:flex data-[state=active]:flex-col">
              <PluginsTabView />
            </TabsContent>

            <TabsContent value="memory" className="flex-1 min-h-0 m-0 border-none outline-none data-[state=active]:flex data-[state=active]:flex-col">
              <MemoryTabView />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </WorkspacePageShell>
  );
}
