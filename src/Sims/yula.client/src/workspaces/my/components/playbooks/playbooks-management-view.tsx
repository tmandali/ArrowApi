"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { useAgentPlaybook } from "@my-agent/react";
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
} from "lucide-react";
import { WorkflowGraphCanvas } from "./workflow-graph-canvas";
import { usePlaybookAgentBinding } from "./use-playbook-agent-binding";

export function PlaybooksManagementView() {
  const t = useTranslations("Playbooks");
  const [workspace, _setWorkspace] = React.useState("stock");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [deleteConfirmId, setDeleteConfirmId] = React.useState<string | null>(null);
  const [workflowViewMode, setWorkflowViewMode] = React.useState<"graph" | "cards">("graph");
  const [selectedWorkflowId, setSelectedWorkflowId] = React.useState<string | null>(null);

  // Kütüphane seviyesindeki @my-agent/react useAgentPlaybook kancası ile veri yönetimi
  const {
    entries,
    index: _indexItems,
    log: logs,
    loading,
    refresh: loadData,
    removeRule,
  } = useAgentPlaybook({ workspaceId: workspace });

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
    refresh: loadData,
    screenTitle: t("title"),
  });

  const handleDelete = async (id: string) => {
    const success = await removeRule(id);
    if (success) {
      setDeleteConfirmId(null);
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
            onClick={loadData}
            disabled={loading}
            className="text-xs h-7 px-2.5 gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`size-3 ${loading ? "animate-spin" : ""}`} />
            {t("btn_refresh")}
          </Button>
        </div>
      </div>

      {/* Sekmeler ve İçerik Alanı */}
      <Tabs defaultValue="screens" className="flex-1 min-h-0 flex flex-col">
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
            <TabsTrigger value="log" className="text-xs gap-1.5 h-7">
              <History className="size-3.5" />
              {t("tab_log")} ({logs.length})
            </TabsTrigger>
          </TabsList>
        </div>

        {/* 1. Ekran Kuralları Sekmesi */}
        <TabsContent value="screens" className="flex-1 min-h-0 overflow-y-auto p-4 m-0 space-y-3">
          <p className="text-xs text-muted-foreground">
            {t("subtitle")}
          </p>

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
          {/* Görünüm Geçiş Çubuğu */}
          <div className="flex items-center justify-between pb-2 border-b border-border/60">
            <p className="text-xs text-muted-foreground">
              İş akışı tarifleri ve yönlü döngüsüz graf (DAG) adımları
            </p>

            <div className="flex items-center gap-1 bg-muted/60 p-0.5 rounded-md border border-border/40">
              <Button
                variant={workflowViewMode === "graph" ? "secondary" : "ghost"}
                size="sm"
                className="h-6 px-2 text-[11px] gap-1 cursor-pointer"
                onClick={() => setWorkflowViewMode("graph")}
              >
                <Network className="size-3" />
                Akış Şeması (DAG)
              </Button>
              <Button
                variant={workflowViewMode === "cards" ? "secondary" : "ghost"}
                size="sm"
                className="h-6 px-2 text-[11px] gap-1 cursor-pointer"
                onClick={() => setWorkflowViewMode("cards")}
              >
                <LayoutList className="size-3" />
                Kartlar
              </Button>
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
          ) : workflowViewMode === "graph" && activeWorkflow ? (
            <div className="space-y-3">
              {/* Çoklu iş akışı varsa seçim hapları */}
              {filteredWorkflows.length > 1 && (
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                  {filteredWorkflows.map((w) => (
                    <Button
                      key={w.id}
                      variant={w.id === activeWorkflow.id ? "secondary" : "outline"}
                      size="sm"
                      className="h-7 text-xs px-2.5 shrink-0 gap-1.5 cursor-pointer font-medium"
                      onClick={() => setSelectedWorkflowId(w.id)}
                    >
                      <Workflow className="size-3" />
                      <span className="truncate max-w-[160px]">{w.title}</span>
                    </Button>
                  ))}
                </div>
              )}

              {/* İnteraktif React Flow Canvas */}
              <WorkflowGraphCanvas
                title={activeWorkflow.title}
                graph={activeWorkflow.graph}
                contentMarkdown={activeWorkflow.contentMarkdown}
              />

              {/* Seçili İş Akışı Özet Bilgisi ve İşlemler */}
              <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-card/60">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold">{activeWorkflow.title}</span>
                    {activeWorkflow.targetPath && (
                      <span className="text-[10.5px] font-mono text-muted-foreground">
                        {activeWorkflow.targetPath}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground line-clamp-1">
                    {activeWorkflow.contentMarkdown?.split("\n")[0]}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {deleteConfirmId === activeWorkflow.id ? (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="destructive"
                        size="sm"
                        className="h-6 px-2 text-[10px]"
                        onClick={() => handleDelete(activeWorkflow.id)}
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
                      className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive cursor-pointer"
                      onClick={() => setDeleteConfirmId(activeWorkflow.id)}
                    >
                      <Trash2 className="size-3.5 mr-1" />
                      Tarifi Sil
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="grid gap-3">
              {filteredWorkflows.map((recipe) => (
                <div
                  key={recipe.id}
                  className="rounded-lg border border-border bg-card p-4 space-y-2.5 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-xs text-foreground">
                          {recipe.title}
                        </span>
                        <Badge variant="secondary" className="h-4 px-1.5 text-[9.5px]">
                          {t("badge_workflow")}
                        </Badge>
                      </div>
                      {recipe.targetPath && (
                        <div className="flex items-center gap-1 text-[11px] text-muted-foreground font-mono">
                          <span>{recipe.targetPath}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 px-2 text-[10px] gap-1 cursor-pointer"
                        onClick={() => {
                          setSelectedWorkflowId(recipe.id);
                          setWorkflowViewMode("graph");
                        }}
                      >
                        <Network className="size-3 text-primary" />
                        Akış Şemasında Gör
                      </Button>

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

        {/* 3. Hafıza Değişiklik Günlüğü Sekmesi (Audit Log) */}
        <TabsContent value="log" className="flex-1 min-h-0 overflow-y-auto p-4 m-0 space-y-3">
          {logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center rounded-lg border border-dashed border-border/80 bg-muted/10">
              <History className="size-8 text-muted-foreground/40 mb-2.5" />
              <p className="text-xs font-medium text-foreground">{t("empty_log_title")}</p>
            </div>
          ) : (
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
                          className="h-4 px-1.5 text-[9.5px] uppercase font-semibold text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
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
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
