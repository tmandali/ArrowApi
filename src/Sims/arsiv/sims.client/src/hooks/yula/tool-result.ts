/**
 * Sidecar tool_call'ı yürütüldükten sonra kullanıcıya gösterilecek mesajı ve
 * düşünme zincirini oluşturur: çapraz-workspace uyarısı + desteklenmeyen kriter
 * rehberliği + deterministik sonuç mesajı öncelik zinciri.
 */
import { detectUnsupportedCriteriaGuidance } from "@/lib/generic-nlp-resolver";
import { toolRegistry } from "@/lib/tool-registry";
import type { ScreenContext, SidecarEvent } from "./types";

const WORKSPACE_TITLE_MAP: Record<string, string> = {
  stock: "Stok (Stock)",
  accounting: "Finans & Muhasebe (Accounting)",
  selling: "Satış & Subcontracting (Selling)",
  subcontracting: "Satış & Subcontracting (Selling)",
  manufacturing: "Üretim (Manufacturing)",
};

export interface ToolResultComposition {
  messageText: string;
  /** Deterministik mesajla ezilen LLM plan metni — düşünme bloğunda korunur. */
  llmReasoning?: string;
  targetWorkspace?: string;
}

export function composeToolResultMessage(params: {
  evt: SidecarEvent;
  toolName: string;
  executionResult: any;
  lastPrompt: string;
  currentWorkspace?: string;
}): ToolResultComposition {
  const { evt, toolName, executionResult, lastPrompt, currentWorkspace } = params;

  const customKind = executionResult?.customKind;
  const toolDef = toolRegistry.get(toolName);
  const guidance = detectUnsupportedCriteriaGuidance(lastPrompt, toolDef);

  const targetWorkspace =
    executionResult?.workspace || (toolDef?.scope?.type === "workspace" ? toolDef.scope.id : undefined);

  let crossWorkspaceNotice = "";
  if (
    targetWorkspace &&
    currentWorkspace &&
    targetWorkspace !== currentWorkspace &&
    targetWorkspace !== "reports" &&
    toolDef?.scope?.type === "workspace"
  ) {
    const targetTitle = WORKSPACE_TITLE_MAP[targetWorkspace] || targetWorkspace;
    crossWorkspaceNotice = `💡 **Bilgi:** Bu rapor **${targetTitle}** çalışma alanı altında yer almaktadır. Kriterleriniz hazırlandı.\n\n`;
  }

  const crossNotice = crossWorkspaceNotice.trim();
  const guideNotice = guidance ? guidance.trim() : "";

  let messageText = "";
  if (crossNotice && guideNotice) {
    messageText = `${crossNotice}\n\n${guideNotice}`;
  } else if (crossNotice) {
    messageText = crossNotice;
  } else if (guideNotice) {
    messageText = guideNotice;
  } else if (executionResult?.message) {
    messageText = executionResult.message;
  } else if (!customKind) {
    messageText = evt.message || `✓ "${toolName}" başarıyla uygulandı.`;
  }

  // Model düşünme zinciri + deterministik mesajla değişen LLM plan metni kaybolmasın
  const sidecarMsg = (evt.message || "").trim();
  const sidecarUsedAsContent = sidecarMsg.length > 0 && messageText === sidecarMsg;
  const llmReasoning = [
    typeof evt.thinking === "string" ? evt.thinking.trim() : "",
    sidecarMsg && !sidecarUsedAsContent ? sidecarMsg : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  // Son çare: Rapor kartı (customKind) görünüyorsa ek satır gereksiz — kart yeterli.
  // Kartsız araçlarda ise boş baloncuk yerine nötr onay gösterilir.
  if (!messageText && !customKind) {
    messageText = evt.message || "✓ Uygulandı.";
  }

  return {
    messageText,
    llmReasoning: llmReasoning || undefined,
    targetWorkspace,
  };
}

/** Aktif ekran bağlamını döner (log/hydration için). */
export function currentScreenOf(screenContext: ScreenContext | null): ScreenContext | null {
  return screenContext;
}
