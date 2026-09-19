export interface ModelPricing {
  modelId: string;
  provider: 'openai' | 'anthropic' | 'google' | 'groq' | 'mistral';
  name: string;
  inputPerMillionUsd: number;
  outputPerMillionUsd: number;
  maxContextTokens: number;
  supportsVision: boolean;
  supportsTools: boolean;
}

export const MODEL_CATALOG: Record<string, ModelPricing> = {
  'gpt-4o': {
    modelId: 'gpt-4o',
    provider: 'openai',
    name: 'OpenAI GPT-4o',
    inputPerMillionUsd: 2.5,
    outputPerMillionUsd: 10.0,
    maxContextTokens: 128000,
    supportsVision: true,
    supportsTools: true,
  },
  'gpt-4o-mini': {
    modelId: 'gpt-4o-mini',
    provider: 'openai',
    name: 'OpenAI GPT-4o Mini',
    inputPerMillionUsd: 0.15,
    outputPerMillionUsd: 0.6,
    maxContextTokens: 128000,
    supportsVision: true,
    supportsTools: true,
  },
  'claude-3-5-sonnet': {
    modelId: 'claude-3-5-sonnet',
    provider: 'anthropic',
    name: 'Claude 3.5 Sonnet',
    inputPerMillionUsd: 3.0,
    outputPerMillionUsd: 15.0,
    maxContextTokens: 200000,
    supportsVision: true,
    supportsTools: true,
  },
  'gemini-1.5-pro': {
    modelId: 'gemini-1.5-pro',
    provider: 'google',
    name: 'Google Gemini 1.5 Pro',
    inputPerMillionUsd: 1.25,
    outputPerMillionUsd: 5.0,
    maxContextTokens: 2000000,
    supportsVision: true,
    supportsTools: true,
  },
  'gemini-1.5-flash': {
    modelId: 'gemini-1.5-flash',
    provider: 'google',
    name: 'Google Gemini 1.5 Flash',
    inputPerMillionUsd: 0.075,
    outputPerMillionUsd: 0.3,
    maxContextTokens: 1000000,
    supportsVision: true,
    supportsTools: true,
  },
};

export class ModelCatalogManager {
  private customModels: Map<string, ModelPricing> = new Map();

  getModel(modelId: string): ModelPricing {
    return this.customModels.get(modelId) || MODEL_CATALOG[modelId] || MODEL_CATALOG['gpt-4o-mini'];
  }

  calculateCost(modelId: string, inputTokens: number, outputTokens: number): {
    inputCostUsd: number;
    outputCostUsd: number;
    totalCostUsd: number;
    formatted: string;
  } {
    const model = this.getModel(modelId);
    const inputCost = (inputTokens / 1_000_000) * model.inputPerMillionUsd;
    const outputCost = (outputTokens / 1_000_000) * model.outputPerMillionUsd;
    const total = inputCost + outputCost;

    return {
      inputCostUsd: inputCost,
      outputCostUsd: outputCost,
      totalCostUsd: total,
      formatted: `$${total.toFixed(6)}`,
    };
  }

  registerCustomModel(pricing: ModelPricing): void {
    this.customModels.set(pricing.modelId, pricing);
  }

  getAllModels(): ModelPricing[] {
    return [...Object.values(MODEL_CATALOG), ...Array.from(this.customModels.values())];
  }
}

export const modelCatalog = new ModelCatalogManager();
