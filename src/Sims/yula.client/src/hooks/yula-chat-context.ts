import * as React from "react";
import type { YulaMessage } from "@/app/api/agent/chat/route";
import type { YulaConversation } from "@/lib/stores/chats";

export type YulaChatStatus = "ready" | "submitted" | "streaming" | "error";

export interface YulaChatContextValue {
  messages: YulaMessage[];
  status: YulaChatStatus;
  stop: () => void;
  error?: Error | undefined;
  addToolOutput?: (params: { toolCallId: string; output: unknown }) => void;
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
  runPendingTool: (
    part: {
      toolCallId: string;
      toolName: string;
      input?: unknown;
      state?: string;
    },
    opts?: { skipAsDuplicate?: string },
  ) => void;
  conversations: YulaConversation[];
  activeId: string;
  selectConversation: (id: string) => void;
  deleteConversation: (id: string) => void;
  deleteConversations?: (ids: string[]) => void;
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
  /** Oturumun tüm detaylarıyla (mesajlar, telemetri, araçlar, olaylar) dump dosyasını indirir */
  dumpSession: () => void;
  /** Context Window doluluğu ve token hesabı (Pi Reference) */
  contextUsage?: import("@my-agent/core").ContextUsage;
  autoCompactEnabled?: boolean;
  setAutoCompactEnabled?: (enabled: boolean) => void;
  isCompacting?: boolean;
  compact?: (customInstructions?: string) => Promise<boolean>;
  /** ⚡ Pi Steering: Ajan çalışırken anlık araya girme */
  steer: (message: string) => void;
  /** 📥 Pi Follow-up: Ajan mevcut işini bitirince sıradaki işi otomatik devralma */
  followUp: (message: string) => void;
  /** Bekleyen steering ve follow-up kuyrukları */
  steeringQueue: import("@my-agent/core").QueueItem[];
  followUpQueue: import("@my-agent/core").QueueItem[];
  clearSteering: () => void;
  clearFollowUp: () => void;
  /** Ajan kullanıcı onayı / seçimi bekliyor mu (ask_user_choice askıda mı)? */
  isSuspended: boolean;
  /** Askıda olan seçim bilgisi */
  pendingChoice: {
    toolCallId: string;
    messageId?: string;
    question: string;
    options: Array<any>;
    allowCustom?: boolean;
    customPlaceholder?: string;
  } | null;
  /** Askıdaki seçimi yanıtlayıp ajanın akışa devam etmesini sağlar */
  respondToChoice: (value: string) => void;
}

export const YulaChatContext = React.createContext<YulaChatContextValue>({} as YulaChatContextValue);
