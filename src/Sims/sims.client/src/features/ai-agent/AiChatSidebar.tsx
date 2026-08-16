import React, { useState } from "react";
import { useAgentBridge } from "../../hooks/useAgentBridge";
import { Send, Bot, User, Sparkles, Terminal, AlertCircle } from "lucide-react";

export const AiChatSidebar: React.FC = () => {
  const { status, messages, isProcessing, sendPrompt } = useAgentBridge();
  const [inputText, setInputText] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isProcessing) return;
    sendPrompt(inputText);
    setInputText("");
  };

  const samplePrompts = [
    "Ankara için son 30 günün satış raporunu filtrele",
    "İstanbul bu hafta stok analizi",
    "İzmir 2026 yılı genel raporu",
    "Bursa bugün işlem görenler",
  ];

  return (
    <aside className="w-80 md:w-96 flex flex-col h-full bg-slate-900 text-slate-100 border-r border-slate-800 shadow-xl">
      {/* Header */}
      <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-indigo-600/20 text-indigo-400 rounded-lg border border-indigo-500/30">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">Yula AI Agent</h2>
            <p className="text-xs text-slate-400">Terminal stdin/stdout Köprüsü</p>
          </div>
        </div>

        {/* Status Badge */}
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium bg-slate-800 border border-slate-700">
          {status === "running" && (
            <>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-emerald-400">Sidecar Aktif</span>
            </>
          )}
          {status === "browser_fallback" && (
            <>
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              <span className="text-amber-300">Tarayıcı Modu</span>
            </>
          )}
          {status === "starting" && (
            <>
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-ping" />
              <span className="text-blue-300">Başlatılıyor</span>
            </>
          )}
          {status === "error" && (
            <>
              <AlertCircle className="w-3 h-3 text-red-400" />
              <span className="text-red-400">Hata</span>
            </>
          )}
          {status === "idle" && (
            <>
              <span className="w-2 h-2 rounded-full bg-slate-500" />
              <span className="text-slate-400">Beklemede</span>
            </>
          )}
        </div>
      </div>

      {/* Mesaj Listesi */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 font-sans text-sm">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${msg.sender === "user" ? "items-end" : "items-start"}`}
          >
            <div className="flex items-center gap-1.5 mb-1 text-[11px] text-slate-400">
              {msg.sender === "user" && <User className="w-3 h-3 text-indigo-400" />}
              {msg.sender === "agent" && <Bot className="w-3 h-3 text-emerald-400" />}
              {msg.sender === "system" && <Terminal className="w-3 h-3 text-amber-400" />}
              <span>{msg.sender === "user" ? "Siz" : msg.sender === "agent" ? "AI Ajanı" : "Sistem"}</span>
              <span>•</span>
              <span>{msg.timestamp}</span>
            </div>

            <div
              className={`p-3 rounded-xl max-w-[90%] leading-relaxed ${
                msg.sender === "user"
                  ? "bg-indigo-600 text-white rounded-br-none"
                  : msg.sender === "agent"
                  ? msg.isToolCall
                    ? "bg-emerald-950/60 border border-emerald-500/40 text-emerald-200 rounded-bl-none shadow-sm"
                    : "bg-slate-800/90 text-slate-200 rounded-bl-none border border-slate-700/60"
                  : "bg-slate-950/70 text-slate-400 text-xs border border-slate-800 rounded-lg w-full font-mono"
              }`}
            >
              <div className="whitespace-pre-wrap">{msg.content}</div>

              {msg.isToolCall && msg.toolDetails && (
                <div className="mt-2 pt-2 border-t border-emerald-500/20 text-xs font-mono bg-black/30 p-2 rounded">
                  <div className="text-emerald-400 font-semibold mb-1">Argümanlar:</div>
                  <pre className="text-[11px] text-emerald-300">{JSON.stringify(msg.toolDetails, null, 2)}</pre>
                </div>
              )}
            </div>
          </div>
        ))}

        {isProcessing && (
          <div className="flex items-center gap-2 text-xs text-indigo-400 bg-indigo-950/30 p-2.5 rounded-lg border border-indigo-500/20 animate-pulse">
            <Sparkles className="w-4 h-4 animate-spin" />
            <span>AI komutu analiz edip Tool Call oluşturuyor...</span>
          </div>
        )}
      </div>

      {/* Hızlı Komut Örnekleri */}
      <div className="px-4 py-2 border-t border-slate-800/80 bg-slate-950/30">
        <p className="text-[11px] text-slate-400 mb-1.5 flex items-center gap-1">
          <Sparkles className="w-3 h-3 text-amber-400" /> Örnek Promptlar:
        </p>
        <div className="flex flex-wrap gap-1.5">
          {samplePrompts.map((prompt, idx) => (
            <button
              key={idx}
              type="button"
              disabled={isProcessing}
              onClick={() => sendPrompt(prompt)}
              className="text-[11px] px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition-colors text-left truncate max-w-full"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>

      {/* Input Form */}
      <form onSubmit={handleSubmit} className="p-3 border-t border-slate-800 bg-slate-950/80">
        <div className="relative flex items-center">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Komut yazın (örn: Ankara bu ayki raporu)..."
            disabled={isProcessing}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-3 pr-10 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!inputText.trim() || isProcessing}
            className="absolute right-1.5 p-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white rounded-md transition-colors"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </form>
    </aside>
  );
};
