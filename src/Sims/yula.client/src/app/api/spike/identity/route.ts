import { type NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { eq } from "drizzle-orm";
import { auth, type Session } from "@/lib/auth";
import { db } from "@/server/db/client";
import { appUsersSchema, userTenantRolesSchema } from "@/server/db/schema";
import { findIdentityRowForLogin, sessionIdentity } from "@/features/auth/lib/app-user-sync";
import type { DecodedJwt, SpikeIdentityResponse } from "@/app/spike/identity/identity-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeDecodeJwt(jwtStr: string): DecodedJwt | null {
  try {
    const parts = jwtStr.split(".");
    if (parts.length < 2) return null;

    const decodePart = (b64url: string): Record<string, unknown> => {
      const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
      const bin = Buffer.from(b64, "base64").toString("utf-8");
      return JSON.parse(bin) as Record<string, unknown>;
    };

    return {
      header: decodePart(parts[0]),
      payload: decodePart(parts[1]),
    };
  } catch {
    return null;
  }
}

function extractRealm(issuerUrl?: string): string | null {
  if (!issuerUrl) return null;
  const match = issuerUrl.match(/\/realms\/([^/]+)/);
  return match ? match[1] : null;
}

export async function GET(req: NextRequest) {
  if (process.env.NEXT_PUBLIC_ENABLE_SPIKES !== "true" && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Spikes are disabled in production" }, { status: 403 });
  }

  const session = (await auth()) as Session | null;
  const rawToken = (await getToken({
    req,
    secret: process.env.AUTH_SECRET,
  })) as (Record<string, unknown> & {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
    provider?: string;
    roles?: string[];
    phone?: string;
    activeCompanyId?: string;
    companies?: Array<{ id: string; name?: string; code?: string }>;
  }) | null;

  const user = session?.user;
  const accessToken = user?.accessToken ?? (typeof rawToken?.accessToken === "string" ? rawToken.accessToken : null);
  const refreshToken = typeof rawToken?.refreshToken === "string" ? rawToken.refreshToken : null;
  const provider = (user?.provider ?? rawToken?.provider ?? null) as string | null;

  const decodedAccessToken = accessToken ? safeDecodeJwt(accessToken) : null;
  const decodedRefreshToken = refreshToken ? safeDecodeJwt(refreshToken) : null;

  const keycloakIssuer = process.env.KEYCLOAK_ISSUER ?? null;
  const tokenIssuer = typeof decodedAccessToken?.payload.iss === "string" ? decodedAccessToken.payload.iss : undefined;
  const realm = extractRealm(tokenIssuer) ?? extractRealm(keycloakIssuer ?? undefined);

  const expiresAt = typeof rawToken?.expiresAt === "number"
    ? rawToken.expiresAt
    : typeof decodedAccessToken?.payload.exp === "number"
      ? decodedAccessToken.payload.exp * 1000
      : null;

  const ttlSeconds = expiresAt ? Math.max(0, Math.floor((expiresAt - Date.now()) / 1000)) : null;

  let catalogRole: string | null = null;
  const tenantRoles: Record<string, string> = {};

  try {
    const identity = sessionIdentity(session);
    if (identity) {
      const idRow = await findIdentityRowForLogin(identity.provider, identity.providerId);
      if (idRow?.userId) {
        const [row] = await db
          .select({ role: appUsersSchema.role })
          .from(appUsersSchema)
          .where(eq(appUsersSchema.id, idRow.userId))
          .limit(1);
        catalogRole = row?.role ?? null;

        const tenantRows = await db
          .select({
            tenantId: userTenantRolesSchema.tenantId,
            role: userTenantRolesSchema.role,
          })
          .from(userTenantRolesSchema)
          .where(eq(userTenantRolesSchema.userId, idRow.userId));

        for (const tr of tenantRows) {
          if (tr.tenantId && tr.role) {
            tenantRoles[tr.tenantId] = tr.role;
          }
        }
      }
    }
  } catch (err) {
    console.warn("[spike/identity] DB rol okuma hatası:", err);
  }

  const response: SpikeIdentityResponse = {
    authenticated: Boolean(user || rawToken),
    provider,
    realm,
    keycloakIssuer,
    user: user || rawToken ? {
      id: user?.id ?? (typeof rawToken?.sub === "string" ? rawToken.sub : null),
      name: user?.name ?? (typeof rawToken?.name === "string" ? rawToken.name : null),
      email: user?.email ?? (typeof rawToken?.email === "string" ? rawToken.email : null),
      image: user?.image ?? (typeof rawToken?.picture === "string" ? rawToken.picture : null),
      phone: user?.phone ?? rawToken?.phone ?? null,
      roles: user?.roles ?? rawToken?.roles ?? [],
      catalogRole,
      tenantRoles,
      activeCompanyId: user?.activeCompanyId ?? rawToken?.activeCompanyId ?? null,
      companies: (user?.companies ?? rawToken?.companies ?? []) as Array<{ id: string; name?: string; code?: string }>,
    } : null,
    tokens: {
      hasAccessToken: Boolean(accessToken),
      accessToken,
      accessTokenExpiresAt: expiresAt,
      accessTokenTtlSeconds: ttlSeconds,
      decodedAccessToken,
      hasRefreshToken: Boolean(refreshToken),
      refreshToken,
      decodedRefreshToken,
    },
    rawNextAuthToken: rawToken ? { ...rawToken } : null,
    serverTime: new Date().toISOString(),
  };

  return NextResponse.json(response);
}
