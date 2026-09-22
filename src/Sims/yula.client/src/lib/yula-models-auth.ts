import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { homedir } from "node:os";
import { parseModelsFile, type ModelsFile } from "@my-agent/core/server";
import { parseAuthData, type AuthData } from "@my-agent/core/server";

export function resolveModelsConfig(): ModelsFile | null {
  const candidates = [
    path.resolve(process.cwd(), "models.json"),
    path.resolve(process.cwd(), "src/Sims/yula.client/models.json"),
    path.join(homedir(), ".pi", "agent", "models.json"),
    path.join(homedir(), ".epic-volta", "models.json"),
  ];
  for (const c of candidates) {
    if (existsSync(c)) {
      try {
        return parseModelsFile(readFileSync(c, "utf-8"), c);
      } catch {}
    }
  }
  return null;
}

export function resolveAuthData(): AuthData {
  const candidates = [
    path.resolve(process.cwd(), "auth.json"),
    path.resolve(process.cwd(), "src/Sims/yula.client/auth.json"),
    path.join(homedir(), ".pi", "agent", "auth.json"),
    path.join(homedir(), ".epic-volta", "auth.json"),
  ];
  for (const c of candidates) {
    if (existsSync(c)) {
      try {
        return parseAuthData(readFileSync(c, "utf-8"), c);
      } catch {}
    }
  }
  return {};
}

export function getAuthKeyForProvider(provider: string): string {
  try {
    const authData = resolveAuthData();
    let cred = authData[provider] as { type?: string; key?: string; accessToken?: string; access?: string } | undefined;
    if (!cred) {
      if (provider === "agnes-ai") cred = authData["agnes"] as any;
      else if (provider === "agnes") cred = authData["agnes-ai"] as any;
    }
    if (cred?.key) return cred.key;
    if (cred?.accessToken) return cred.accessToken;
    if (cred?.access) return cred.access;
  } catch {}
  return "";
}

/** auth.json içinde kimlik bilgisi olan sağlayıcı listesi (ollama yerel olarak dahil edilir). */
export function getAvailableProviderIdsFromAuth(): string[] {
  const authData = resolveAuthData();
  const mConfig = resolveModelsConfig();
  const ids = Object.keys(authData);

  // Yerel ollama anahtarsız da çalışabilir
  if (!ids.includes("ollama")) {
    if (mConfig?.providers?.["ollama"] || process.env.OLLAMA_URL || process.env.OLLAMA_MODEL) {
      ids.push("ollama");
    }
  }

  // Env üzerinden tanımlı azure / openai desteği
  if (process.env.AZURE_OPENAI_API_KEY && !ids.includes("azure")) ids.unshift("azure");
  if (process.env.OPENAI_API_KEY && !ids.includes("openai")) ids.push("openai");

  return ids;
}
