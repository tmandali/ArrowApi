"use client";

import * as React from "react";
import { Globe, User, Clock, Building, CheckCircle2, XCircle } from "lucide-react";
import type { SpikeIdentityResponse } from "./identity-types";

interface OverviewCardsProps {
  data: SpikeIdentityResponse | null;
  ttl: number | null;
}

export function IdentityOverviewCards({ data, ttl }: OverviewCardsProps) {
  const user = data?.user;
  const tokens = data?.tokens;

  const formatTtl = (sec: number | null) => {
    if (sec === null) return "Bilinmiyor";
    if (sec <= 0) return "Süresi Doldu (Expired)";
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${mins} dk ${secs} sn`;
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Card 1: Provider & Realm */}
      <div className="rounded-xl border bg-card p-4 shadow-xs">
        <div className="flex items-center justify-between text-muted-foreground mb-2">
          <span className="text-xs font-medium">Provider & Realm</span>
          <Globe className="h-4 w-4" />
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-lg font-bold capitalize text-foreground">
            {data?.provider || "Yok"}
          </span>
          {data?.realm && (
            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-mono text-primary font-semibold">
              {data.realm}
            </span>
          )}
        </div>
        <p className="text-[11px] font-mono text-muted-foreground mt-1 truncate" title={data?.keycloakIssuer || ""}>
          {data?.keycloakIssuer ? `Issuer: ${data.keycloakIssuer}` : "Harici Sağlayıcı / Local"}
        </p>
      </div>

      {/* Card 2: User Status */}
      <div className="rounded-xl border bg-card p-4 shadow-xs">
        <div className="flex items-center justify-between text-muted-foreground mb-2">
          <span className="text-xs font-medium">Kullanıcı Oturumu</span>
          <User className="h-4 w-4" />
        </div>
        <div className="flex items-center gap-2">
          {data?.authenticated ? (
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          ) : (
            <XCircle className="h-4 w-4 text-amber-600" />
          )}
          <span className="text-sm font-semibold truncate">
            {user?.name || user?.email || (data?.authenticated ? "Giriş Yapıldı" : "Anonim")}
          </span>
        </div>
        <p className="text-[11px] font-mono text-muted-foreground mt-1 truncate" title={user?.id || ""}>
          {user?.id ? `Sub: ${user.id}` : "Oturum açık değil"}
        </p>
      </div>

      {/* Card 3: Token Expiration */}
      <div className="rounded-xl border bg-card p-4 shadow-xs">
        <div className="flex items-center justify-between text-muted-foreground mb-2">
          <span className="text-xs font-medium">Access Token Süresi</span>
          <Clock className="h-4 w-4" />
        </div>
        <div className="text-lg font-bold text-foreground">
          {formatTtl(ttl)}
        </div>
        <p className="text-[11px] text-muted-foreground mt-1">
          {tokens?.hasAccessToken ? "JWT İstemcide Aktif" : "Token Mevcut Değil"}
        </p>
      </div>

      {/* Card 4: Roles & Active Company */}
      <div className="rounded-xl border bg-card p-4 shadow-xs">
        <div className="flex items-center justify-between text-muted-foreground mb-1.5">
          <span className="text-xs font-medium">Uygulama & Token Rolü</span>
          <Building className="h-4 w-4" />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-bold text-primary">
            {user?.catalogRole || "Guest (Katalog Dışı)"}
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground mt-1 truncate" title={user?.roles?.join(", ") || ""}>
          Token: {user?.roles && user.roles.length > 0 ? user.roles.join(", ") : "OIDC Rolü Yok"}
        </p>
        <p className="text-[11px] font-mono text-muted-foreground mt-0.5 truncate">
          {user?.activeCompanyId
            ? `Şirket: ${user.activeCompanyId} (${user?.tenantRoles?.[user.activeCompanyId] ?? "Yetki Yok"})`
            : "Şirket seçilmedi"}
        </p>
      </div>
    </div>
  );
}
