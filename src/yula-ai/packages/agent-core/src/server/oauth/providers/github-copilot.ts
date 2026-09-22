/**
 * GitHub Copilot Device Code OAuth flow.
 * Ported from @earendil-works/pi-ai.
 */

import { pollOAuthDeviceCodeFlow } from '../device-code';
import { OAuthCredential, OAuthDeviceCodeInfo, OAuthProvider, OAuthStartResult } from '../types';

// GitHub Copilot public client ID
const CLIENT_ID = atob('SXYxLmI1MDdhMDhjODdlY2ZlOTg=');

const COPILOT_HEADERS = {
  'User-Agent': 'GitHubCopilotChat/0.35.0',
  'Editor-Version': 'vscode/1.107.0',
  'Editor-Plugin-Version': 'copilot-chat/0.35.0',
  'Copilot-Integration-Id': 'vscode-chat',
};

export class GitHubCopilotOAuthProvider implements OAuthProvider {
  readonly id = 'github-copilot';
  readonly name = 'GitHub Copilot';
  readonly isSubscription = true;

  async startLogin(): Promise<OAuthStartResult> {
    const response = await fetch('https://github.com/login/device/code', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        scope: 'read:user',
      }),
    });

    if (!response.ok) {
      throw new Error(`GitHub Device Code isteği başarısız oldu (HTTP ${response.status})`);
    }

    const data = (await response.json()) as {
      device_code: string;
      user_code: string;
      verification_uri: string;
      expires_in: number;
      interval: number;
    };

    return {
      type: 'device_code',
      info: {
        deviceCode: data.device_code,
        userCode: data.user_code,
        verificationUri: data.verification_uri,
        expiresInSeconds: data.expires_in,
        intervalSeconds: data.interval,
      },
    };
  }

  async pollDeviceCode(info: OAuthDeviceCodeInfo, signal?: AbortSignal): Promise<OAuthCredential> {
    const gitHubToken = await pollOAuthDeviceCodeFlow<string>({
      expiresInSeconds: info.expiresInSeconds,
      intervalSeconds: info.intervalSeconds,
      signal,
      poll: async () => {
        const res = await fetch('https://github.com/login/oauth/access_token', {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            client_id: CLIENT_ID,
            device_code: info.deviceCode,
            grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
          }),
        });

        if (!res.ok) {
          return { status: 'failed', message: `HTTP ${res.status}` };
        }

        const body = (await res.json()) as {
          access_token?: string;
          error?: string;
          interval?: number;
        };

        if (body.access_token) {
          return { status: 'complete', value: body.access_token };
        }

        if (body.error === 'authorization_pending') {
          return { status: 'pending' };
        }

        if (body.error === 'slow_down') {
          return { status: 'slow_down', intervalSeconds: body.interval };
        }

        return { status: 'failed', message: body.error || 'Bilinmeyen yetkilendirme hatası' };
      },
    });

    // Exchange GitHub token for Copilot internal session token
    return this.fetchCopilotSessionToken(gitHubToken);
  }

  async refresh(credential: OAuthCredential): Promise<OAuthCredential> {
    const gitHubToken = credential.refreshToken || credential.refresh || credential.accessToken;
    if (!gitHubToken) {
      throw new Error('Copilot oturum belirteci yenilenemedi: GitHub erişim belirteci bulunamadı.');
    }
    return this.fetchCopilotSessionToken(gitHubToken);
  }

  private async fetchCopilotSessionToken(gitHubAccessToken: string): Promise<OAuthCredential> {
    const res = await fetch('https://api.github.com/copilot_internal/v2/token', {
      headers: {
        authorization: `Bearer ${gitHubAccessToken}`,
        accept: 'application/json',
        ...COPILOT_HEADERS,
      },
    });

    if (!res.ok) {
      throw new Error(`Copilot dahili oturum belirteci alınamadı (HTTP ${res.status})`);
    }

    const body = (await res.json()) as {
      token: string;
      expires_at: number;
    };

    const expiresAt = body.expires_at * 1000;

    return {
      type: 'oauth',
      accessToken: body.token,
      access: body.token,
      refreshToken: gitHubAccessToken,
      refresh: gitHubAccessToken,
      expiresAt,
      expires: expiresAt,
    };
  }
}
