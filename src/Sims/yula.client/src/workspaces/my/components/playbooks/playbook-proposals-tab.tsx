"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import type { PlaybookEntry } from "@my-agent/core";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  XCircle,
  Clock,
  User,
  Workflow,
  FileText,
  ShieldCheck,
  Calendar,
  AlertCircle,
} from "lucide-react";
import { WorkflowGraphCanvas } from "./workflow-graph-canvas";

interface PlaybookProposalsTabProps {
  workspace: string;
  proposals: PlaybookEntry[];
  loading?: boolean;
  onRefresh: () => Promise<void> | void;
}

export function PlaybookProposalsTab({
  workspace,
  proposals,
  loading = false,
  onRefresh,
}: PlaybookProposalsTabProps) {
  const t = useTranslations("Playbooks");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [actionInProgress, setActionInProgress] = React.useState<string | null>(null);
  const [actionMessage, setActionMessage] = React.useState<{ text: string; type: "success" | "error" } | null>(null);

  const selectedProposal =
    proposals.find((p) => p.id === selectedId) || proposals[0] || null;

  const handleApprove = async (id: string) => {
    setActionInProgress(id);
    setActionMessage(null);
    try {
      const res = await fetch("/api/agent/playbook/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve", id, workspace, reviewer: "Admin" }),
      });
      const data = await res.json();
      if (data.success) {
        setActionMessage({ text: t("proposal_approved_success"), type: "success" });
        await onRefresh();
        if (selectedId === id) {
          setSelectedId(null);
        }
      } else {
        setActionMessage({ text: data.error || "Onaylama başarısız oldu", type: "error" });
      }
    } catch (err: any) {
      setActionMessage({ text: err?.message || "İşlem sırasında hata oluştu", type: "error" });
    } finally {
      setActionInProgress(null);
    }
  };

  const handleReject = async (id: string) => {
    setActionInProgress(id);
    setActionMessage(null);
    try {
      const res = await fetch("/api/agent/playbook/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject", id, workspace }),
      });
      const data = await res.json();
      if (data.success) {
        setActionMessage({ text: t("proposal_rejected_success"), type: "success" });
        await onRefresh();
        if (selectedId === id) {
          setSelectedId(null);
        }
      } else {
        setActionMessage({ text: data.error || "Reddetme başarısız oldu", type: "error" });
      }
    } catch (err: any) {
      setActionMessage({ text: err?.message || "İşlem sırasında hata oluştu", type: "error" });
    } finally {
      setActionInProgress(null);
    }
  };

  if (proposals.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center rounded-lg border border-dashed border-border/80 bg-muted/10 my-4">
        <ShieldCheck className="size-10 text-emerald-600/80 mb-3" />
        <p className="text-sm font-semibold text-foreground">
          {t("empty_proposals_title")}
        </p>
        <p className="text-xs text-muted-foreground mt-1.5 max-w-md">
          {t("empty_proposals_desc")}
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col md:flex-row gap-4 p-4 overflow-hidden">
      {/* Sol Panel: Taslak Listesi */}
      <div className="w-full md:w-80 shrink-0 flex flex-col border border-border/70 rounded-lg bg-card overflow-hidden">
        <div className="px-3 py-2.5 bg-muted/40 border-b border-border/60 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="size-4 text-amber-500" />
            <span className="text-xs font-semibold text-foreground">
              {t("proposals_list_title")}
            </span>
          </div>
          <Badge variant="outline" className="text-[10px] font-medium border-amber-500/40 text-amber-600 dark:text-amber-400">
            {proposals.length} {t("proposals_pending_badge")}
          </Badge>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-border/50">
          {proposals.map((prop) => {
            const isSelected = selectedProposal?.id === prop.id;
            return (
              <button
                key={prop.id}
                type="button"
                onClick={() => setSelectedId(prop.id)}
                className={`w-full text-left p-3 transition-colors cursor-pointer flex flex-col gap-1.5 ${
                  isSelected ? "bg-accent/60 border-l-2 border-l-amber-500" : "hover:bg-muted/30"
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-medium text-foreground line-clamp-1">
                    {prop.title}
                  </span>
                  <Badge
                    variant="secondary"
                    className="text-[9px] px-1 py-0 font-normal shrink-0"
                  >
                    {prop.category === "workflow_recipe" ? (
                      <span className="flex items-center gap-1">
                        <Workflow className="size-2.5 text-blue-500" />
                        Reçete
                      </span>
                    ) : (
                      <span className="flex items-center gap-1">
                        <FileText className="size-2.5 text-emerald-500" />
                        Kural
                      </span>
                    )}
                  </Badge>
                </div>

                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <User className="size-2.5" />
                    {prop.proposedBy || prop.author || "Kullanıcı"}
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <Calendar className="size-2.5" />
                    {prop.createdAt ? prop.createdAt.split("T")[0] : "-"}
                  </span>
                </div>

                {prop.targetPath && (
                  <span className="text-[10px] text-muted-foreground/80 font-mono line-clamp-1 bg-muted/60 px-1.5 py-0.5 rounded">
                    {prop.targetPath}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Sağ Panel: Taslak Detayı & Karar Paneli */}
      {selectedProposal && (
        <div className="flex-1 min-h-0 flex flex-col border border-border/70 rounded-lg bg-card overflow-hidden">
          {/* Detay Üst Başlığı & Karar Butonları */}
          <div className="p-3 bg-muted/30 border-b border-border/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-foreground">
                  {selectedProposal.title}
                </h3>
                <Badge variant="outline" className="text-[10px] text-amber-600 dark:text-amber-400 border-amber-500/40">
                  {t("status_waiting_approval")}
                </Badge>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                <span>Öneren: <strong>{selectedProposal.proposedBy || selectedProposal.author || "Kullanıcı"}</strong></span>
                {selectedProposal.targetPath && <span>Rota: <code>{selectedProposal.targetPath}</code></span>}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleReject(selectedProposal.id)}
                disabled={actionInProgress === selectedProposal.id || loading}
                className="text-xs h-8 px-3 gap-1.5 text-destructive hover:bg-destructive/10 border-destructive/30 cursor-pointer"
              >
                <XCircle className="size-3.5" />
                {t("btn_reject")}
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={() => handleApprove(selectedProposal.id)}
                disabled={actionInProgress === selectedProposal.id || loading}
                className="text-xs h-8 px-3 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
              >
                <CheckCircle2 className="size-3.5" />
                {t("btn_approve")}
              </Button>
            </div>
          </div>

          {actionMessage && (
            <div
              className={`px-3 py-2 text-xs flex items-center gap-2 border-b ${
                actionMessage.type === "success"
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                  : "bg-destructive/10 text-destructive border-destructive/20"
              }`}
            >
              {actionMessage.type === "success" ? (
                <CheckCircle2 className="size-3.5 shrink-0" />
              ) : (
                <AlertCircle className="size-3.5 shrink-0" />
              )}
              <span>{actionMessage.text}</span>
            </div>
          )}

          {/* İçerik Alanı: Graph veya Kural Açıklaması */}
          <div className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-4">
            {selectedProposal.category === "workflow_recipe" ? (
              <div className="flex-1 min-h-[360px] flex flex-col gap-2">
                <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <Workflow className="size-3.5 text-blue-500" />
                  {t("workflow_visual_dag_preview")}
                </span>
                <div className="flex-1 min-h-[320px] rounded-md border border-border/80 overflow-hidden bg-background">
                  <WorkflowGraphCanvas recipe={selectedProposal} />
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <FileText className="size-3.5 text-emerald-500" />
                  {t("screen_rule_content_preview")}
                </span>
                <div className="p-3.5 rounded-md border border-border/80 bg-muted/20 font-mono text-xs text-foreground whitespace-pre-wrap leading-relaxed">
                  {selectedProposal.contentMarkdown}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
