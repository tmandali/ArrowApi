import { describe, expect, it, vi } from 'vitest';
import { generatePKCE } from './oauth/pkce';
import { pollOAuthDeviceCodeFlow } from './oauth/device-code';
import { oauthManager } from './oauth/oauth-manager';
import { OpenRouterOAuthProvider } from './oauth/providers/openrouter';
import { AnthropicOAuthProvider } from './oauth/providers/anthropic';

describe('OAuth PKCE (Web Crypto)', () => {
  it('generatePKCE geçerli verifier ve challenge üretir', async () => {
    const pkce1 = await generatePKCE();
    const pkce2 = await generatePKCE();

    expect(pkce1.verifier).toBeDefined();
    expect(pkce1.challenge).toBeDefined();
    expect(pkce1.verifier.length).toBeGreaterThan(30);
    expect(pkce1.challenge.length).toBeGreaterThan(30);

    // Her çağrı rastgele ve özgün olmalı
    expect(pkce1.verifier).not.toBe(pkce2.verifier);
    expect(pkce1.challenge).not.toBe(pkce2.challenge);
  });
});

describe('Device Code Polling (RFC 8628)', () => {
  it('complete durumunda değeri başarıyla döner', async () => {
    let callCount = 0;
    const result = await pollOAuthDeviceCodeFlow<string>({
      expiresInSeconds: 10,
      intervalSeconds: 0.05,
      poll: async () => {
        callCount++;
        if (callCount < 2) return { status: 'pending' };
        return { status: 'complete', value: 'gh-token-123' };
      },
    });

    expect(result).toBe('gh-token-123');
    expect(callCount).toBe(2);
  });

  it('slow_down yanıtında aralığı artırır ve devam eder', async () => {
    let callCount = 0;
    const result = await pollOAuthDeviceCodeFlow<string>({
      expiresInSeconds: 10,
      intervalSeconds: 0.02,
      poll: async () => {
        callCount++;
        if (callCount === 1) return { status: 'slow_down', intervalSeconds: 0.05 };
        return { status: 'complete', value: 'token-after-slowdown' };
      },
    });

    expect(result).toBe('token-after-slowdown');
    expect(callCount).toBe(2);
  });

  it('failed durumunda hata fırlatır', async () => {
    await expect(
      pollOAuthDeviceCodeFlow<string>({
        expiresInSeconds: 5,
        intervalSeconds: 0.05,
        poll: async () => ({ status: 'failed', message: 'Erişim reddedildi' }),
      }),
    ).rejects.toThrow('Erişim reddedildi');
  });

  it('AbortSignal iptal edildiğinde erken çıkar', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      pollOAuthDeviceCodeFlow<string>({
        expiresInSeconds: 10,
        intervalSeconds: 0.05,
        signal: controller.signal,
        poll: async () => ({ status: 'pending' }),
      }),
    ).rejects.toThrow('Login cancelled');
  });
});

describe('OAuthManager & Sağlayıcılar', () => {
  it('desteklenen sağlayıcıları listeler', () => {
    const list = oauthManager.listProviders();
    expect(list.map((p) => p.id)).toEqual(
      expect.arrayContaining(['openrouter', 'github-copilot', 'anthropic']),
    );
  });

  it('OpenRouter startLogin S256 PKCE parametreli auth_url döner', async () => {
    const openrouter = new OpenRouterOAuthProvider();
    const result = await openrouter.startLogin('http://localhost:3000/callback');

    expect(result.type).toBe('auth_url');
    if (result.type === 'auth_url') {
      expect(result.info.url).toContain('https://openrouter.ai/auth');
      expect(result.info.url).toContain('code_challenge=');
      expect(result.info.url).toContain('code_challenge_method=S256');
      expect(result.info.verifier).toBeDefined();
    }
  });

  it('Anthropic startLogin geçerli URL ve state döner', async () => {
    const anthropic = new AnthropicOAuthProvider();
    const result = await anthropic.startLogin('http://localhost:53692/callback');

    expect(result.type).toBe('auth_url');
    if (result.type === 'auth_url') {
      expect(result.info.url).toContain('https://claude.ai/oauth/authorize');
      expect(result.info.url).toContain('response_type=code');
      expect(result.info.url).toContain('code_challenge=');
      expect(result.info.state).toBeDefined();
    }
  });

  it('isExpiringSoon 5 dakika altı süreleri doğru tespit eder', () => {
    // 3 dakika sonra bitecek (expiring soon: true)
    const soon = {
      type: 'oauth' as const,
      accessToken: 'tok',
      expiresAt: Date.now() + 3 * 60 * 1000,
    };
    expect(oauthManager.isExpiringSoon(soon)).toBe(true);

    // 20 dakika sonra bitecek (expiring soon: false)
    const later = {
      type: 'oauth' as const,
      accessToken: 'tok',
      expiresAt: Date.now() + 20 * 60 * 1000,
    };
    expect(oauthManager.isExpiringSoon(later)).toBe(false);

    // Kalıcı anahtar (sonsuz: false)
    const persistent = {
      type: 'oauth' as const,
      accessToken: 'tok',
      expiresAt: Number.MAX_SAFE_INTEGER,
    };
    expect(oauthManager.isExpiringSoon(persistent)).toBe(false);
  });
});
