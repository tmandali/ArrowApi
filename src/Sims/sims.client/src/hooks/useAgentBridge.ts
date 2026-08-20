import { useEffect } from "react";
import { create } from "zustand";
import { toolRegistry } from "../lib/tool-registry";
import { isTauriEnv } from "@/lib/api-url";
import { resolveGenericToolIntent } from "@/lib/generic-nlp-resolver";

export interface ChatMessage {
  id: string;
  sender: "user" | "agent" | "system";
  content: string;
  timestamp: string;
  isToolCall?: boolean;
  toolDetails?: any;
  toolResult?: any;
  customKind?: string;
}

export type ProcessStatus = "idle" | "starting" | "running" | "error" | "browser_fallback";

interface AgentBridgeStore {
  status: ProcessStatus;
  messages: ChatMessage[];
  isProcessing: boolean;
  appendMessage: (msg: Omit<ChatMessage, "id" | "timestamp">) => void;
  sendPrompt: (promptText: string) => Promise<void>;
  ensureStarted: () => Promise<void>;
  newConversation: () => void;
}

let sharedChildProcess: any = null;
let isStartingProcess = false;
let processingTimeout: any = null;

export const useAgentBridgeStore = create<AgentBridgeStore>((set, get) => ({
  status: "idle",
  messages: [
    {
      id: "init-1",
      sender: "system",
      content: "Yula AI Ajan Köprüsü hazır (Gemma 4 & MCP Tool Calling).",
      timestamp: new Date().toLocaleTimeString("tr-TR"),
    },
  ],
  isProcessing: false,

  newConversation: () => {
    set({
      messages: [
        {
          id: "init-1",
          sender: "system",
          content: "Yula AI Ajan Köprüsü hazır (Gemma 4 & MCP Tool Calling).",
          timestamp: new Date().toLocaleTimeString("tr-TR"),
        },
      ],
      isProcessing: false,
    });

    if (sharedChildProcess) {
      sharedChildProcess
        .write(JSON.stringify({ action: "reset" }) + "\n")
        .catch((err: any) => console.error("[Sidecar Reset Error]:", err));
    }
  },

  appendMessage: (msg) => {
    set((state) => {
      // Eğer aynı customKind'a sahip bir kart mesajı zaten varsa, yeni kart açmak yerine mevcut kartı yerinde güncelle
      if (msg.customKind) {
        const existingIdx = state.messages.findIndex((m) => m.customKind === msg.customKind);
        if (existingIdx !== -1) {
          const updatedMessages = [...state.messages];
          updatedMessages[existingIdx] = {
            ...updatedMessages[existingIdx],
            content: msg.content,
            toolResult: msg.toolResult,
            timestamp: new Date().toLocaleTimeString("tr-TR"),
          };
          return { messages: updatedMessages };
        }
      }

      return {
        messages: [
          ...state.messages,
          {
            ...msg,
            id: Math.random().toString(36).substring(2, 9),
            timestamp: new Date().toLocaleTimeString("tr-TR"),
          },
        ],
      };
    });
  },

  ensureStarted: async () => {
    if (sharedChildProcess || isStartingProcess) return;

    if (!isTauriEnv) {
      set({ status: "browser_fallback" });
      return;
    }

    isStartingProcess = true;
    set({ status: "starting" });

    try {
      const { Command } = await import("@tauri-apps/plugin-shell");
      const command = Command.sidecar("binaries/main");

      command.on("close", (data: any) => {
        sharedChildProcess = null;
        isStartingProcess = false;
        set({ status: "idle", isProcessing: false });
        console.log(`[Sidecar] Süreç kapandı (Kod: ${data.code})`);
      });

      command.on("error", (error: any) => {
        sharedChildProcess = null;
        isStartingProcess = false;
        set({ status: "error", isProcessing: false });
        get().appendMessage({
          sender: "system",
          content: `❌ Sidecar hatası: ${error}`,
        });
      });

      command.stderr.on("data", (err: string) => {
        console.error("[Sidecar Stderr]:", err);
      });

      command.stdout.on("data", async (data: string) => {
        const lines = data.split("\n");
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          console.log("[Sidecar Stdout]:", trimmed);

          try {
            const parsed = JSON.parse(trimmed);

            // 1. Tool Call Tetiklendi
            if (parsed.type === "tool_call" && parsed.tool) {
              const toolName = parsed.tool;
              const toolArgs = parsed.arguments || {};

              // ToolRegistry üzerinden yürüt
              const execution = await toolRegistry.executeTool(toolName, toolArgs);

              if (execution.success) {
                const customKind = execution.result?.customKind;
                const messageText = parsed.message || (customKind
                  ? `Lütfen aşağıdaki karttaki kriterleri inceleyin ve raporunuzu oluşturmak için **Çalıştır (Run)** veya tam ekran görmek için **Sayfada Aç** butonuna tıklayın.`
                  : `✓ "${toolName}" başarıyla uygulandı.`);

                get().appendMessage({
                  sender: "agent",
                  content: messageText,
                  toolResult: execution.result,
                  toolDetails: toolArgs,
                  customKind,
                });

                if (sharedChildProcess) {
                  const resPayload = JSON.stringify({
                    action: "tool_result",
                    tool: toolName,
                    result: execution.result,
                  });
                  await sharedChildProcess.write(resPayload + "\n");
                }
              } else {
                get().appendMessage({
                  sender: "system",
                  content: `❌ "${toolName}" execution error: ${execution.error}`,
                });
              }

              if (processingTimeout) clearTimeout(processingTimeout);
              set({ isProcessing: false });
            }
            // 2. Normal Mesaj (Yalnızca önceki mesajla birebir aynı değilse ekle)
            else if (parsed.type === "message") {
              const lastMsg = get().messages[get().messages.length - 1];
              if (!lastMsg || lastMsg.content !== parsed.content) {
                get().appendMessage({
                  sender: "agent",
                  content: parsed.content,
                });
              }
              if (processingTimeout) clearTimeout(processingTimeout);
              set({ isProcessing: false });
            }
            // 3. Durum Bildirimi
            else if (parsed.type === "status") {
              console.log(`[Sidecar Status]: ${parsed.status} - ${parsed.message || ""}`);
            }
            // 4. Hata Bildirimi
            else if (parsed.type === "error") {
              get().appendMessage({
                sender: "system",
                content: `❌ Agent Error: ${parsed.message}`,
              });
              if (processingTimeout) clearTimeout(processingTimeout);
              set({ isProcessing: false });
            }
          } catch {
            // Raw text logs
          }
        }
      });

      const child = await command.spawn();
      sharedChildProcess = child;
      isStartingProcess = false;
      set({ status: "running" });

      const toolsPayload = JSON.stringify({
        action: "register_tools",
        tools: toolRegistry.getAllDefinitions(),
      });
      await child.write(toolsPayload + "\n");
    } catch (err: any) {
      sharedChildProcess = null;
      isStartingProcess = false;
      set({ status: "error", isProcessing: false });
      get().appendMessage({
        sender: "system",
        content: `Sidecar failed to start: ${err?.message || err}`,
      });
    }
  },

  sendPrompt: async (promptText: string) => {
    if (!promptText.trim()) return;

    get().appendMessage({
      sender: "user",
      content: promptText,
    });

    set({ isProcessing: true });

    if (processingTimeout) clearTimeout(processingTimeout);
    processingTimeout = setTimeout(() => {
      set({ isProcessing: false });
    }, 60000);

    const payload = JSON.stringify({
      action: "task",
      prompt: promptText,
    });

    try {
      if (isTauriEnv) {
        if (!sharedChildProcess) {
          await get().ensureStarted();
        }
        if (sharedChildProcess) {
          await sharedChildProcess.write(payload + "\n");
        } else {
          throw new Error("Sidecar child process is not ready.");
        }
      } else {
        // Fallback / Tarayıcı simülasyonu — 100% Generic Schema-Driven Resolver
        setTimeout(async () => {
          const allTools = toolRegistry.getAll();
          const resolved = resolveGenericToolIntent(promptText, allTools);

          if (resolved.tool) {
            const exec = await toolRegistry.executeTool(resolved.tool, resolved.arguments);
            get().appendMessage({
              sender: "agent",
              content: resolved.message,
              customKind: exec.result?.customKind,
              toolResult: exec.result,
              toolDetails: resolved.arguments,
            });
          } else {
            get().appendMessage({
              sender: "agent",
              content: `Merhaba! Size nasıl yardımcı olabilirim? Yula ERP bünyesindeki tüm rapor ve sorgulamalar için bana doğal dilde talimat verebilirsiniz.`,
            });
          }
          if (processingTimeout) clearTimeout(processingTimeout);
          set({ isProcessing: false });
        }, 400);
      }
    } catch (err: any) {
      get().appendMessage({
        sender: "system",
        content: `Komut iletilemedi: ${err?.message || err}`,
      });
      if (processingTimeout) clearTimeout(processingTimeout);
      set({ isProcessing: false });
    }
  },
}));

export function useAgentBridge() {
  const status = useAgentBridgeStore((s) => s.status);
  const messages = useAgentBridgeStore((s) => s.messages);
  const isProcessing = useAgentBridgeStore((s) => s.isProcessing);
  const sendPrompt = useAgentBridgeStore((s) => s.sendPrompt);
  const ensureStarted = useAgentBridgeStore((s) => s.ensureStarted);

  useEffect(() => {
    void ensureStarted();
  }, [ensureStarted]);

  return {
    status,
    messages,
    isProcessing,
    sendPrompt,
  };
}
