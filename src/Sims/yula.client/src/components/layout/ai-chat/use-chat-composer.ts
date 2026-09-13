"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import {
  getAllYulaCommands,
  localizeYulaCommands,
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
  const locale = useLocale();

  const [input, setInput] = React.useState("");
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
  const commandMatches = matchYulaCommands(input, allCommands);
  const showCommands = input.startsWith("/") && commandMatches !== null && commandMatches.length > 0;
  // "Ajan oluştur" alt öğesi yalnız ana Yula ekranında (/) gösterilir ve
  // ok tuşu gezintisine dahildir (son sıra).
  const showNewAgentItem = showCommands && pathname === "/";
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

  const newConversation = yula.newConversation;

  const doSend = (text: string) => {
    const trimmed = text.trim();
    const promptPrefix = selectedCommand ? selectedCommand.prompt : "";
    const pastedBlock = pastedChip ? `\n\n\`\`\`\n${pastedChip.content}\n\`\`\`` : "";

    if (!trimmed && !promptPrefix && !pastedChip && attachments.length === 0) return;

    if (
      selectedCommand?.id === "attach" ||
      selectedCommand?.slash === "dosya" ||
      trimmed.toLowerCase() === "/dosya"
    ) {
      fileInputRef.current?.click();
      setInput("");
      setSelectedCommand(null);
      setPastedChip(null);
      setHistoryClosed(true);
      return;
    }

    if (selectedCommand?.id === "new" || trimmed.toLowerCase() === "/new") {
      newConversation();
      setInput("");
      setSelectedCommand(null);
      setPastedChip(null);
      setAttachments([]);
      setHistoryClosed(true);
      return;
    }

    let finalPrompt = "";
    if (selectedCommand?.source === "user") {
      finalPrompt = buildUserSkillPrompt(selectedCommand, trimmed);
    } else if (promptPrefix) {
      finalPrompt = trimmed ? `${promptPrefix} ${trimmed}` : promptPrefix;
    } else {
      finalPrompt = trimmed;
    }

    if (pastedBlock) {
      finalPrompt = `${finalPrompt}${pastedBlock}`.trim();
    }

    const currentAttachments = [...attachments];
    yula.sendMessageText(`${finalPrompt}`.trim(), currentAttachments);
    setInput("");
    setSelectedCommand(null);
    setPastedChip(null);
    setAttachments([]);
    setHistoryClosed(true);
  };

  const handleSend = () => {
    doSend(input);
  };

  const applyCommand = (command: YulaCommand) => {
    if (command.id === "new") {
      newConversation();
      setInput("");
      setSelectedCommand(null);
      setPastedChip(null);
      setHistoryClosed(true);
      return;
    }
    if (command.id === "attach" || command.slash === "dosya") {
      fileInputRef.current?.click();
      setInput("");
      setSelectedCommand(null);
      setPastedChip(null);
      setHistoryClosed(true);
      return;
    }
    setSelectedCommand(command);
    setInput("");
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const onFilesSelected = (files: FileList | null) => {
    if (!files?.length) return;
    const fileArray = Array.from(files);

    fileArray.forEach((file) => {
      const id = `${file.name}-${file.size}-${file.lastModified}`;
      const isImage = file.type.startsWith("image/");

      if (isImage) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const dataUrl = e.target?.result as string;
          setAttachments((current) => {
            if (current.some((f) => f.id === id)) return current;
            return [...current, { id, name: file.name, size: file.size, type: file.type, dataUrl }].slice(0, 5);
          });
        };
        reader.readAsDataURL(file);
      } else {
        setAttachments((current) => {
          if (current.some((f) => f.id === id)) return current;
          return [...current, { id, name: file.name, size: file.size, type: file.type }].slice(0, 5);
        });
      }
    });
  };

  const canSubmit =
    Boolean(input.trim()) ||
    Boolean(selectedCommand) ||
    Boolean(pastedChip) ||
    attachments.length > 0;

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
    showCommands,
    showNewAgentItem,
    paletteItemCount,
    isNewAgentSelected,
    historySuggestions,
    showHistory,
    openHistoryConversation,
    handleSend,
    applyCommand,
    onFilesSelected,
    canSubmit,
  };
}

export type ChatComposerState = ReturnType<typeof useChatComposer>;
