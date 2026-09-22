"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import type { PlaybookEntry, PlaybookLogItem } from "@my-agent/core";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { panelHeaderClass } from "@/components/layout/panel-chrome";
import {
  BookOpen,
  RefreshCw,
  Trash2,
  FileText,
  Workflow,
  History,
  Search,
  ExternalLink,
  User,
  Clock,
  LayoutList,
  Network,
  ShieldCheck,
} from "lucide-react";
import { WorkflowGraphCanvas } from "./workflow-graph-canvas";
import { usePlaybookAgentBinding } from "./use-playbook-agent-binding";
import { PlaybookProposalsTab } from "./playbook-proposals-tab";
import { PlaybookLogTab } from "./playbook-log-tab";

interface PlaybooksManagementViewProps {
  defaultTab?: "screens" | "workflows" | "log" | "proposals";
}

export function PlaybooksManagementView({
  defaultTab = "screens",
}: PlaybooksManagementViewProps = {}) {
  const t = useTranslations("Playbooks");
  const [workspace, _setWorkspace] = React.useState("stock");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [deleteConfirmId, setDeleteConfirmId] = React.useState<string | null>(null);
  const [workflowViewMode, setWorkflowViewMode] = React.useState<"graph" | "cards">("graph");
  const [selectedWorkflowId, setSelectedWorkflowId] = React.useState<string | null>(null);
  const [proposals, setProposals] = React.useState<PlaybookEntry[]>([]);
  const [entries, setEntries] = React.useState<PlaybookEntry[]>([]);
  const [logs, setLogs] = React.useState<PlaybookLogItem[]>([]);
  const [loading, setLoading] = React.useState(false);

  // Server is the source of truth (ServerFsPlaybookStorage). The library
  // useAgentPlaybook hook reads from in-memory context here (no AgentProvider
  // mounted), so entries/log must come from the REST API instead.
  const loadEntries = React.useCallback(async () => {
    try {
      const res = await fetch(`/api/agent/playbook?workspace=${workspace}`);
      if (res.ok) {
        const data = await res.json();
        setEntries(Array.isArray(data.entries) ? data.entries : []);
        setLogs(Array.isArray(data.log) ? data.log : []);
      }
    } catch {
      // Liste getirme hatasında mevcut state korunur
    }
  }, [workspace]);

  const loadProposals = React.useCallback(async () => {
    try {
      const res = await fetch(`/api/agent/playbook/proposals?workspace=${workspace}`);
      if (res.ok) {
        const data = await res.json();
        setProposals(data.proposals || []);
      }
    } catch {
      // Taslak getirme hatasında devam et
    }
  }, [workspace]);

  React.useEffect(() => {
    let active = true;
    void (async () => {
      setLoading(true);
      try {
        const [entriesRes, proposalsRes] = await Promise.all([
          fetch(`/api/agent/playbook?workspace=${workspace}`),
          fetch(`/api/agent/playbook/proposals?workspace=${workspace}`),
        ]);
        if (!active) return;
        if (entriesRes.ok) {
          const data = await entriesRes.json();
          setEntries(Array.isArray(data.entries) ? data.entries : []);
          setLogs(Array.isArray(data.log) ? data.log : []);
        }
        if (proposalsRes.ok) {
          const data = await proposalsRes.json();
          setProposals(data.proposals || []);
        }
      } catch {}
      if (active) setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [workspace]);

  const removeRule = React.useCallback(
    async (id: string) => {
      try {
        const res = await fetch(
          `/api/agent/playbook?id=${encodeURIComponent(id)}&workspace=${workspace}`,
          { method: "DELETE" },
        );
        if (!res.ok) return false;
        const data = await res.json();
        return Boolean(data.removed ?? data.success);
      } catch {
        return false;
      }
    },
    [workspace],
  );

  const handleRefresh = React.useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([loadEntries(), loadProposals()]);
    } finally {
      setLoading(false);
    }
  }, [loadEntries, loadProposals]);

  const screenRules = entries.filter((e) => e.category === "screen_rule");
  const workflowRecipes = entries.filter((e) => e.category === "workflow_recipe");

  usePlaybookAgentBinding({
    workspace,
    searchQuery,
    setSearchQuery,
    screenRules,
    workflowRecipes,
    selectedWorkflowId,
    setSelectedWorkflowId,
    workflowViewMode,
    setWorkflowViewMode,
    removeRule,
    refresh: handleRefresh,
    screenTitle: t("title"),
  });

  const handleDelete = async (id: string) => {
    const success = await removeRule(id);
    if (success) {
      setDeleteConfirmId(null);
      await handleRefresh();
    }
  };

  const filterBySearch = (item: { title: string; targetPath?: string; contentMarkdown?: string; summary?: string }) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      item.title.toLowerCase().includes(q) ||
      (item.targetPath && item.targetPath.toLowerCase().includes(q)) ||
      (item.summary && item.summary.toLowerCase().includes(q)) ||
      (item.contentMarkdown && item.contentMarkdown.toLowerCase().includes(q))
    );
  };

  const filteredRules = screenRules.filter(filterBySearch);
  const filteredWorkflows = workflowRecipes.filter(filterBySearch);
  const activeWorkflow =
    filteredWorkflows.find((w) => w.id === selectedWorkflowId) ||
    filteredWorkflows[0];

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      {/* Üst Başlık Çubuğu */}
      <div className={panelHeaderClass}>
        <div className="flex items-center gap-2">
          <BookOpen className="size-4 text-emerald-600 dark:text-emerald-400" />
          <span className="text-xs font-semibold text-foreground">
            {t("title")}
          </span>
          <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-normal">
            {t("rules_count", { count: screenRules.length })}
          </Badge>
          {proposals.length > 0 && (
            <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-normal text-amber-600 dark:text-amber-400 border-amber-500/40">
              {proposals.length} {t("proposals_pending_badge")}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="relative w-48">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground/60" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("filter_search_placeholder")}
              className="h-7 text-xs pl-8 pr-2.5"
            />
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={loading}
            className="text-xs h-7 px-2.5 gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`size-3 ${loading ? "animate-spin" : ""}`} />
            {t("btn_refresh")}
          </Button>
        </div>
      </div>

      {/* Sekmeler ve İçerik Alanı */}
      <Tabs defaultValue={defaultTab} className="flex-1 min-h-0 flex flex-col">
        <div className="px-4 pt-3 border-b border-border/60 bg-muted/20">
          <TabsList className="h-8 p-0.5 bg-muted/60">
            <TabsTrigger value="screens" className="text-xs gap-1.5 h-7">
              <FileText className="size-3.5" />
              {t("tab_screens")} ({screenRules.length})
            </TabsTrigger>
            <TabsTrigger value="workflows" className="text-xs gap-1.5 h-7">
              <Workflow className="size-3.5" />
              {t("tab_workflows")} ({workflowRecipes.length})
            </TabsTrigger>
            <TabsTrigger value="proposals" className="text-xs gap-1.5 h-7">
              <ShieldCheck className="size-3.5 text-amber-500" />
              {t("tab_proposals")} ({proposals.length})
            </TabsTrigger>
            <TabsTrigger value="log" className="text-xs gap-1.5 h-7">
              <History className="size-3.5" />
              {t("tab_log")} ({logs.length})
            </TabsTrigger>
          </TabsList>
        </div>

        {/* 1. Ekran Kuralları Sekmesi */}
        <TabsContent value="screens" className="flex-1 min-h-0 overflow-y-auto p-4 m-0 space-y-3">
          <p className="text-xs text-muted-foreground">{t("subtitle")}</p>

          {filteredRules.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center rounded-lg border border-dashed border-border/80 bg-muted/10">
              <FileText className="size-8 text-muted-foreground/40 mb-2.5" />
              <p className="text-xs font-medium text-foreground">{t("empty_rules_title")}</p>
              <p className="text-[11px] text-muted-foreground mt-1 max-w-md">
                {t("empty_rules_desc")}
              </p>
            </div>
          ) : (
            <div className="grid gap-3">
              {filteredRules.map((rule) => (
                <div
                  key={rule.id}
                  className="rounded-lg border border-border bg-card p-4 space-y-2.5 shadow-sm hover:border-border/80 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-xs text-foreground">
                          {rule.title}
                        </span>
                        <Badge
                          variant="outline"
                          className="h-4 px-1.5 text-[9.5px] font-mono text-muted-foreground"
                        >
                          {rule.scope === "user" ? t("badge_user") : t("badge_workspace")}
                        </Badge>
                      </div>
                      {rule.targetPath && (
                        <div className="flex items-center gap-1.5 text-[11px] text-primary/80 font-mono">
                          <ExternalLink className="size-3" />
                          <span>{rule.targetPath}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {deleteConfirmId === rule.id ? (
                        <div className="flex items-center gap-1">
                          <Button
                            variant="destructive"
                            size="sm"
                            className="h-6 px-2 text-[10px]"
                            onClick={() => handleDelete(rule.id)}
                          >
                            Onayla
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-1.5 text-[10px]"
                            onClick={() => setDeleteConfirmId(null)}
                          >
                            İptal
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive cursor-pointer"
                          onClick={() => setDeleteConfirmId(rule.id)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="text-xs text-muted-foreground bg-muted/30 p-2.5 rounded-md border border-border/40 font-mono text-[11px] whitespace-pre-wrap leading-relaxed">
                    {rule.contentMarkdown}
                  </div>

                  {rule.author && (
                    <div className="flex items-center gap-1 text-[10.5px] text-muted-foreground/70">
                      <User className="size-3" />
                      <span>{rule.author}</span>
                      {rule.updatedAt && (
                        <>
                          <span className="mx-1">·</span>
                          <Clock className="size-3" />
                          <span>{new Date(rule.updatedAt).toLocaleDateString()}</span>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* 2. İş Akışı Tarifleri Sekmesi (Graf DAG & Kartlar) */}
        <TabsContent value="workflows" className="flex-1 min-h-0 overflow-y-auto p-4 m-0 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-border/60">
            <p className="text-xs text-muted-foreground">
              İş akışı tarifleri ve yönlü döngüsüz graf (DAG) adımları
            </p>

            <div className="flex items-center gap-2">
              <div className="flex items-center border border-border rounded-md p-0.5 bg-muted/30">
                <Button
                  variant={workflowViewMode === "graph" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setWorkflowViewMode("graph")}
                  className="h-6 px-2 text-[11px] gap-1 cursor-pointer"
                >
                  <Network className="size-3" />
                  Graf (DAG)
                </Button>
                <Button
                  variant={workflowViewMode === "cards" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setWorkflowViewMode("cards")}
                  className="h-6 px-2 text-[11px] gap-1 cursor-pointer"
                >
                  <LayoutList className="size-3" />
                  Kartlar
                </Button>
              </div>
            </div>
          </div>

          {filteredWorkflows.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center rounded-lg border border-dashed border-border/80 bg-muted/10">
              <Workflow className="size-8 text-muted-foreground/40 mb-2.5" />
              <p className="text-xs font-medium text-foreground">{t("empty_workflows_title")}</p>
              <p className="text-[11px] text-muted-foreground mt-1 max-w-md">
                {t("empty_workflows_desc")}
              </p>
            </div>
          ) : workflowViewMode === "graph" ? (
            <div className="space-y-3">
              {filteredWorkflows.length > 1 && (
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                  {filteredWorkflows.map((wf) => (
                    <Button
                      key={wf.id}
                      variant={activeWorkflow?.id === wf.id ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedWorkflowId(wf.id)}
                      className="text-xs h-7 px-2.5 shrink-0 cursor-pointer"
                    >
                      {wf.title}
                    </Button>
                  ))}
                </div>
              )}

              {activeWorkflow && (
                <div className="rounded-lg border border-border bg-card p-4 space-y-3 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-semibold text-foreground">
                        {activeWorkflow.title}
                      </h3>
                      {activeWorkflow.targetPath && (
                        <span className="text-[10.5px] font-mono text-muted-foreground">
                          {activeWorkflow.targetPath}
                        </span>
                      )}
                    </div>
                    <Badge variant="outline" className="text-[10px]">
                      {activeWorkflow.scope}
                    </Badge>
                  </div>

                  <WorkflowGraphCanvas recipe={activeWorkflow} />
                </div>
              )}
            </div>
          ) : (
            <div className="grid gap-3">
              {filteredWorkflows.map((recipe) => (
                <div
                  key={recipe.id}
                  className="rounded-lg border border-border bg-card p-4 space-y-2.5 shadow-sm hover:border-border/80 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <span className="font-semibold text-xs text-foreground">
                        {recipe.title}
                      </span>
                      {recipe.targetPath && (
                        <div className="text-[11px] text-muted-foreground font-mono">
                          {recipe.targetPath}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {deleteConfirmId === recipe.id ? (
                        <div className="flex items-center gap-1">
                          <Button
                            variant="destructive"
                            size="sm"
                            className="h-6 px-2 text-[10px]"
                            onClick={() => handleDelete(recipe.id)}
                          >
                            Onayla
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-1.5 text-[10px]"
                            onClick={() => setDeleteConfirmId(null)}
                          >
                            İptal
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive cursor-pointer"
                          onClick={() => setDeleteConfirmId(recipe.id)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="text-xs text-muted-foreground bg-muted/30 p-2.5 rounded-md border border-border/40 whitespace-pre-wrap leading-relaxed">
                    {recipe.contentMarkdown}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* 3. Taslak Yönetişim & Onay Sekmesi (Option B Governance) */}
        <TabsContent value="proposals" className="flex-1 min-h-0 overflow-hidden p-0 m-0">
          <PlaybookProposalsTab
            workspace={workspace}
            proposals={proposals}
            loading={loading}
            onRefresh={handleRefresh}
          />
        </TabsContent>

        {/* 4. Hafıza Değişiklik Günlüğü Sekmesi (Audit Log) */}
        <TabsContent value="log" className="flex-1 min-h-0 overflow-y-auto p-4 m-0 space-y-3">
          <PlaybookLogTab logs={logs} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
