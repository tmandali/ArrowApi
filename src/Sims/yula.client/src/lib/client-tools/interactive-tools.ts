import { useUserSkillsStore } from "@/lib/stores/user-skills";
import { BUILT_IN_USER_SKILLS } from "@/lib/built-in-skills";
import { buildUserSkillPrompt } from "@/lib/yula-user-skill";

/**
 * Etkileşimli / skill araçları — soru kartı, öneri çipleri ve kullanıcı
 * skill'leri. Davranış `yula-client-tools.ts` ile birebirdir.
 */

/**
 * @deprecated Use `@my-agent/core` standard `ask_user_choice` tool instead for inline HITL choice cards.
 * Retained for backward compatibility with external callers.
 */
export async function askUserQuestionTool(
  args: Record<string, unknown>,
): Promise<unknown> {
  const raw = (args as { questions?: unknown }).questions;
  const questions = Array.isArray(raw) ? raw.slice(0, 3) : [];
  return {
    status: "awaiting_user",
    questions,
    message: "Questions presented to the user. Prefer ask_user_choice for modern inline HITL selection.",
  };
}

export async function suggestNextStepsTool(
  args: Record<string, unknown>,
): Promise<unknown> {
  // Yapılandırılmış öneri çipleri: şekil bozukları elenir (en fazla 10).
  // Kart girdiden basılır (çıktı yalnız sunum onayıdır).
  const { asSuggestions } = await import("@/lib/yula-suggestions");
  const suggestions = asSuggestions(args);
  return {
    status: "presented",
    count: suggestions.length,
    message: "Suggestions presented to the user as clickable chips. Finding/analysis clicks arrive as a new user message; report/navigation clicks navigate in-app.",
  };
}

export async function runUserSkillTool(
  args: Record<string, unknown>,
): Promise<unknown> {
  const slash = String(
    (args as { skill?: unknown }).skill ?? "",
  ).toLowerCase();
  const skill = [
    ...useUserSkillsStore.getState().skills,
    ...BUILT_IN_USER_SKILLS,
  ].find((s) => s.slash.toLowerCase() === slash);
  if (!skill) {
    return {
      status: "not-found",
      message: `Skill '/${slash}' not found on this device. Use only the USER SKILLS listed in the system prompt.`,
    };
  }
  const prompt = buildUserSkillPrompt(
    skill,
    String((args as { input?: unknown }).input ?? ""),
  );
  const files = (skill.files ?? []).map((f) => ({
    name: f.name,
    chars: f.content.length,
  }));
  return {
    status: "loaded",
    skill: skill.slash,
    prompt,
    ...(files.length > 0 ? { files } : {}),
    message:
      files.length > 0
        ? `Skill '/${skill.slash}' instructions loaded (${files.length} attached file(s): ${files.map((f) => f.name).join(", ")} — read with read_user_file when referenced). Follow them with your tools.`
        : `Skill '/${skill.slash}' instructions loaded. Follow them with your tools.`,
  };
}

export async function readUserFileTool(
  args: Record<string, unknown>,
): Promise<unknown> {
  const slash = String(
    (args as { skill?: unknown }).skill ?? "",
  ).toLowerCase();
  const name = String((args as { file?: unknown }).file ?? "").toLowerCase();
  const skill = [
    ...useUserSkillsStore.getState().skills,
    ...BUILT_IN_USER_SKILLS,
  ].find((s) => s.slash.toLowerCase() === slash);
  // Kullanıcı ekli dosyalar burada okunur (skill.files).
  const file = skill?.files?.find((f) => f.name.toLowerCase() === name);
  if (!skill || !file) {
    return {
      status: "not-found",
      message: `File '${(args as { file?: unknown }).file ?? ""}' not found in skill '/${slash}'.`,
    };
  }
  return {
    status: "ok",
    skill: skill.slash,
    file: file.name,
    content: file.content,
    message: `File '${file.name}' loaded (${file.content.length} chars).`,
  };
}
