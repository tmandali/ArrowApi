import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import { getEpicDir, getPiDir } from './auth';

export function getModelsPath(): string {
  const epicPath = join(getEpicDir(), 'models.json');
  if (existsSync(epicPath)) return epicPath;
  const piPath = join(getPiDir(), 'models.json');
  if (existsSync(piPath)) return piPath;
  return epicPath;
}

export interface SettingsFile {
  defaultProvider?: string;
  defaultModel?: string;
  [key: string]: unknown;
}

export function loadSettingsFile(modelsPath?: string): SettingsFile | null {
  const candidates: string[] = [];
  if (modelsPath) {
    candidates.push(join(dirname(modelsPath), 'settings.json'));
  }
  candidates.push(join(getEpicDir(), 'settings.json'));
  candidates.push(join(getPiDir(), 'settings.json'));

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      try {
        const content = readFileSync(candidate, 'utf-8');
        const stripped = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
        return JSON.parse(stripJsonComments(stripped)) as SettingsFile;
      } catch {
        // yoksay ve sonrakini dene
      }
    }
  }
  return null;
}

const ModelEntrySchema = z
  .object({
    id: z.string().min(1),
    name: z.string().optional(),
    api: z.string().optional(),
    baseUrl: z.string().optional(),
    reasoning: z.boolean().optional(),
    contextWindow: z.number().optional(),
    maxTokens: z.number().optional(),
    cost: z.record(z.string(), z.unknown()).optional(),
    compat: z.record(z.string(), z.unknown()).optional(),
    headers: z.record(z.string(), z.string()).optional(),
    input: z.array(z.string()).optional(),
    thinkingLevelMap: z.record(z.string(), z.unknown()).optional(),
    samplingParams: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

const ProviderConfigSchema = z
  .object({
    name: z.string().optional(),
    baseUrl: z.string().min(1).optional(),
    api: z.string().optional(),
    headers: z.record(z.string(), z.string()).optional(),
    compat: z.record(z.string(), z.unknown()).optional(),
    authHeader: z.boolean().optional(),
    models: z.array(ModelEntrySchema).min(1),
    modelOverrides: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough()
  .superRefine((val, ctx) => {
    if ('apiKey' in (val as Record<string, unknown>)) {
      ctx.addIssue({
        code: 'custom',
        message: 'models.json içinde "apiKey" yasak — anahtarlar yalnızca auth.json içinde olur.',
      });
    }
  });

const ModelsFileSchema = z
  .object({
    defaultProvider: z.string().min(1).optional(),
    defaultModel: z.string().min(1).optional(),
    providers: z.record(z.string(), ProviderConfigSchema).refine((p) => Object.keys(p).length > 0, {
      message: 'providers boş olamaz.',
    }),
  })
  .passthrough();

export type ModelsFile = z.infer<typeof ModelsFileSchema> & {
  defaultProvider: string;
  defaultModel: string;
};
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

function stripJsonComments(content: string): string {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => {
      let inStr = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"' && line[i - 1] !== '\\') inStr = !inStr;
        if (!inStr && c === '/' && line[i + 1] === '/') return line.slice(0, i);
      }
      return line;
    })
    .join('\n');
}

export function parseModelsFile(content: string, path: string): ModelsFile {
  let parsed: unknown;
  try {
    const noBom = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
    parsed = JSON.parse(stripJsonComments(noBom));
  } catch (error) {
    throw new Error(`Bozuk models.json: ${path} (${error instanceof Error ? error.message : String(error)})`);
  }
  const result = ModelsFileSchema.safeParse(parsed);
  if (!result.success) {
    const details = result.error.issues.map((i) => `  - ${i.path.join('.') || 'root'}: ${i.message}`).join('\n');
    throw new Error(`Geçersiz models.json şeması:\n${details}\n\nDosya: ${path}`);
  }
  const config = result.data;
  const settings = loadSettingsFile(path);

  const defaultProvider =
    config.defaultProvider ??
    (settings?.defaultProvider && config.providers[settings.defaultProvider] ? settings.defaultProvider : undefined) ??
    Object.keys(config.providers)[0];

  const provider = config.providers[defaultProvider];
  if (!provider) {
    throw new Error(`Geçersiz models.json: defaultProvider "${defaultProvider}" providers içinde yok: ${path}`);
  }

  const defaultModel =
    config.defaultModel ??
    (settings?.defaultModel && provider.models.some((m) => m.id === settings.defaultModel)
      ? settings.defaultModel
      : undefined) ??
    provider.models[0]?.id;

  if (!provider.models.some((m) => m.id === defaultModel)) {
    throw new Error(
      `Geçersiz models.json: defaultModel "${defaultModel}" "${defaultProvider}" içinde yok: ${path}`,
    );
  }

  return {
    ...config,
    defaultProvider,
    defaultModel,
  };
}

export function loadModelsFile(modelsPath: string = getModelsPath()): ModelsFile {
  if (!existsSync(modelsPath)) {
    throw new Error(`models.json bulunamadı: ${modelsPath} — örnek için models.example.json dosyasına bakın.`);
  }
  return parseModelsFile(readFileSync(modelsPath, 'utf-8'), modelsPath);
}

export interface ResolvedProvider {
  providerId: string;
  model: string;
  baseUrl?: string;
}

export function resolveDefaultProvider(config: ModelsFile): ResolvedProvider {
  const provider = config.providers[config.defaultProvider];
  return {
    providerId: config.defaultProvider,
    model: config.defaultModel,
    baseUrl: provider?.baseUrl,
  };
}

export interface AvailableModelInfo {
  id: string;
  name: string;
  providerId: string;
  providerName: string;
  available: boolean;
  hasKey: boolean;
  isDefault: boolean;
  reasoning?: boolean;
  contextWindow?: number;
  maxTokens?: number;
  cost?: {
    input: number;
    output: number;
  };
}

export function getAvailableModels(modelsConfig: ModelsFile, authData: Record<string, unknown>): AvailableModelInfo[] {
  const result: AvailableModelInfo[] = [];

  for (const [providerId, provider] of Object.entries(modelsConfig.providers)) {
    // Check credentials for provider or alias
    let cred = authData[providerId] as { type?: string; key?: string; accessToken?: string } | undefined;
    if (!cred) {
      if (providerId === 'agnes-ai') cred = authData['agnes'] as any;
      else if (providerId === 'agnes') cred = authData['agnes-ai'] as any;
    }

    const hasKey = Boolean(
      cred &&
        (cred.type === 'oauth'
          ? Boolean(cred.accessToken && cred.accessToken.length > 0)
          : Boolean(cred.key && !cred.key.includes('...') && cred.key.length > 5)),
    );

    for (const m of provider.models) {
      const isDefault = providerId === modelsConfig.defaultProvider && m.id === modelsConfig.defaultModel;
      let cost: { input: number; output: number } | undefined;
      if (m.cost && typeof m.cost === 'object' && 'input' in m.cost && 'output' in m.cost) {
        cost = {
          input: Number((m.cost as Record<string, unknown>).input) || 0,
          output: Number((m.cost as Record<string, unknown>).output) || 0,
        };
      }

      result.push({
        id: m.id,
        name: m.name || m.id,
        providerId,
        providerName: provider.name || providerId,
        available: hasKey,
        hasKey,
        isDefault,
        reasoning: m.reasoning,
        contextWindow: m.contextWindow,
        maxTokens: m.maxTokens,
        cost,
      });
    }
  }

  return result;
}

export interface ResolvedModelTarget {
  providerId: string;
  providerName?: string;
  model: string;
  modelName?: string;
  baseUrl?: string;
  cost?: {
    input: number;
    output: number;
  };
}

export function resolveProviderAndModel(
  config: ModelsFile,
  requestedProviderId?: string,
  requestedModelId?: string,
): ResolvedModelTarget {
  let providerId = requestedProviderId;
  let modelId = requestedModelId;

  // If only modelId is requested, find which provider has it
  if (!providerId && modelId) {
    for (const [pId, p] of Object.entries(config.providers)) {
      if (p.models.some((m) => m.id === modelId)) {
        providerId = pId;
        break;
      }
    }
  }

  // If still no providerId, fall back to defaultProvider
  if (!providerId || !config.providers[providerId]) {
    providerId = config.defaultProvider;
  }

  const provider = config.providers[providerId];
  if (!provider) {
    throw new Error(`Sağlayıcı bulunamadı: ${providerId}`);
  }

  // If modelId is not in provider, fall back to default or first
  let modelEntry = provider.models.find((m) => m.id === modelId);
  if (!modelEntry) {
    if (providerId === config.defaultProvider) {
      modelEntry = provider.models.find((m) => m.id === config.defaultModel);
    }
    if (!modelEntry) {
      modelEntry = provider.models[0];
    }
  }

  if (!modelEntry) {
    throw new Error(`Sağlayıcı "${providerId}" altında geçerli model bulunamadı.`);
  }

  let cost: { input: number; output: number } | undefined;
  if (
    modelEntry.cost &&
    typeof modelEntry.cost === 'object' &&
    'input' in modelEntry.cost &&
    'output' in modelEntry.cost
  ) {
    cost = {
      input: Number((modelEntry.cost as Record<string, unknown>).input) || 0,
      output: Number((modelEntry.cost as Record<string, unknown>).output) || 0,
    };
  }

  return {
    providerId,
    providerName: provider.name || providerId,
    model: modelEntry.id,
    modelName: modelEntry.name || modelEntry.id,
    baseUrl: provider.baseUrl,
    cost,
  };
}

