/**
 * Kullanıcı tanımlı ajanlar (persona) — saf çekirdek.
 * Rehber karşılığı (cookbook Step 5/6): ajan = model-dışı kimlik katmanı;
 * talimat + araç erişimi + skill envanteri. Yürütme mevcut sohbet hattında
 * olur (route: LEVEL 0 persona + prepareStep kesişimi); bu modül yalnızca
 * veri + saf kuralları taşır. Store `lib/stores/user-agents.ts` içindedir.
 */
export interface UserAgent {
  id: string;
  name: string;
  description: string;
  /** Sistem promptuna eklenen persona talimatları */
  instructions: string;
  /**
   * Araç allowlist — BOŞ = tüm araçlar. "grid-tools" jetonu dinamik grid
   * araç grubunu açar; diğer girdiler statik araç adlarıdır.
   */
  tools: string[];
  /**
   * Skill daraltma — BOŞ = kapsamdaki tüm skill'ler. Doluysa envanter bu
   * slash listesine iner (önsiz adlar).
   */
  skills: string[];
  /** Kapsam: "global" (her yerde) veya workspace id. */
  scope?: string;
  /**
   * Çıkarım kimliği — boş = genel ayar. provider + model çift tutulur
   * (seçicide de kupliler; tek başına model/provider geçersiz eşleşmeye düşer).
   */
  provider?: string;
  model?: string;
  createdAt: number;
  updatedAt: number;
}

/** Ajan formundaki sağlayıcı seçenekleri (boş = genel ayar) */
export const AGENT_PROVIDER_OPTIONS: Array<{ id: string; label: string }> = [
  { id: "", label: "Genel ayar" },
  { id: "azure", label: "Azure Foundry" },
  { id: "ollama", label: "Ollama (yerel)" },
  { id: "openai", label: "OpenAI" },
];

/** Dinamik grid araç grubunu temsil eden jeton */
export const GRID_TOOLS_TOKEN = "grid-tools";

/** Ajan formundaki araç çoklu-seçimi için katalog (statik araçlar + grup jetonu) */
export const AGENT_TOOL_CATALOG: Array<{ name: string; label: string }> = [
  { name: "run_job", label: "Rapor çalıştırma" },
  { name: "apply_criteria", label: "Kriter uygulama" },
  { name: "find_matching_report", label: "Mevcut rapor arama" },
  { name: "open_last_report", label: "Son raporu açma" },
  { name: "list_report_executions", label: "Çalışma geçmişi" },
  { name: "cancel_job", label: "İşi iptal etme" },
  { name: "navigate_to_page", label: "Sayfa gezinmesi" },
  { name: "get_report_schema", label: "Şema okuma" },
  { name: "validate_criteria_input", label: "Kriter doğrulama" },
  { name: "get_current_criteria", label: "Form okuma" },
  { name: "ask_user_question", label: "Kullanıcıya soru sorma" },
  { name: "request_user_confirmation", label: "Onay isteme" },
  { name: "run_user_skill", label: "Skill çalıştırma" },
  { name: "run_skill_script", label: "Skill betiği" },
  { name: "read_skill_file", label: "Skill dosyası okuma" },
  { name: GRID_TOOLS_TOKEN, label: "Grid araçları (tablo/SQL/grafik)" },
];

/** Editor validasyonu — saf. */
export function validateUserAgent(
  draft: { name: string; instructions: string },
  takenNames: string[],
): string | null {
  const name = draft.name.trim();
  if (!name) return "Ajan adı boş olamaz (örn: Muhasebe Uzmanı).";
  if (
    takenNames.map((n) => n.toLowerCase()).includes(name.toLowerCase())
  ) {
    return `"${name}" zaten kullanımda — başka bir ad seçin.`;
  }
  if (!draft.instructions.trim())
    return "Persona talimatı boş olamaz — ajanın nasıl davranacağını yazın.";
  return null;
}

/** Kapsam filtresi — saf. */
export function filterAgentsByScope(
  agents: UserAgent[],
  workspaceId?: string | null,
): UserAgent[] {
  return agents.filter((a) => {
    const scope = a.scope ?? "global";
    if (scope === "global") return true;
    return !!workspaceId && scope === workspaceId;
  });
}

/**
 * prepareStep kesişimi — saf. Boş allowlist = tüm faz araçları.
 * "grid-tools" jetonu, fazın dinamik grid araçlarını topluca açar.
 */
export function filterActiveToolsByAgent(
  phaseTools: string[],
  gridToolNames: string[],
  agentTools: string[] | undefined,
): string[] {
  if (!agentTools || agentTools.length === 0) return phaseTools;
  const allowed = new Set(agentTools);
  const grid = new Set(gridToolNames);
  return phaseTools.filter(
    (t) =>
      allowed.has(t) ||
      (grid.has(t) && allowed.has(GRID_TOOLS_TOKEN)),
  );
}
