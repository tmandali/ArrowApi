/**
 * Geliştirici konsoluna (DevTools Console) şeffaf, renkli ve zengin AI telemetrisi yazdırır.
 * Her AI etkileşiminde motor/model, prompt/context, tool call, düşünme zinciri ve
 * token/performans metrikleri hiyerarşik gruplar halinde basılır.
 */
export function logAiTelemetry(options: {
  source: string;
  model: string;
  userPrompt: string;
  systemPrompt?: string;
  context?: any;
  tools?: any[];
  responseContent?: string;
  reasoningText?: string;
  toolCall?: { tool: string; arguments: any };
  executionResult?: any;
  telemetry?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    durationMs?: number;
    error?: string;
  };
}) {
  const {
    source,
    model,
    userPrompt,
    systemPrompt,
    context,
    tools,
    responseContent,
    reasoningText,
    toolCall,
    executionResult,
    telemetry,
  } = options;

  const tokenStr = telemetry?.totalTokens ? `${telemetry.totalTokens} tokens` : "Deterministic / Local";
  const durationStr = telemetry?.durationMs !== undefined ? `${telemetry.durationMs}ms` : "< 1ms";

  console.groupCollapsed(
    `%c🤖 [Yula AI Telemetry] %c${model} %c| %c${tokenStr} %c| %c${durationStr}`,
    "color: #a855f7; font-weight: bold; font-size: 11px;",
    "color: #3b82f6; font-weight: bold; font-size: 11px;",
    "color: #6b7280; font-size: 11px;",
    "color: #10b981; font-weight: bold; font-size: 11px;",
    "color: #6b7280; font-size: 11px;",
    "color: #f59e0b; font-weight: bold; font-size: 11px;"
  );

  console.log("%c📡 Motor / Ortam:", "color: #9333ea; font-weight: bold;", source);
  console.log("%c🧠 Çalışan Model:", "color: #2563eb; font-weight: bold;", model);

  console.groupCollapsed("%c📤 1. AI'a Gönderilen İstek (Prompt & Context)", "color: #d97706; font-weight: bold;");
  console.log("Kullanıcı İstemi (User Prompt):", userPrompt);
  if (systemPrompt) console.log("Sistem İstemi (System Prompt):", systemPrompt);
  if (context) console.log("Ekran & Workspace Kapsamı (Context):", context);
  if (tools && tools.length > 0) console.log(`Kayıtlı Araçlar (${tools.length} adet):`, tools);
  console.groupEnd();

  console.groupCollapsed("%c📥 2. AI'ın Ürettiği Yanıt & Tool Call", "color: #059669; font-weight: bold;");
  if (toolCall) console.log("🛠️ Tetiklenen Araç (Tool Call):", toolCall);
  if (executionResult) console.log("⚡ Araç Yürütme Sonucu (Tool Execution Result):", executionResult);
  if (reasoningText) console.log("🧩 Düşünme Zinciri (Reasoning):", reasoningText);
  console.log("💬 Model Metin Yanıtı (Content):", responseContent || "—");
  console.groupEnd();

  console.log("%c📊 3. Token & Performans Metrikleri:", "color: #7c3aed; font-weight: bold;", {
    Model: model,
    "Giriş Token (Prompt)": telemetry?.promptTokens ?? "—",
    "Çıkış Token (Completion)": telemetry?.completionTokens ?? "—",
    "Toplam Token": telemetry?.totalTokens ?? "—",
    "İşlem Süresi": durationStr,
    ...(telemetry?.error ? { "Hata / Uyarı": telemetry.error } : {}),
  });

  console.groupEnd();
}
