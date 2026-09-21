import { useUserSkillsStore } from "@/lib/stores/user-skills";
import { BUILT_IN_USER_SKILLS } from "@/lib/built-in-skills";
import { buildUserSkillPrompt } from "@/lib/yula-user-skill";

/**
 * Kullanıcı cihaz-içi skill araçları.
 */

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
