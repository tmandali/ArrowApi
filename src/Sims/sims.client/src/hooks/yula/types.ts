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
  /** Kriter-formu ekranları: JSON Schema alan sindirimi (başlık/açıklama/enum) */
  criteriaDigest?: Array<Record<string, unknown>>;
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

/** Skill'in SKILL.md frontmatter'ındaki bildirimsel UI bağları. */
export interface SkillHeaderButton {
  id: string;
  label: string;
  /** Kapalı lucide ikon adları: plus | trash | download | upload | refresh | play */
  icon?: string;
  /** Tetiklenecek TOOL adı (skill fonksiyonu). */
  call: string;
  args?: Record<string, any>;
  scope?: {
    workspaces?: string[];
    /** screenId öneki; "report-grid-*" gibi yıldızlı eşleşme */
    screens?: string[];
  };
}

export interface SkillUi {
  header_buttons?: SkillHeaderButton[];
}

/** Sidecar skill fonksiyonu (skills/<klasör>/SKILL.md + *.py sözleşmesi). */
export interface SkillFunctionInfo {
  name: string;
  description: string;
  /** true → verisini frontend'ten alır (bridge_call); false → agent içinde çalışır */
  needs_session_data: boolean;
}

/** Yula skill klasörü. */
export interface SkillInfo {
  folder: string;
  recipe_md?: string | null;
  ui?: SkillUi;
  functions: SkillFunctionInfo[];
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
