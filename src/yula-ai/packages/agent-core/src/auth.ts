import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import type { OAuthCredential } from './oauth/types';

export interface ApiKeyCredential {
  type: 'api_key';
  key?: string;
  env?: Record<string, string>;
}

export type { OAuthCredential };

export type Credential = ApiKeyCredential | OAuthCredential;

export type AuthData = Record<string, Credential>;

export function getEpicDir(): string {
  return join(homedir(), '.epic-volta');
}

export function getPiDir(): string {
  return join(homedir(), '.pi', 'agent');
}

export function getAuthPath(): string {
  const epicPath = join(getEpicDir(), 'auth.json');
  if (existsSync(epicPath)) return epicPath;
  const piPath = join(getPiDir(), 'auth.json');
  if (existsSync(piPath)) return piPath;
  return epicPath;
}

function isCredential(value: unknown): value is Credential {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v.type === 'api_key') {
    return v.key === undefined || typeof v.key === 'string';
  }
  if (v.type === 'oauth') {
    return (
      (typeof v.accessToken === 'string' && v.accessToken.length > 0) ||
      (typeof v.refreshToken === 'string' && v.refreshToken.length > 0) ||
      (typeof v.access === 'string' && v.access.length > 0) ||
      (typeof v.refresh === 'string' && v.refresh.length > 0)
    );
  }
  return false;
}

export function parseAuthData(content: string, path: string): AuthData {
  let parsed: unknown;
  try {
    const stripped = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
    parsed = JSON.parse(stripped);
  } catch (error) {
    throw new Error(`Bozuk auth.json: ${path} (${error instanceof Error ? error.message : String(error)})`);
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`Geçersiz auth.json: nesne bekleniyor: ${path}`);
  }
  const data = parsed as Record<string, unknown>;
  for (const [providerId, cred] of Object.entries(data)) {
    if (!isCredential(cred)) {
      throw new Error(`Geçersiz auth.json girdisi "${providerId}": { "type": "api_key", "key": "..." } bekleniyor: ${path}`);
    }
  }
  return data as AuthData;
}

export function loadAuthFile(authPath: string = getAuthPath()): AuthData {
  if (!existsSync(authPath)) {
    throw new Error(`auth.json bulunamadı: ${authPath} — örnek için auth.example.json dosyasına bakın.`);
  }
  return parseAuthData(readFileSync(authPath, 'utf-8'), authPath);
}

export function saveAuthFile(data: AuthData, authPath: string = getAuthPath()): void {
  mkdirSync(dirname(authPath), { recursive: true });
  writeFileSync(authPath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  try {
    chmodSync(authPath, 0o600);
  } catch {
    // Windows'ta chmod yok — sessiz geç.
  }
}

export interface ResolvedAuth {
  apiKey: string;
  source: string;
}

export function resolveApiKey(
  data: AuthData,
  providerId: string,
  opts?: { apiKey?: string; authPath?: string },
): ResolvedAuth {
  if (opts?.apiKey) return { apiKey: opts.apiKey, source: 'override' };

  let stored = data[providerId];
  if (!stored) {
    if (providerId === 'agnes-ai') stored = data['agnes'];
    else if (providerId === 'agnes') stored = data['agnes-ai'];
  }

  if (stored?.type === 'api_key' && stored.key) {
    return { apiKey: stored.key, source: opts?.authPath ?? getAuthPath() };
  }
  const token = stored?.type === 'oauth' ? stored.accessToken || (stored as any).access : undefined;
  if (token) {
    return { apiKey: token, source: opts?.authPath ?? getAuthPath() };
  }
  throw new Error(
    `Anahtar yok: "${providerId}" için auth.json içinde key bulunamadı (${opts?.authPath ?? getAuthPath()}).`,
  );
}
