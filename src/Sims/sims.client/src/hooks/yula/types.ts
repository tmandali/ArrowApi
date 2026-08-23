/**
 * Yula AI köprüsünün paylaşılan tipleri.
 * (useAgentBridge.ts bu modülü re-export eder.)
 */

export interface ChatMessage {
  id: string;
  sender: "user" | "agent" | "system";
  content: string;
  timestamp: string;
  thinking?: string;
  toolDetails?: any;
  toolResult?: any;
  customKind?: string;
}

export interface ScreenContext {
  screenId: string;
  screenTitle: string;
  workspaceId?: string;
  activeReportScope?: string;
  activeDataSummary?: Record<string, any>;
  activeFilters?: Record<string, any>;
  quickPrompts?: string[];
  resultsPrompts?: string[];
}

export type ProcessStatus = "idle" | "starting" | "running" | "error" | "browser_fallback";

export interface AiProviderConfig {
  provider: "ollama" | "azure" | "google" | "openai";
  model: string;
  endpoint?: string;
  apiKey?: string;
  /** Düşünme derinliği — pydantic-ai birleşik thinking ayarı (sağlayıcıya göre çevrilir). */
  thinkingLevel?: "off" | "low" | "medium" | "high";
}

export interface ActiveReportMemory {
  scope: string;
  toolName: string;
  title?: string;
  kind?: string;
  workspace?: string;
  pagePath?: string;
}

/** Sidecar stdout satırından parse edilen olay (şema kasıtlı olarak esnek tutulur). */
export interface SidecarEvent {
  type?: string;
  requestId?: string;
  tool?: string;
  arguments?: Record<string, any>;
  message?: string;
  thinking?: string;
  content?: string;
  text?: string;
  delta_kind?: string;
  status?: string;
  argless?: boolean;
  telemetry?: {
    engine?: string;
    model?: string;
    systemPrompt?: string;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    durationMs?: number;
    confidence?: number;
    error?: string;
  };
  [key: string]: any;
}
