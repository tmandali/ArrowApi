/**
 * OpenRouter OAuth PKCE flow.
 * Ported from @earendil-works/pi-ai.
 */

import { generatePKCE } from '../pkce';
import { OAuthCredential, OAuthExchangeOptions, OAuthProvider, OAuthStartResult } from '../types';

const AUTHORIZE_URL = 'https://openrouter.ai/auth';
const TOKEN_URL = 'https://openrouter.ai/api/v1/auth/keys';

export class OpenRouterOAuthProvider implements OAuthProvider {
  readonly id = 'openrouter';
  readonly name = 'OpenRouter';

  async startLogin(redirectUri?: string): Promise<OAuthStartResult> {
    const { verifier, challenge } = await generatePKCE();
    const url = new URL(AUTHORIZE_URL);

    if (redirectUri) {
      url.searchParams.set('callback_url', redirectUri);
    }
    url.searchParams.set('code_challenge', challenge);
    url.searchParams.set('code_challenge_method', 'S256');

    return {
      type: 'auth_url',
      info: {
        url: url.toString(),
        instructions: 'Tarayıcıda açılan OpenRouter sayfasından izin verin ve yetkilendirme kodunu onaylayın.',
        verifier,
      },
    };
  }

  async exchangeCode(options: OAuthExchangeOptions): Promise<OAuthCredential> {
    const { code, verifier, signal } = options;
    if (!verifier) {
      throw new Error('OpenRouter OAuth takası için code_verifier zorunludur.');
    }

    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        code,
        code_verifier: verifier,
        code_challenge_method: 'S256',
      }),
      signal,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenRouter OAuth kod takası başarısız (HTTP ${response.status}): ${errText}`);
    }

    const data = (await response.json()) as { key?: string };
    if (!data.key || typeof data.key !== 'string') {
      throw new Error('OpenRouter API beklenen API anahtarını döndürmedi.');
    }

    return {
      type: 'oauth',
      accessToken: data.key,
      access: data.key,
      expiresAt: Number.MAX_SAFE_INTEGER, // OpenRouter generates a persistent API key
      expires: Number.MAX_SAFE_INTEGER,
    };
  }
}
