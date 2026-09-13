"use client";

import { usePathname } from "next/navigation";
import * as React from "react";
import { useTranslations, useLocale } from "next-intl";
import { Button } from "@/components/ui/button";
import { ArrowDown } from "lucide-react";
import { YulaChatTurn } from "@/components/layout/yula-chat-turn";
import { workspaceIconFor } from "@/components/layout/workspace-brand";
import { useUserAgentsStore } from "@/lib/stores/user-agents";
import { AGENT_PROVIDER_OPTIONS, agentScopeWorkspaceId, filterAgentsByScope, localizeProviderOptions } from "@/lib/yula-user-agent";
import { readYulaClientAiConfig } from "@/lib/yula-ai-client-config";
import { useChatsStore } from "@/lib/stores/chats";
import { YulaHistorySidebar, YulaHistoryMainView } from "@/components/layout/yula-history-sidebar";
import { useYulaChat } from "@/hooks/use-yula-chat";
import type { YulaMessage } from "@/app/api/agent/chat/route";
import { isWorkspaceHomePath, workspaceIdFromPath, workspaceLabelFromPath, extractJobIdFromHref, extractJobIdFromPath, isReportResultPath, extractAgentIdFromPath, isAgentSessionPath } from "@/lib/workspace-paths";
import { peekQueuedYulaPrompt, subscribeQueuedYulaPrompt } from "@/lib/yula-pending-prompt";
import { useMounted } from "@/hooks/use-mounted";
import { formatDate, greetingFor } from "@/lib/welcome-format";
import type { AIChatPanelProps } from "./ai-chat-panel";
import { useChatComposer } from "./use-chat-composer";
import { ChatComposer } from "./chat-composer";
import { ChatIntro } from "./chat-intro";
import {
  useDedupedMessages,
  useChatTurns,
  useStreamingPreview,
  useRecoveredToolCallIds,
} from "./use-chat-turns";

function AIChatPanelSession({
  centeredIntro = false,
  mode,
  belowInput,
  aboveInput,
}: AIChatPanelProps = {}) {
  const t = useTranslations("ChatAssistant");
  const tCat = useTranslations("AgentCatalog");
  const isSearchingHistory = useChatsStore((s) => s.isSearchingHistory);
  const isHistoryOpen = useChatsStore((s) => s.isHistoryOpen);
  const yula = useYulaChat();
  const status = yula.status;
  const isProcessing = yula.busy;
  const { messages } = yula;

  const [queuedPrompt, setQueuedPrompt] = React.useState(peekQueuedYulaPrompt);
  React.useEffect(() => subscribeQueuedYulaPrompt(() => setQueuedPrompt(peekQueuedYulaPrompt())), []);

  const dedupedMessages = useDedupedMessages(messages);
  const turns = useChatTurns(dedupedMessages);
  const { streamingThinking, streamingContent } = useStreamingPreview(messages, status);

  const pathname = usePathname();
  const isHomePath = isWorkspaceHomePath(pathname) || isAgentSessionPath(pathname);
  const isMainMode = mode ? mode === "main" : isHomePath;

  const mounted = useMounted();
  const now = React.useMemo(() => new Date(), []);
  const tGreet = useTranslations("Greeting");
  const locale = useLocale();
  const greeting = mounted ? greetingFor(now, tGreet) : t("greeting");
  const dateLabel = mounted ? formatDate(now, locale) : null;

  const workspaceLabel = workspaceLabelFromPath(pathname);
  // Karşılama ekranı workspace kökünde (ör. /stock) workspace'in kendi ikonunu
  // ve etiketini gösterir; Yula kökü (/) marka ikonuyla kalır — farkındalık için.
  const isYulaRoot = pathname === "/";
  const workspaceRootIcon = React.useMemo(() => {
    if (isYulaRoot) return null;
    const icon = workspaceIconFor(workspaceIdFromPath(pathname));
    return icon
      ? React.createElement(icon, { className: "size-16 text-yula-accent" })
      : null;
  }, [isYulaRoot, pathname]);
  const introDescription = t("yula_intro", { workspace: workspaceLabel, desc: t("yula_empty_desc") });

  const isLoading = isProcessing;
  const selectedJobId =
    typeof window !== "undefined"
      ? extractJobIdFromHref(`${pathname}${window.location.search}`)
      : extractJobIdFromPath(pathname);
  const isViewingResults =
    isReportResultPath(pathname) || Boolean(selectedJobId);
  const workspaceId = workspaceIdFromPath(pathname);
  // Ajan kapsamı: system workspace'ü (ana sayfa "/" + "/system/*") daima
  // yalnız ana Yula AI ile çalışır (kapsam filtresi [] döner); diğer
  // workspace'lerde global + o alana özel ajanlar geçerli (skill kapsamı
  // etkilenmez).
  const agentWorkspaceId = agentScopeWorkspaceId(pathname);
  // Oturum ajanı (hero karşılaması için; girdi üstü rozet kaldırıldı —
  // kimlik URL + panel başlığı + hero ile belli olur).
  const userAgents = useUserAgentsStore((s) => s.agents);
  const activeAgentId = useUserAgentsStore((s) => s.activeAgentId);
  const routeAgentId = extractAgentIdFromPath(pathname);
  const isAgentSession = isAgentSessionPath(pathname);
  const effectiveAgent = React.useMemo(() => {
    // Ayrı ajan oturumunda URL kazanır (kapsam filtresiz direkt bul).
    if (routeAgentId) return userAgents.find((a) => a.id === routeAgentId) ?? null;
    const inScope = filterAgentsByScope(userAgents, agentWorkspaceId);
    return activeAgentId ? (inScope.find((a) => a.id === activeAgentId) ?? null) : null;
  }, [userAgents, activeAgentId, agentWorkspaceId, routeAgentId]);
  const chatsModel = useChatsStore((s) => s.model);
  const isThinkingEnabled = useChatsStore((s) => s.isThinkingEnabled);
  // Ajanın kullandığı çıkarım kimliği (ajan pini > genel ayar zinciri).
  const agentInference = React.useMemo(() => {
    if (!effectiveAgent) return null;
    const aiConfig = readYulaClientAiConfig();
    const providerId = effectiveAgent.provider || aiConfig.provider || "";
    const providerLabel =
      localizeProviderOptions(AGENT_PROVIDER_OPTIONS, tCat).find(
        (p) => p.id === providerId,
      )?.label ??
      (providerId || t("inference_server_default"));
    const providerText = `${providerLabel}${effectiveAgent.provider ? "" : ` ${t("inference_general")}`}`;
    const model = effectiveAgent.model || chatsModel || aiConfig.model || "";
    const modelText = `${model || t("inference_model_default")}${effectiveAgent.model ? "" : ` ${t("inference_general")}`}`;
    const effort = effectiveAgent.effort || aiConfig.effort || null;
    const effortText = effort
      ? `${t("inference_effort")}: ${effort}${effectiveAgent.effort ? "" : ` ${t("inference_general")}`}`
      : `${t("inference_effort")}: ${t("inference_general")}`;
    const thinkingOn = effectiveAgent.thinking ?? isThinkingEnabled;
    const thinkingText = `${t("inference_thinking")}: ${thinkingOn ? t("inference_on") : t("inference_off")}${effectiveAgent.thinking === undefined ? ` ${t("inference_general")}` : ""}`;
    return `${providerText} · ${modelText} · ${effortText} · ${thinkingText}`;
  }, [effectiveAgent, chatsModel, isThinkingEnabled, t, tCat]);

  const composer = useChatComposer({
    yula,
    effectiveAgent: effectiveAgent ? { id: effectiveAgent.id, skills: effectiveAgent.skills } : null,
    workspaceId,
    isViewingResults,
    pathname,
  });
  const composerView = (
    <ChatComposer composer={composer} isLoading={isLoading} onStop={() => void yula.stop()} />
  );

  const handleUndo = React.useCallback(
    (text: string) => {
      composer.setText(text);
      requestAnimationFrame(() => {
        composer.focus();
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const hasUserMessages = messages.some((message) => message.role === "user");
  const showCenteredIntro = (centeredIntro || (isMainMode && isHomePath)) && !hasUserMessages;

  // Sohbet değişiminde (New / konuşma seçimi) scroll durumunu sıfırla:
  // boşalan ekranda scroll olayı tetiklenmez, eski "alta kaydır" rozeti asılı kalır.
  // React'in "props değişince render sırasında state ayarla" deseni (effect'siz).
  const activeConversationId = yula.activeId;
  const [isAtBottom, setIsAtBottom] = React.useState(true);
  const [renderedConversationId, setRenderedConversationId] =
    React.useState(activeConversationId);
  if (renderedConversationId !== activeConversationId) {
    setRenderedConversationId(activeConversationId);
    setIsAtBottom(true);
  }

  const scrollRef = React.useRef<HTMLDivElement>(null);

  const scrollToBottom = React.useCallback((behavior: ScrollBehavior = "smooth") => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  React.useEffect(() => {
    if (isAtBottom) scrollToBottom(isLoading ? "auto" : "smooth");
  }, [messages, isLoading, streamingThinking, streamingContent, isAtBottom, scrollToBottom]);

  // Focus textbox ONLY when activeConversationId actually changes and history is closed.
  const prevConvIdRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (isHistoryOpen || isSearchingHistory) return;
    if (prevConvIdRef.current !== activeConversationId) {
      prevConvIdRef.current = activeConversationId;
      requestAnimationFrame(() => {
        composer.focus();
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConversationId, isHistoryOpen, isSearchingHistory]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    setIsAtBottom(distance < 48);
  };

  const recoveredToolCallIds = useRecoveredToolCallIds(messages);

  const chatPanelBody = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="relative min-h-0 flex-1">
        {showCenteredIntro ? (
          <ChatIntro
            isHomePath={isHomePath}
            effectiveAgent={effectiveAgent}
            workspaceRootIcon={workspaceRootIcon}
            greeting={greeting}
            workspaceLabel={workspaceLabel}
            introDescription={introDescription}
            dateLabel={dateLabel}
            agentInference={agentInference}
            aboveInput={aboveInput}
            composer={composerView}
            belowInput={belowInput}
            agentWorkspaceId={agentWorkspaceId}
            pathname={pathname}
            isAgentSession={isAgentSession}
          />
        ) : (
          <>
            <div
              ref={scrollRef}
              onScroll={onScroll}
              className="h-full overflow-y-auto overscroll-contain"
            >
              <div className="mx-auto w-full max-w-3xl space-y-2.5 px-3 py-2">
                {turns.map((turn, idx) => {
                  const isLast = idx === turns.length - 1;
                  const isLiveTurn =
                    !queuedPrompt &&
                    (isLoading || yula.isTurnActive) &&
                    isLast;

                  const durationSec = turn.assistantMessage?.id
                    ? yula.responseDurations[turn.assistantMessage.id]
                    : undefined;
                  const llmStepCount = turn.assistantMessage?.id
                    ? yula.llmStepCounts[turn.assistantMessage.id]
                    : undefined;

                  return (
                    <YulaChatTurn
                      key={turn.id}
                      userMessage={turn.userMessage}
                      assistantMessage={turn.assistantMessage}
                      isLive={isLiveTurn}
                      durationSec={durationSec}
                      llmStepCount={llmStepCount}
                      tokenUsage={turn.assistantMessage?.metadata?.usage}
                      recoveredToolCallIds={recoveredToolCallIds}
                      onUndo={handleUndo}
                      conversationId={
                        queuedPrompt || !isLast ? undefined : yula.activeId
                      }
                    />
                  );
                })}
                {queuedPrompt ? (
                  <YulaChatTurn
                    key="yula-pending-prompt"
                    userMessage={
                      {
                        id: "yula-pending-user",
                        role: "user",
                        parts: [{ type: "text", text: queuedPrompt }],
                      } as YulaMessage
                    }
                    isLive
                    conversationId={yula.activeId}
                    recoveredToolCallIds={recoveredToolCallIds}
                  />
                ) : null}
              </div>
            </div>

            {!isAtBottom ? (
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="absolute bottom-2 left-1/2 size-7 -translate-x-1/2 rounded-full bg-background shadow-md"
                onClick={() => scrollToBottom()}
                aria-label={t("scroll_down_aria")}
              >
                <ArrowDown className="size-3.5" />
              </Button>
            ) : null}
          </>
        )}
      </div>
      {!showCenteredIntro ? (
        <>
          {aboveInput}
          {composerView}
        </>
      ) : null}
    </div>
  );

  if (isSearchingHistory || isHistoryOpen) {
    return isMainMode ? <YulaHistoryMainView /> : <YulaHistorySidebar />;
  }

  if (isMainMode) {
    return (
      <div className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden">
        {chatPanelBody}
      </div>
    );
  }

  return chatPanelBody;
}

// Not: default export yok — dışarıdan yalnız `ai-chat-panel.tsx` tüketir.
export { AIChatPanelSession };
