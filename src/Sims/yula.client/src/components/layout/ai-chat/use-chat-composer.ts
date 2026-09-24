"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import {
  getAllYulaCommands,
  localizeYulaCommands,
  matchModelSubcommands,
  matchProviderSubcommands,
  matchYulaCommands,
  userSkillsToCommands,
  type YulaCommand,
} from "@/components/layout/yula-commands";
import { useChatsStore } from "@/lib/stores/chats";
import { useUserSkillsStore } from "@/lib/stores/user-skills";
import { buildUserSkillPrompt } from "@/lib/yula-user-skill";
import { ensureExampleAgent } from "@/lib/stores/user-agents";
import { navigateToConversationScreen } from "@/lib/yula-history-navigation";
import type { useYulaChat } from "@/hooks/use-yula-chat";
import { useHistorySuggestions } from "./use-history-suggestions";
import { useProviderDialogStore } from "@/lib/stores/provider-dialog-store";
import {
  fetchCachedYulaModels,
  getCachedAllModels,
  getCachedAvailableProviders,
  useYulaAiConfig,
  writeYulaClientAiConfig,
} from "@/lib/yula-ai-client-config";

export type AttachedFile = {
  id: string;
  name: string;
  size: number;
  type: string;
  dataUrl?: string;
};

type YulaSession = ReturnType<typeof useYulaChat>;

export type EffectiveAgentInfo = {
  id: string;
  skills?: string[];
} | null;

/**
 * Sohbet besteci (composer) durumu: girdi, ekler, slash komutları,
 * geçmiş önerileri, gönderme ve dosya mantığı. JSX `chat-composer.tsx`'tedir.
 */
export function useChatComposer(args: {
  yula: YulaSession;
  effectiveAgent: EffectiveAgentInfo;
  workspaceId: string;
  isViewingResults: boolean;
  pathname: string;
}) {
  const { yula, effectiveAgent, workspaceId, isViewingResults, pathname } = args;
  const router = useRouter();
  const tc = useTranslations("Commands");
  const tChat = useTranslations("ChatAssistant");
  const locale = useLocale();

  const [input, setInput] = React.useState("");
  const aiConfig = useYulaAiConfig();
  const storeModel = useChatsStore((s) => s.model);
  const activeModel = (aiConfig.model || yula.model || storeModel || "").trim();
  const activeProvider = aiConfig.provider;
  const modelTag = activeModel
    ? activeProvider
      ? `${activeProvider}:${activeModel}`
      : activeModel
    : null;

  const [attachments, setAttachments] = React.useState<AttachedFile[]>([]);
  const [selectedCommand, setSelectedCommand] = React.useState<YulaCommand | null>(null);
  const [pastedChip, setPastedChip] = React.useState<{
    id: string;
    content: string;
    preview: string;
  } | null>(null);
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const [prevCommandInput, setPrevCommandInput] = React.useState("");
  const [historyIndex, setHistoryIndex] = React.useState(0);
  const [historyClosed, setHistoryClosed] = React.useState(false);
  // Girdi değişince komut seçimini başa al — render sırasında state ayarlama.
  if (prevCommandInput !== input) {
    setPrevCommandInput(input);
    setSelectedIndex(0);
    setHistoryIndex(0);
    setHistoryClosed(false);
  }

  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  const userSkills = useUserSkillsStore((s) => s.skills);
  // Komut menüsündeki skill'ler ajanın seçtikleridir (açık seçim kapsamı
  // ezer; seçili ajan + boş liste = skill komutu yok).
  const userSkillCommands = React.useMemo(
    () =>
      userSkillsToCommands(
        userSkills,
        workspaceId,
        effectiveAgent ? effectiveAgent.skills : undefined,
        tc,
      ),
    [userSkills, workspaceId, effectiveAgent, tc],
  );
  // Örnek ajan: ana sayfa kartlarında seçilebilir olması için ilk bağlanışta üret.
  // `locale` bağımlılığı: dil değişirse (aynı oturumda bile) yeni locale seed'i garanti.
  React.useEffect(() => {
    ensureExampleAgent(locale as "tr" | "en");
  }, [locale]);
  const allCommands = React.useMemo(
    () => localizeYulaCommands(getAllYulaCommands(isViewingResults, pathname, userSkillCommands), tc),
    // `tc` render başına yenidir; liste küçüktür → her render yeniden çözümle
    [isViewingResults, pathname, userSkillCommands, tc],
  );

  const [allModelsList, setAllModelsList] = React.useState(() => getCachedAllModels());
  const [availableProvidersList, setAvailableProvidersList] = React.useState(() =>
    getCachedAvailableProviders(),
  );
  const [isRefreshingModels, setIsRefreshingModels] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    void fetchCachedYulaModels(aiConfig).then((data) => {
      if (!active) return;
      if (data?.allModels && data.allModels.length > 0) setAllModelsList(data.allModels);
      if (data?.availableProviders && data.availableProviders.length > 0) {
        setAvailableProvidersList(data.availableProviders);
      }
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- provider ve endpoint değiştikçe modeller yenilenir
  }, [aiConfig.provider, aiConfig.endpoint]);

  const isProviderSubmenu =
    selectedCommand?.id === "provider" ||
    selectedCommand?.id === "login" ||
    input.startsWith("/provider ") ||
    input === "/provider" ||
    input.startsWith("/login ") ||
    input === "/login";

  const isModelSubmenu =
    selectedCommand?.id === "model" ||
    input.startsWith("/model ") ||
    input === "/model";

  const providerMatchOpts = React.useMemo(
    () => ({
      availableProviderIds: availableProvidersList.map((p) => p.id),
      activeProvider: aiConfig.provider,
      activeLabel: tChat("provider_active"),
      loggedInLabel: tChat("provider_logged_in"),
      notConfiguredLabel: tChat("provider_not_configured"),
    }),
    [availableProvidersList, aiConfig.provider, tChat],
  );

  const commandMatches = React.useMemo(() => {
    if (selectedCommand?.id === "provider" || selectedCommand?.id === "login") {
      return matchProviderSubcommands(input, providerMatchOpts);
    }
    if (
      input.startsWith("/provider ") ||
      input === "/provider" ||
      input.startsWith("/login ") ||
      input === "/login"
    ) {
      const sub = input.replace(/^\/(provider|login)\s*/, "");
      return matchProviderSubcommands(sub, providerMatchOpts);
    }
    if (selectedCommand?.id === "model") {
      return matchModelSubcommands(input, allModelsList, isRefreshingModels, aiConfig.provider);
    }
    if (input.startsWith("/model ") || input === "/model") {
      const sub = input.replace(/^\/model\s*/, "");
      return matchModelSubcommands(sub, allModelsList, isRefreshingModels, aiConfig.provider);
    }
    return matchYulaCommands(input, allCommands);
  }, [selectedCommand, input, allCommands, allModelsList, isRefreshingModels, providerMatchOpts, aiConfig.provider]);

  const showCommands =
    (selectedCommand?.id === "provider" ||
      selectedCommand?.id === "login" ||
      selectedCommand?.id === "model" ||
      input.startsWith("/")) &&
    commandMatches !== null &&
    commandMatches.length > 0;
  // "Ajan oluştur" alt öğesi yalnız ana Yula ekranında (/) gösterilir ve
  // ok tuşu gezintisine dahildir (son sıra).
  const showNewAgentItem = showCommands && pathname === "/" && !isProviderSubmenu && !isModelSubmenu;
  const paletteItemCount = (commandMatches?.length ?? 0) + (showNewAgentItem ? 1 : 0);
  const isNewAgentSelected =
    showNewAgentItem && selectedIndex === (commandMatches?.length ?? 0);

  const historyAgentId = effectiveAgent?.id ?? null;
  const historySuggestions = useHistorySuggestions(input, historyAgentId);
  const showHistory =
    !showCommands &&
    !historyClosed &&
    historySuggestions.length > 0 &&
    !selectedCommand &&
    !pastedChip;

  // Geçmiş öneri seçimi: girdiyi doldurmak yerine kayıtlı sohbeti açar
  // (geçmiş panelindeki seçimle aynı akış: seç + ekrana git).
  const openHistoryConversation = React.useCallback(
    (convId: string) => {
      const store = useChatsStore.getState();
      const session = store.conversations.find((c) => c.id === convId);
      if (!session) return;
      setInput("");
      setHistoryClosed(true);
      setHistoryIndex(0);
      store.selectConversation(convId);
      navigateToConversationScreen(
        session,
        (href) => {
          router.push(href);
        },
        store.messagesById[convId],
      );
      store.setHistoryOpen(false);
      store.setSearchingHistory(false);
    },
    [router],
  );

  const clearComposer = (closeHistory = true) => {
    setInput("");
    setSelectedCommand(null);
    setPastedChip(null);
    setAttachments([]);
    if (closeHistory) setHistoryClosed(true);
  };

  const newConversation = yula.newConversation;

  const doSend = (text: string) => {
    const trimmed = text.trim();
    const promptPrefix = selectedCommand ? selectedCommand.prompt : "";
    const pastedBlock = pastedChip ? `\n\n\`\`\`\n${pastedChip.content}\n\`\`\`` : "";

    if (!trimmed && !promptPrefix && !pastedChip && attachments.length === 0) return;

    const lower = trimmed.toLowerCase();
    if (selectedCommand?.id === "new" || lower === "/new" || lower === "/yeni" || lower === "/clear") {
      newConversation();
      clearComposer();
      return;
    }

    if (selectedCommand?.id === "dump" || lower === "/dump") {
      yula.dumpSession?.();
      clearComposer();
      return;
    }

    if (
      selectedCommand?.id === "provider" ||
      selectedCommand?.id === "login" ||
      lower.startsWith("/provider") ||
      lower.startsWith("/login")
    ) {
      const sub = trimmed.replace(/^\/(provider|login)\s*/i, "").trim();
      clearComposer();
      useProviderDialogStore.getState().openDialog((sub || "ollama").toLowerCase());
      return;
    }

    if (selectedCommand?.id === "model" || lower.startsWith("/model")) {
      const sub = trimmed.replace(/^\/model\s*/i, "").trim();
      clearComposer();

      if (["refresh", "yenile", "guncelle"].includes(sub.toLowerCase())) {
        setIsRefreshingModels(true);
        const modelCmd = allCommands.find((c) => c.id === "model");
        if (modelCmd) setSelectedCommand(modelCmd);
        setInput("");
        setHistoryClosed(false);
        void fetchCachedYulaModels(undefined, true)
          .then((res) => {
            if (res?.allModels) setAllModelsList(res.allModels);
          })
          .finally(() => setIsRefreshingModels(false));
        return;
      }

      if (sub) {
        const found = allModelsList.find(
          (m) => m.id.toLowerCase() === sub.toLowerCase() || m.name.toLowerCase() === sub.toLowerCase(),
        );
        const targetModel = found?.id || sub;
        writeYulaClientAiConfig({
          model: targetModel,
          ...(found?.provider ? { provider: found.provider as any } : {}),
        });
        useChatsStore.getState().setModel(targetModel);
      } else {
        const cmd = allCommands.find((c) => c.id === "model");
        if (cmd) setSelectedCommand(cmd);
      }
      return;
    }

    const finalPromptRaw = selectedCommand?.source === "user"
      ? buildUserSkillPrompt(selectedCommand, trimmed)
      : promptPrefix ? (trimmed ? `${promptPrefix} ${trimmed}` : promptPrefix) : trimmed;
    const finalPrompt = pastedBlock ? `${finalPromptRaw}${pastedBlock}`.trim() : finalPromptRaw;

    const currentAttachments = [...attachments];
    if (yula.isSuspended && yula.respondToChoice) {
      yula.respondToChoice(`${finalPrompt}`.trim());
    } else {
      yula.sendMessageText(`${finalPrompt}`.trim(), currentAttachments);
    }
    clearComposer();
  };

  const handleSend = (overrideText?: string) => {
    doSend(overrideText ?? input);
  };

  const handleSteer = (text?: string) => {
    const content = (text ?? input).trim();
    if (!content) return;
    yula.steer?.(content);
    clearComposer(false);
  };

  const handleFollowUp = (text?: string) => {
    const content = (text ?? input).trim();
    if (!content) return;
    yula.followUp?.(content);
    clearComposer(false);
  };

  const applyCommand = (command: YulaCommand) => {
    if (command.id === "new") {
      newConversation();
      clearComposer();
      return;
    }
    if (command.id === "dump") {
      yula.dumpSession?.();
      clearComposer();
      return;
    }
    if (command.id.startsWith("provider-") || (isProviderSubmenu && command.slash)) {
      clearComposer();
      useProviderDialogStore.getState().openDialog(command.slash);
      return;
    }
    if (command.id.startsWith("model-") || (isModelSubmenu && command.slash)) {
      if (isModelSubmenu && (command.id === "model:refresh" || command.slash === "refresh")) {
        setIsRefreshingModels(true);
        const modelCmd = allCommands.find((c) => c.id === "model");
        if (modelCmd) setSelectedCommand(modelCmd);
        setInput("");
        setHistoryClosed(false);
        void fetchCachedYulaModels(undefined, true)
          .then((res) => {
            if (res?.allModels) setAllModelsList(res.allModels);
          })
          .finally(() => setIsRefreshingModels(false));
        return;
      }
      const targetModel = command.slash;
      const targetProvider = command.pagePath;
      clearComposer();
      writeYulaClientAiConfig({
        model: targetModel,
        ...(targetProvider ? { provider: targetProvider as any } : {}),
      });
      useChatsStore.getState().setModel(targetModel);
      return;
    }
    setSelectedCommand(command);
    setInput("");
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const onFilesSelected = (files: FileList | null) => {
    if (!files?.length) return;
    Array.from(files).forEach((file) => {
      const id = `${file.name}-${file.size}-${file.lastModified}`;
      if (file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const dataUrl = e.target?.result as string;
          setAttachments((curr) => curr.some((f) => f.id === id) ? curr : [...curr, { id, name: file.name, size: file.size, type: file.type, dataUrl }].slice(0, 5));
        };
        reader.readAsDataURL(file);
      } else {
        setAttachments((curr) => curr.some((f) => f.id === id) ? curr : [...curr, { id, name: file.name, size: file.size, type: file.type }].slice(0, 5));
      }
    });
  };

  const canSubmit =
    Boolean(input.trim()) ||
    Boolean(selectedCommand) ||
    Boolean(pastedChip) ||
    attachments.length > 0;

  const closeCommands = React.useCallback(() => {
    setInput("");
    setSelectedCommand(null);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, []);

  return {
    input,
    setInput,
    /** Geri-al (undo) akışı için dışarıdan metin doldurma. */
    setText: setInput,
    focus: () => textareaRef.current?.focus(),
    attachments,
    setAttachments,
    selectedCommand,
    setSelectedCommand,
    pastedChip,
    setPastedChip,
    selectedIndex,
    setSelectedIndex,
    historyIndex,
    setHistoryIndex,
    historyClosed,
    setHistoryClosed,
    fileInputRef,
    textareaRef,
    commandMatches,
    isRefreshingModels,
    showCommands,
    showNewAgentItem,
    paletteItemCount,
    isNewAgentSelected,
    historySuggestions,
    showHistory,
    openHistoryConversation,
    handleSend,
    handleSteer,
    handleFollowUp,
    applyCommand,
    onFilesSelected,
    canSubmit,
    modelTag,
    closeCommands,
    isModelSubmenu,
    isProviderSubmenu,
    isSuspended: yula.isSuspended,
    pendingChoice: yula.pendingChoice,
    respondToChoice: yula.respondToChoice,
  };
}

export type ChatComposerState = ReturnType<typeof useChatComposer>;
