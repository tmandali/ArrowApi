import * as React from "react";
import type { UseChatHelpers } from "@ai-sdk/react";
import type { YulaMessage } from "@/app/api/agent/chat/route";
import type { YulaConversation } from "@/lib/stores/chats";

export interface YulaChatContextValue
  extends Pick<
    UseChatHelpers<YulaMessage>,
    "messages" | "status" | "stop" | "error" | "addToolOutput"
  > {
  busy: boolean;
  sendMessageText: (
    text: string,
    attachments?: Array<{ name: string; type: string; dataUrl?: string }>,
  ) => void;
  /** Kullanıcı mesajını ve sonrasını geçmişten ve LLM bağlamından siler, soru metnini döner */
  undoToUserMessage: (messageId: string) => string | undefined;
  /** Kullanıcı yanıtı durdurdu mu (retry butonu görünürlüğü için) */
  stopped: boolean;
  /** Durdurulan/hatalı yanıtı yeniden dene (SDK regenerate/sendMessage seçimi) */
  retryResponse: () => Promise<void>;
  /** dynamic-tool parçasını istemcide çalıştırıp akışı devam ettirir */
  runPendingTool: (part: {
    toolCallId: string;
    toolName: string;
    input?: unknown;
    state?: string;
  }) => void;
  conversations: YulaConversation[];
  activeId: string;
  selectConversation: (id: string) => void;
  deleteConversation: (id: string) => void;
  newConversation: () => void;
  model: string;
  setModel: (model: string) => void;
  isThinkingEnabled: boolean;
  setThinkingEnabled: (enabled: boolean) => void;
  /** Yanıt süreci (LLM + Araçlar) tüm turlar tamamlanana kadar aktif mi? */
  isTurnActive: boolean;
  /** Asistan mesaj id -> yanıt süresi (saniye) */
  responseDurations: Record<string, number>;
  /** Asistan mesaj id -> akış hatası ham metni (sağlayıcı 401, kota, ağ vb.) */
  streamErrorTexts: Record<string, string>;
  /** Asistan mesaj id -> LLM tur/çağrı sayısı */
  llmStepCounts: Record<string, number>;
}

export const YulaChatContext = React.createContext<YulaChatContextValue | null>(
  null,
);
