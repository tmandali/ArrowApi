"use client";

import * as React from "react";
import { COMPANY_CATALOG } from "@/lib/company-catalog";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Check, ChevronDown, Loader2 } from "lucide-react";
import { TENANT_ROLE_OPTIONS } from "./system-users-types";

type Props = {
  userId: string;
  tenantRoles?: Record<string, string>;
  onRoleChanged: (userId: string, tenantId: string, role: string) => void;
};

export function SystemUserTenantRolesCell({ userId, tenantRoles = {}, onRoleChanged }: Props) {
  const [busyTenantId, setBusyTenantId] = React.useState<string | null>(null);

  const handleSelectRole = async (tenantId: string, role: string) => {
    if (tenantRoles[tenantId] === role) return;
    setBusyTenantId(tenantId);
    try {
      const res = await fetch("/api/system/users/tenant-roles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId, tenantId, role }),
      });
      if (res.ok) {
        onRoleChanged(userId, tenantId, role);
      }
    } catch {
      // sessiz fail
    } finally {
      setBusyTenantId(null);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {COMPANY_CATALOG.map((company) => {
        const role = tenantRoles[company.id] ?? "Guest";
        const isBusy = busyTenantId === company.id;
        const isAdmin = role === "Admin";
        const isGuest = role === "Guest";

        const badgeVariant = isAdmin ? "default" : isGuest ? "outline" : "secondary";

        return (
          <DropdownMenu key={company.id}>
            <DropdownMenuTrigger asChild disabled={isBusy}>
              <button
                type="button"
                className="group inline-flex items-center gap-1 focus:outline-none"
                title={`${company.name}: ${role}`}
              >
                <Badge
                  variant={badgeVariant}
                  className="cursor-pointer text-[10px] px-1.5 py-0 font-normal transition-colors group-hover:border-primary/50"
                >
                  <span className="font-semibold">{company.abbr ?? company.id.toUpperCase()}:</span>{" "}
                  <span>{role}</span>
                  {isBusy ? (
                    <Loader2 className="ml-1 size-2.5 animate-spin" />
                  ) : (
                    <ChevronDown className="ml-0.5 size-2.5 opacity-50 group-hover:opacity-100" />
                  )}
                </Badge>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-36 text-xs">
              <DropdownMenuLabel className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                {company.name} Rolü
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {TENANT_ROLE_OPTIONS.map((opt) => (
                <DropdownMenuItem
                  key={opt}
                  className="flex items-center justify-between text-xs py-1 cursor-pointer"
                  onClick={() => void handleSelectRole(company.id, opt)}
                >
                  <span className={opt === "Admin" ? "font-semibold text-primary" : ""}>
                    {opt}
                  </span>
                  {role === opt && <Check className="size-3 text-primary" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      })}
    </div>
  );
}
