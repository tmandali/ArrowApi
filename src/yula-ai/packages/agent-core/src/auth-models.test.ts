import { describe, expect, it } from 'vitest';
import { parseAuthData, resolveApiKey } from './auth';
import { parseModelsFile, getAvailableModels, resolveProviderAndModel } from './models-config';
import { telemetryTracker } from './telemetry-metrics';

describe('auth.json', () => {
  it('stored key çözer', () => {
    const data = parseAuthData(JSON.stringify({ 'agnes-ai': { type: 'api_key', key: 'sk-x' } }), 'auth.json');
    expect(resolveApiKey(data, 'agnes-ai').apiKey).toBe('sk-x');
  });
  it('override kazanır', () => {
    const data = parseAuthData(JSON.stringify({ 'agnes-ai': { type: 'api_key', key: 'sk-x' } }), 'auth.json');
    expect(resolveApiKey(data, 'agnes-ai', { apiKey: 'sk-y' })).toMatchObject({ apiKey: 'sk-y', source: 'override' });
  });
  it('eksik key throw eder (env fallback yok)', () => {
    const data = parseAuthData(JSON.stringify({}), 'auth.json');
    expect(() => resolveApiKey(data, 'agnes-ai')).toThrow('Anahtar yok');
  });
  it('bozuk JSON throw eder', () => {
    expect(() => parseAuthData('{bozuk', 'auth.json')).toThrow('Bozuk auth.json');
  });
  it('geçersiz girdi throw eder', () => {
    expect(() => parseAuthData(JSON.stringify({ 'agnes-ai': { type: 'oauth' } }), 'auth.json')).toThrow(
      'Geçersiz auth.json girdisi',
    );
  });
});

describe('models.json', () => {
  const valid = {
    defaultProvider: 'agnes-ai',
    defaultModel: 'agnes-2.5-flash',
    providers: {
      'agnes-ai': { baseUrl: 'https://apihub.agnes-ai.com/v1', models: [{ id: 'agnes-2.5-flash' }] },
    },
  };
  it('geçerli dosyayı parse eder', () => {
    expect(parseModelsFile(JSON.stringify(valid), 'models.json').defaultModel).toBe('agnes-2.5-flash');
  });
  it('models.json içindeki apiKey reddedilir', () => {
    const bad = { ...valid, providers: { 'agnes-ai': { apiKey: 'sk-x', models: [{ id: 'm' }] } } };
    expect(() => parseModelsFile(JSON.stringify(bad), 'models.json')).toThrow('apiKey');
  });
  it('bilinmeyen defaultProvider reddedilir', () => {
    expect(() => parseModelsFile(JSON.stringify({ ...valid, defaultProvider: 'yok' }), 'models.json')).toThrow(
      'defaultProvider',
    );
  });
  it('bilinmeyen defaultModel reddedilir', () => {
    expect(() => parseModelsFile(JSON.stringify({ ...valid, defaultModel: 'yok' }), 'models.json')).toThrow(
      'defaultModel',
    );
  });
  it('yorumlu JSONC parse edilir', () => {
    expect(parseModelsFile(`{ // yorum\n"a": 1 }`.replace('"a": 1', `"defaultProvider": "a", "defaultModel": "m", "providers": {"a": {"models": [{"id": "m"}]}}`), 'm')).toBeDefined();
  });
  it('Pi formatındaki models.json dosyasını sorunsuz parse eder (defaultProvider olmadan ve ek alanlarla)', () => {
    const piFormat = {
      providers: {
        'agnes-ai': {
          baseUrl: 'https://apihub.agnes-ai.com/v1',
          api: 'openai-completions',
          models: [
            { id: 'agnes-2.0-flash', name: 'Agnes 2.0 Flash', reasoning: true, contextWindow: 128000 },
            { id: 'agnes-2.5-flash', name: 'Agnes 2.5 Flash', reasoning: true }
          ]
        }
      }
    };
    const parsed = parseModelsFile(JSON.stringify(piFormat), 'models.json');
    expect(parsed.defaultProvider).toBe('agnes-ai');
    expect(parsed.defaultModel).toBe('agnes-2.0-flash');
    expect(parsed.providers['agnes-ai'].models[0].reasoning).toBe(true);
  });
  it('OAuth token ve agnes-ai <-> agnes alias desteğini doğrular', () => {
    const oauthData = parseAuthData(JSON.stringify({ 'agnes': { type: 'oauth', accessToken: 'tok-123' } }), 'auth.json');
    expect(resolveApiKey(oauthData, 'agnes-ai').apiKey).toBe('tok-123');
  });
  it('getAvailableModels sadece anahtarı olan sağlayıcıları available: true işaretler', () => {
    const config = parseModelsFile(JSON.stringify({
      defaultProvider: 'agnes-ai',
      defaultModel: 'agnes-3.0-flash',
      providers: {
        'agnes-ai': {
          models: [{ id: 'agnes-3.0-flash', cost: { input: 0.15, output: 0.60 } }],
        },
        'openrouter': {
          models: [{ id: 'claude-sonnet-4', cost: { input: 3.0, output: 15.0 } }],
        },
      },
    }), 'models.json');

    const auth = {
      'agnes-ai': { type: 'api_key', key: 'sk-real-valid-key-12345' },
      'openrouter': { type: 'api_key', key: 'sk-...' }, // dummy placeholder
    };

    const models = getAvailableModels(config, auth);
    expect(models).toHaveLength(2);
    const agnes = models.find((m) => m.id === 'agnes-3.0-flash');
    const claude = models.find((m) => m.id === 'claude-sonnet-4');

    expect(agnes?.available).toBe(true);
    expect(agnes?.cost).toEqual({ input: 0.15, output: 0.60 });
    expect(claude?.available).toBe(false);
  });
  it('resolveProviderAndModel istenen modeli ve fiyatlandırmasını doğru çözer', () => {
    const config = parseModelsFile(JSON.stringify({
      defaultProvider: 'agnes-ai',
      defaultModel: 'agnes-3.0-flash',
      providers: {
        'agnes-ai': {
          baseUrl: 'https://apihub.agnes-ai.com/v1',
          models: [{ id: 'agnes-3.0-flash', cost: { input: 0.15, output: 0.60 } }],
        },
      },
    }), 'models.json');

    const target = resolveProviderAndModel(config, 'agnes-ai', 'agnes-3.0-flash');
    expect(target.model).toBe('agnes-3.0-flash');
    expect(target.cost?.input).toBe(0.15);
    expect(target.cost?.output).toBe(0.60);
  });
});

describe('telemetryTracker dinamik fiyatlandırma', () => {
  it('modele özel fiyatla maliyet doğru hesaplar', () => {
    telemetryTracker.reset();
    telemetryTracker.startTurn();

    // 1,000,000 prompt token ($3) + 1,000,000 completion token ($15) = $18
    const metric = telemetryTracker.endTurn(1_000_000, 1_000_000, { input: 3.0, output: 15.0 });
    expect(metric.estimatedCostUsd).toBe(18);

    // setModelPricing ile varsayılanı değiştir
    telemetryTracker.setModelPricing(0.15, 0.60);
    telemetryTracker.startTurn();
    const m2 = telemetryTracker.endTurn(1_000_000, 1_000_000);
    expect(m2.estimatedCostUsd).toBe(0.75);
  });
});
