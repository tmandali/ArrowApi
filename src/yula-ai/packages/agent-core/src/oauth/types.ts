/**
 * OAuth types compatible with Pi architecture (@earendil-works/pi-ai)
 */

export interface OAuthCredentials {
  access: string;
  refresh: string;
  expires: number;
  [key: string]: unknown;
}

export interface OAuthCredential {
  type: 'oauth';
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  access?: string;
  refresh?: string;
  expires?: number;
  enterpriseDomain?: string;
  [key: string]: unknown;
}

export interface OAuthAuthInfo {
  url: string;
  instructions?: string;
  verifier?: string;
  state?: string;
}

export interface OAuthDeviceCodeInfo {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  intervalSeconds?: number;
  expiresInSeconds?: number;
}

export type OAuthStartResult =
  | { type: 'auth_url'; info: OAuthAuthInfo }
  | { type: 'device_code'; info: OAuthDeviceCodeInfo };

export interface OAuthExchangeOptions {
  code: string;
  verifier?: string;
  redirectUri?: string;
  state?: string;
  signal?: AbortSignal;
}

export interface OAuthProvider {
  id: string;
  name: string;
  isSubscription?: boolean;
  startLogin(redirectUri?: string): Promise<OAuthStartResult>;
  exchangeCode?(options: OAuthExchangeOptions): Promise<OAuthCredential>;
  pollDeviceCode?(info: OAuthDeviceCodeInfo, signal?: AbortSignal): Promise<OAuthCredential>;
  refresh?(credential: OAuthCredential, signal?: AbortSignal): Promise<OAuthCredential>;
}
