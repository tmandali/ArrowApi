"use client";

import * as React from "react";
import {
  Shield,
  Key,
  RefreshCw,
  Copy,
  Check,
  User,
  Building,
  XCircle,
  Code,
  Sparkles,
} from "lucide-react";
import { useSession } from "next-auth/react";
import type { SpikeIdentityResponse } from "./identity-types";
import { IdentityClaimsTable } from "./identity-claims-table";
import { IdentityOverviewCards } from "./identity-overview-cards";

export function IdentityBench() {
  const { update: updateSession } = useSession();
  const [data, setData] = React.useState<SpikeIdentityResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [activeTab, setActiveTab] = React.useState<"overview" | "access_token" | "refresh_token" | "raw_nextauth">("overview");
  const [copiedToken, setCopiedToken] = React.useState<"access" | "refresh" | null>(null);
  const [ttl, setTtl] = React.useState<number | null>(null);
  const [userInfoResult, setUserInfoResult] = React.useState<Record<string, unknown> | null>(null);
  const [userInfoLoading, setUserInfoLoading] = React.useState(false);

  const loadData = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/spike/identity", { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      const json = (await res.json()) as SpikeIdentityResponse;
      setData(json);
      setError(null);
      setTtl(json.tokens.accessTokenTtlSeconds);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    let active = true;
    fetch("/api/spike/identity", { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        return res.json() as Promise<SpikeIdentityResponse>;
      })
      .then((json) => {
        if (!active) return;
        setData(json);
        setError(null);
        setTtl(json.tokens.accessTokenTtlSeconds);
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  // Live TTL countdown
  React.useEffect(() => {
    if (ttl === null || ttl <= 0) return;
    const interval = setInterval(() => {
      setTtl((prev) => (prev && prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [ttl]);

  const copyToClipboard = (type: "access" | "refresh", text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedToken(type);
    setTimeout(() => setCopiedToken(null), 1800);
  };

  const handleTestUserinfo = async () => {
    setUserInfoLoading(true);
    try {
      const res = await fetch("/api/auth/userinfo", { cache: "no-store" });
      const json = await res.json();
      setUserInfoResult(json);
    } catch (err) {
      setUserInfoResult({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      setUserInfoLoading(false);
    }
  };


  const handleRefresh = React.useCallback(async () => {
    setLoading(true);
    try {
      await updateSession().catch(() => {});
      await loadData();
    } finally {
      setLoading(false);
    }
  }, [loadData, updateSession]);

  if (loading && !data) {
    return (
      <div className="flex h-64 items-center justify-center gap-2 text-muted-foreground text-sm">
        <RefreshCw className="h-4 w-4 animate-spin text-primary" />
        Kimlik ve Token bilgileri yükleniyor...
      </div>
    );
  }

  if (error) {
    return (
      <div className="m-6 rounded-xl border border-destructive/30 bg-destructive/10 p-5 text-destructive">
        <h3 className="font-semibold text-base mb-1 flex items-center gap-2">
          <XCircle className="h-5 w-5" />
          Kimlik Bilgisi Alınamadı
        </h3>
        <p className="text-sm">{error}</p>
        <button
          onClick={handleRefresh}
          className="mt-4 rounded-lg bg-destructive px-3 py-1.5 text-xs text-destructive-foreground hover:opacity-90 font-medium"
        >
          Tekrar Dene
        </button>
      </div>
    );
  }

  const user = data?.user;
  const tokens = data?.tokens;
  const decodedAccess = tokens?.decodedAccessToken;
  const decodedRefresh = tokens?.decodedRefreshToken;

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-bold tracking-tight">Identity & Token Diagnostics</h1>
            <span className="rounded-md bg-amber-500/10 text-amber-600 px-2 py-0.5 text-xs font-semibold">
              Spike Bench
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Giriş oturumu, erişim/yenileme token&apos;ları, Keycloak realm ve OIDC claim denetleyicisi.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={loading}
            title="Oturumu sağlayıcıdan (Keycloak/Google) tazeler ve ekrandaki verileri günceller"
            className="inline-flex items-center gap-1.5 rounded-lg border bg-background px-3 py-1.5 text-xs font-semibold hover:bg-muted transition-colors shadow-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Yenile
          </button>
          <button
            onClick={handleTestUserinfo}
            disabled={userInfoLoading}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 transition-opacity"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {userInfoLoading ? "Sorgulanıyor..." : "Userinfo Test Et"}
          </button>
        </div>
      </div>

      {/* Overview Cards */}
      <IdentityOverviewCards data={data} ttl={ttl} />

      {/* Userinfo test result alert */}
      {userInfoResult !== null && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-xs font-mono">
          <div className="flex items-center justify-between mb-1 font-semibold text-primary">
            <span>Canlı GET /api/auth/userinfo Yanıtı:</span>
            <button onClick={() => setUserInfoResult(null)} className="text-muted-foreground hover:text-foreground">
              ✕
            </button>
          </div>
          <pre className="overflow-x-auto">{JSON.stringify(userInfoResult, null, 2)}</pre>
        </div>
      )}

      {/* Tabs Switcher */}
      <div className="flex border-b border-border gap-2">
        <button
          onClick={() => setActiveTab("overview")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold transition-colors ${
            activeTab === "overview"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <User className="h-3.5 w-3.5" />
          Profil & Roller
        </button>
        <button
          onClick={() => setActiveTab("access_token")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold transition-colors ${
            activeTab === "access_token"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Key className="h-3.5 w-3.5" />
          Access Token & Claims ({decodedAccess ? Object.keys(decodedAccess.payload).length : 0})
        </button>
        <button
          onClick={() => setActiveTab("refresh_token")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold transition-colors ${
            activeTab === "refresh_token"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh Token {tokens?.hasRefreshToken ? "(Mevcut)" : "(Yok)"}
        </button>
        <button
          onClick={() => setActiveTab("raw_nextauth")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold transition-colors ${
            activeTab === "raw_nextauth"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Code className="h-3.5 w-3.5" />
          Sunucu JWT & Cookie
        </button>
      </div>

      {/* Tab 1: Profile & Roles Overview */}
      {activeTab === "overview" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="rounded-xl border bg-card p-5 space-y-4">
            <h3 className="font-semibold text-sm border-b pb-2 flex items-center gap-2">
              <User className="h-4 w-4 text-primary" /> Kullanıcı Detayları
            </h3>
            <div className="space-y-2 text-xs font-mono">
              <div className="flex justify-between py-1 border-b border-muted">
                <span className="text-muted-foreground">ID (Sub):</span>
                <span className="font-medium text-foreground">{user?.id || "—"}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-muted">
                <span className="text-muted-foreground">İsim:</span>
                <span className="font-medium text-foreground">{user?.name || "—"}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-muted">
                <span className="text-muted-foreground">E-posta:</span>
                <span className="font-medium text-foreground">{user?.email || "—"}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-muted">
                <span className="text-muted-foreground">Telefon (SMS OTP):</span>
                <span className="font-medium text-foreground">{user?.phone || "—"}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-muted">
                <span className="text-muted-foreground">Sağlayıcı (Provider):</span>
                <span className="font-medium text-foreground">{data?.provider || "—"}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-muted-foreground">Realm:</span>
                <span className="font-medium text-foreground">{data?.realm || "—"}</span>
              </div>
            </div>
          </div>

          <div className="rounded-xl border bg-card p-5 space-y-4">
            <h3 className="font-semibold text-sm border-b pb-2 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary" /> Yula Uygulama Rolü (Katalog)
              </span>
              <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
                {user?.catalogRole || "Guest (Katalog Dışı)"}
              </span>
            </h3>

            {/* Tenant roles */}
            {user?.tenantRoles && Object.keys(user.tenantRoles).length > 0 && (
              <div className="space-y-1.5 text-xs">
                <span className="text-muted-foreground font-medium">Şirket (Tenant) İzinleri:</span>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(user.tenantRoles).map(([tId, tRole]) => (
                    <span key={tId} className="rounded border bg-muted/60 px-2 py-0.5 font-mono text-[11px]">
                      <strong>{tId}</strong>: {tRole}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="border-t pt-3">
              <h4 className="text-xs font-semibold text-muted-foreground mb-1.5 flex items-center gap-1.5">
                <Key className="h-3.5 w-3.5" /> Keycloak OIDC Token Rolleri (realm_access.roles)
              </h4>
              <p className="text-[11px] text-muted-foreground mb-2">
                Keycloak tarafından access token içine gömülen teknik OIDC protokol rolleridir.
              </p>
              {user?.roles && user.roles.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {user.roles.map((role) => (
                    <span
                      key={role}
                      className="inline-flex items-center gap-1 rounded bg-secondary px-2 py-0.5 font-mono text-[11px] font-semibold text-secondary-foreground"
                    >
                      {role}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Token içinde özel realm rolü yok.</p>
              )}
            </div>

            <h3 className="font-semibold text-sm border-b pb-2 pt-4 flex items-center gap-2">
              <Building className="h-4 w-4 text-primary" /> Şirketler ({user?.companies?.length ?? 0})
            </h3>
            <div className="flex flex-wrap gap-2">
              {user?.companies?.map((comp) => (
                <span
                  key={comp.id}
                  className={`rounded-md px-2 py-1 text-xs font-mono ${
                    comp.id === user.activeCompanyId
                      ? "bg-primary text-primary-foreground font-semibold"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {comp.name || comp.code || comp.id}
                  {comp.id === user.activeCompanyId && " (Aktif)"}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Access Token & Claims */}
      {activeTab === "access_token" && (
        <div className="space-y-6">
          {tokens?.accessToken ? (
            <>
              {/* Raw Token Box */}
              <div className="rounded-xl border bg-card p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground">Ham Access Token (JWT Bearer)</span>
                  <button
                    onClick={() => copyToClipboard("access", tokens.accessToken!)}
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    {copiedToken === "access" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copiedToken === "access" ? "Kopyalandı!" : "Panoya Kopyala"}
                  </button>
                </div>
                <textarea
                  readOnly
                  value={tokens.accessToken}
                  rows={4}
                  className="w-full rounded-md border bg-muted/40 p-2.5 font-mono text-[11px] text-muted-foreground focus:outline-none"
                />
              </div>

              {/* Claims Table */}
              {decodedAccess && (
                <IdentityClaimsTable
                  claims={decodedAccess.payload}
                  title="Access Token Payload Claims"
                />
              )}
            </>
          ) : (
            <div className="rounded-xl border bg-card p-8 text-center text-muted-foreground text-xs">
              Mevcut oturum için erişilebilir access token bulunamadı.
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Refresh Token */}
      {activeTab === "refresh_token" && (
        <div className="space-y-6">
          {tokens?.refreshToken ? (
            <>
              <div className="rounded-xl border bg-card p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground">Ham Refresh Token</span>
                  <button
                    onClick={() => copyToClipboard("refresh", tokens.refreshToken!)}
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    {copiedToken === "refresh" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copiedToken === "refresh" ? "Kopyalandı!" : "Panoya Kopyala"}
                  </button>
                </div>
                <textarea
                  readOnly
                  value={tokens.refreshToken}
                  rows={4}
                  className="w-full rounded-md border bg-muted/40 p-2.5 font-mono text-[11px] text-muted-foreground focus:outline-none"
                />
              </div>

              {decodedRefresh && (
                <IdentityClaimsTable
                  claims={decodedRefresh.payload}
                  title="Decoded Refresh Token Claims"
                />
              )}
            </>
          ) : (
            <div className="rounded-xl border bg-card p-8 text-center text-muted-foreground text-xs space-y-2">
              <p className="font-semibold text-foreground">Refresh Token Bulunamadı</p>
              <p>
                Refresh token yalnızca Keycloak veya Google OAuth gibi refresh_token veren sağlayıcılarda ve NextAuth çerezinde oluşturulur.
                SMS OTP veya One Tap oturumlarında bulunmayabilir.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Tab 4: Server JWT */}
      {activeTab === "raw_nextauth" && (
        <div className="rounded-xl border bg-card p-5 space-y-3">
          <h3 className="font-semibold text-sm">Sunucu Tarafı NextAuth JWT Özeti</h3>
          <p className="text-xs text-muted-foreground">
            NextAuth oturum çerezinden (HTTP-only) decrypt edilen ham token verisidir.
          </p>
          <pre className="max-h-[480px] overflow-auto rounded-lg bg-muted/60 p-4 text-xs font-mono">
            {JSON.stringify(data?.rawNextAuthToken, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
