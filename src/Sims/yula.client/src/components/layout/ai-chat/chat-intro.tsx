"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Globe } from "lucide-react";
import { YulaMarkIcon } from "@/components/layout/yula-brand";
import { YulaAgentCards } from "@/components/layout/yula-agent-cards";
import { AgentAvatar } from "@/features/system/components/agents/agent-avatar";
import { agentInitials } from "@/features/system/components/agents/agent-initials";
import { getWorkspace } from "@/lib/workspace-registry";
import { cn } from "@/utils/cn";
import type { WorkspaceId } from "@/types";

export type IntroAgent = {
  name: string;
  description?: string | null;
  avatar?: string | null;
  scope?: string | null;
} | null;

/** Ortalanmış karşılama: ana ekranda hero, dock'ta sade boş durum. */
export function ChatIntro({
  isHomePath,
  effectiveAgent,
  workspaceRootIcon,
  greeting,
  workspaceLabel,
  introDescription,
  dateLabel,
  agentInference,
  aboveInput,
  composer,
  belowInput,
  agentWorkspaceId,
  pathname,
  isAgentSession,
}: {
  isHomePath: boolean;
  effectiveAgent: IntroAgent;
  workspaceRootIcon: React.ReactNode;
  greeting: string;
  workspaceLabel: string;
  introDescription: string;
  dateLabel: string | null;
  agentInference: string | null;
  aboveInput?: React.ReactNode;
  composer: React.ReactNode;
  belowInput?: React.ReactNode;
  agentWorkspaceId: string;
  pathname: string;
  isAgentSession: boolean;
}) {
  const t = useTranslations("ChatAssistant");
  const router = useRouter();

  if (!isHomePath) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-4">
        <div className="mb-4 size-14">
          <YulaMarkIcon className="size-full" />
        </div>
        <h2 className="text-lg font-semibold tracking-tight text-primary dark:text-sidebar-primary">
          {t("yula_empty_title")}
        </h2>
        <p className="mt-1 max-w-md text-center text-sm text-muted-foreground">
          {introDescription}
        </p>
        {agentWorkspaceId === "system" ? null : (
          <YulaAgentCards
            workspaceId={agentWorkspaceId}
            showAll={pathname === "/"}
            onManage={(id) =>
              router.push(
                id ? `/my/agents?edit=${encodeURIComponent(id)}` : "/my/agents",
              )
            }
            className="mt-6"
          />
        )}
        <div className="mt-8 flex w-full justify-center">{composer}</div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col items-center gap-6 px-4 pt-16 pb-8 md:pt-20 overflow-y-auto no-scrollbar">
      <div className="flex flex-col items-center gap-4 text-center">
        {effectiveAgent?.avatar ? (
          <AgentAvatar
            value={effectiveAgent.avatar}
            name={effectiveAgent.name}
            className="size-16 rounded-2xl"
          />
        ) : effectiveAgent ? (
          <span className="flex size-16 items-center justify-center rounded-2xl bg-orange-500 text-2xl font-bold text-white">
            {agentInitials(effectiveAgent.name)}
          </span>
        ) : (
          workspaceRootIcon ?? <YulaMarkIcon className="size-16" />
        )}
        <div className="space-y-1.5">
          <h1
            className={cn(
              "text-3xl font-bold tracking-tight",
              (workspaceRootIcon || effectiveAgent) && "text-primary"
            )}
          >
            {effectiveAgent
              ? effectiveAgent.name
              : workspaceRootIcon
                ? workspaceLabel
                : greeting}
          </h1>
          <p className="text-sm text-muted-foreground">
            {effectiveAgent
              ? effectiveAgent.description || t("speaking_with_agent")
              : workspaceRootIcon
                ? t("yula_empty_desc")
                : t("yula_description")}
          </p>
          {effectiveAgent ? (
            <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground/75">
              <Globe className="size-3.5 shrink-0" />
              {effectiveAgent.scope && effectiveAgent.scope !== "global"
                ? t("works_in_workspace", { workspace: getWorkspace(effectiveAgent.scope as WorkspaceId).title || getWorkspace(effectiveAgent.scope as WorkspaceId).name })
                : t("works_in_all_workspaces")}
            </p>
          ) : null}
          {agentInference ? (
            <p
              className="font-mono text-[10.5px] text-muted-foreground/70"
              title={t("inference_identity")}
            >
              {agentInference}
            </p>
          ) : null}
          {dateLabel ? (
            <p className="text-xs text-muted-foreground/70">{dateLabel}</p>
          ) : null}
        </div>
      </div>

      {aboveInput}

      <div className="w-full transition-all duration-300 ease-in-out">
        {composer}
      </div>

      {belowInput}

      {isAgentSession || agentWorkspaceId === "system" ? null : (
        <YulaAgentCards
          workspaceId={agentWorkspaceId}
          showAll={pathname === "/"}
          onManage={(id) =>
            router.push(
              id ? `/my/agents?edit=${encodeURIComponent(id)}` : "/my/agents",
            )
          }
        />
      )}
    </div>
  );
}
