/**
 * Centralized OAuth Manager.
 * Handles provider registration, flow lifecycle, device polling,
 * automatic token refreshing, and persistent sync with auth.json.
 */

import { AuthData, getAuthPath, loadAuthFile, saveAuthFile } from '../auth';
import { AnthropicOAuthProvider } from './providers/anthropic';
import { GitHubCopilotOAuthProvider } from './providers/github-copilot';
import { OpenRouterOAuthProvider } from './providers/openrouter';
import {
  OAuthCredential,
  OAuthDeviceCodeInfo,
  OAuthExchangeOptions,
  OAuthProvider,
  OAuthStartResult,
} from './types';

// Refresh tokens if they expire within 5 minutes
const DEFAULT_EXPIRY_THRESHOLD_MS = 5 * 60 * 1000;

export class OAuthManager {
  private providers = new Map<string, OAuthProvider>();

  constructor() {
    this.registerProvider(new OpenRouterOAuthProvider());
    this.registerProvider(new GitHubCopilotOAuthProvider());
    this.registerProvider(new AnthropicOAuthProvider());
  }

  registerProvider(provider: OAuthProvider): void {
    this.providers.set(provider.id, provider);
  }

  getProvider(providerId: string): OAuthProvider | undefined {
    let p = this.providers.get(providerId);
    if (!p) {
      if (providerId === 'claude') p = this.providers.get('anthropic');
      else if (providerId === 'copilot') p = this.providers.get('github-copilot');
    }
    return p;
  }

  listProviders(): Array<{ id: string; name: string; isSubscription?: boolean }> {
    return Array.from(this.providers.values()).map((p) => ({
      id: p.id,
      name: p.name,
      isSubscription: p.isSubscription,
    }));
  }

  async startLogin(providerId: string, redirectUri?: string): Promise<OAuthStartResult> {
    const provider = this.getProvider(providerId);
    if (!provider) {
      throw new Error(`OAuth sağlayıcısı desteklenmiyor: ${providerId}`);
    }
    return provider.startLogin(redirectUri);
  }

  async exchangeCode(
    providerId: string,
    options: OAuthExchangeOptions,
    authPath: string = getAuthPath(),
  ): Promise<OAuthCredential> {
    const provider = this.getProvider(providerId);
    if (!provider || !provider.exchangeCode) {
      throw new Error(`Sağlayıcı kod takasını desteklemiyor: ${providerId}`);
    }

    const credential = await provider.exchangeCode(options);
    this.saveCredential(provider.id, credential, authPath);
    return credential;
  }

  async pollDevice(
    providerId: string,
    info: OAuthDeviceCodeInfo,
    signal?: AbortSignal,
    authPath: string = getAuthPath(),
  ): Promise<OAuthCredential> {
    const provider = this.getProvider(providerId);
    if (!provider || !provider.pollDeviceCode) {
      throw new Error(`Sağlayıcı cihaz yetkilendirme akışını desteklemiyor: ${providerId}`);
    }

    const credential = await provider.pollDeviceCode(info, signal);
    this.saveCredential(provider.id, credential, authPath);
    return credential;
  }

  saveCredential(providerId: string, credential: OAuthCredential, authPath: string = getAuthPath()): void {
    let currentData: AuthData = {};
    try {
      currentData = loadAuthFile(authPath);
    } catch {
      currentData = {};
    }

    currentData[providerId] = credential;
    saveAuthFile(currentData, authPath);
  }

  isExpiringSoon(credential: OAuthCredential, thresholdMs: number = DEFAULT_EXPIRY_THRESHOLD_MS): boolean {
    const expiry = credential.expiresAt ?? credential.expires;
    if (typeof expiry !== 'number' || !Number.isFinite(expiry)) {
      return false; // Persistent / non-expiring
    }
    return Date.now() + thresholdMs >= expiry;
  }

  async refreshTokenIfNeeded(
    providerId: string,
    credential: OAuthCredential,
    signal?: AbortSignal,
    authPath: string = getAuthPath(),
  ): Promise<OAuthCredential> {
    if (!this.isExpiringSoon(credential)) {
      return credential;
    }

    const provider = this.getProvider(providerId);
    if (!provider || !provider.refresh) {
      return credential;
    }

    try {
      const refreshed = await provider.refresh(credential, signal);
      this.saveCredential(provider.id, refreshed, authPath);
      return refreshed;
    } catch (error) {
      console.warn(`[OAuthManager] Token yenileme başarısız oldu (${providerId}):`, error);
      return credential;
    }
  }
}

export const oauthManager = new OAuthManager();
