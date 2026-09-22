/**
 * Anthropic Claude OAuth flow.
 * Ported from @earendil-works/pi-ai.
 */

import { generatePKCE } from '../pkce';
import { OAuthCredential, OAuthExchangeOptions, OAuthProvider, OAuthStartResult } from '../types';

const CLIENT_ID = atob('OWQxYzI1MGEtZTYxYi00NGQ5LTg4ZWQtNTk0NGQxOTYyZjVl');
const AUTHORIZE_URL = 'https://claude.ai/oauth/authorize';
const TOKEN_URL = 'https://platform.claude.com/v1/oauth/token';
const SCOPES = 'org:create_api_key user:profile user:inference user:sessions:claude_code user:mcp_servers user:file_upload';

export class AnthropicOAuthProvider implements OAuthProvider {
  readonly id = 'anthropic';
  readonly name = 'Anthropic Claude';
  readonly isSubscription = true;

  async startLogin(redirectUri: string = 'http://localhost:53692/callback'): Promise<OAuthStartResult> {
    const { verifier, challenge } = await generatePKCE();
    const state = Math.random().toString(36).slice(2);

    const url = new URL(AUTHORIZE_URL);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', CLIENT_ID);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('scope', SCOPES);
    url.searchParams.set('code_challenge', challenge);
    url.searchParams.set('code_challenge_method', 'S256');
    url.searchParams.set('state', state);

    return {
      type: 'auth_url',
      info: {
        url: url.toString(),
        instructions: 'Claude yetkilendirme sayfasını açın ve onaylayıp yönlendirme linkini/kodunu alın.',
        verifier,
        state,
      },
    };
  }

  async exchangeCode(options: OAuthExchangeOptions): Promise<OAuthCredential> {
    const { code, verifier, redirectUri = 'http://localhost:53692/callback', signal } = options;
    if (!verifier) {
      throw new Error('Anthropic OAuth kod takası için code_verifier zorunludur.');
    }

    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: CLIENT_ID,
        code,
        redirect_uri: redirectUri,
        code_verifier: verifier,
      }),
      signal,
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Anthropic OAuth token takası başarısız oldu (HTTP ${res.status}): ${err}`);
    }

    const data = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    };

    const expiresAt = Date.now() + (data.expires_in ?? 3600) * 1000;

    return {
      type: 'oauth',
      accessToken: data.access_token,
      access: data.access_token,
      refreshToken: data.refresh_token,
      refresh: data.refresh_token,
      expiresAt,
      expires: expiresAt,
    };
  }

  async refresh(credential: OAuthCredential, signal?: AbortSignal): Promise<OAuthCredential> {
    const refreshToken = credential.refreshToken || credential.refresh;
    if (!refreshToken) {
      throw new Error('Anthropic token yenilenemedi: refresh_token eksik.');
    }

    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        client_id: CLIENT_ID,
        refresh_token: refreshToken,
      }),
      signal,
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Anthropic OAuth token yenileme başarısız (HTTP ${res.status}): ${err}`);
    }

    const data = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    };

    const expiresAt = Date.now() + (data.expires_in ?? 3600) * 1000;

    return {
      ...credential,
      accessToken: data.access_token,
      access: data.access_token,
      refreshToken: data.refresh_token || refreshToken,
      refresh: data.refresh_token || refreshToken,
      expiresAt,
      expires: expiresAt,
    };
  }
}
