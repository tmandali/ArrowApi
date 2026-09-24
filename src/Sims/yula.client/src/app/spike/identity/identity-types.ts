export interface DecodedJwt {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
}

export interface SpikeIdentityResponse {
  authenticated: boolean;
  provider: string | null;
  realm: string | null;
  keycloakIssuer: string | null;
  user: {
    id: string | null;
    name: string | null;
    email: string | null;
    image: string | null;
    phone: string | null;
    roles: string[];
    catalogRole: string | null;
    tenantRoles: Record<string, string>;
    activeCompanyId: string | null;
    companies: Array<{ id: string; name?: string; code?: string }>;
  } | null;
  tokens: {
    hasAccessToken: boolean;
    accessToken: string | null;
    accessTokenExpiresAt: number | null;
    accessTokenTtlSeconds: number | null;
    decodedAccessToken: DecodedJwt | null;
    hasRefreshToken: boolean;
    refreshToken: string | null;
    decodedRefreshToken: DecodedJwt | null;
  };
  rawNextAuthToken: Record<string, unknown> | null;
  serverTime: string;
}
