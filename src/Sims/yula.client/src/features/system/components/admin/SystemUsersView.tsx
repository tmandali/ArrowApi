"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { AIChatAssistant } from "@/components/layout/ai-chat/ai-chat-assistant";
import { PageHeaderTitle } from "@/components/layout/page-header-title";
import { WorkspacePageShell } from "@/components/layout/workspace-page-shell";
import { panelCardClass } from "@/components/layout/panel-chrome";
import { cn } from "@/utils/cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { signOut } from "next-auth/react";
import { Search, ShieldCheck, MoreVertical, CheckCircle2, XCircle, Check, LogOut } from "lucide-react";
import { useJobSession } from "@/features/auth/hooks/use-job-session";
import { useSystemUsersAgentBinding } from "./use-system-users-agent-binding";
import { SystemUser, SystemIdentity, ROLE_OPTIONS } from "./system-users-types";
import { SystemUsersGuestsTab } from "./SystemUsersGuestsTab";
import { SystemUserTenantRolesCell } from "./SystemUserTenantRolesCell";

function normalizeRow(row: Record<string, unknown>): SystemUser {
  const status = String(row.status ?? "Active") === "Inactive" ? "Inactive" : "Active";
  const provider = row.provider == null ? null : String(row.provider);
  const providerId = row.providerId == null ? null : String(row.providerId);
  const tenantRoles =
    row.tenantRoles && typeof row.tenantRoles === "object"
      ? (row.tenantRoles as Record<string, string>)
      : undefined;
  return {
    id: String(row.id ?? ""),
    name: String(row.name ?? ""),
    email: String(row.email ?? ""),
    role: String(row.role ?? "Viewer"),
    status,
    lastActive: String(row.lastActive ?? ""),
    provider,
    providerId,
    tenantRoles,
  };
}

export function SystemUsersView() {
  const t = useTranslations("SystemUsers");
  const tc = useTranslations("Common");
  const tNav = useTranslations("NavUser");
  const { clearJobSession } = useJobSession();
  const [signingOut, setSigningOut] = React.useState(false);
  const [searchTerm, setSearchTerm] = React.useState("");
  const [users, setUsers] = React.useState<SystemUser[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [rowBusyId, setRowBusyId] = React.useState<string | null>(null);

  const handleLogout = async () => {
    setSigningOut(true);
    clearJobSession();
    await signOut({ redirectTo: "/sign-in" });
  };

  // ── Sekmeler + guest (yetkilendirilmemiş kimlik) picker ──
  const [tab, setTab] = React.useState<"catalog" | "guests">("catalog");
  const [guests, setGuests] = React.useState<SystemIdentity[]>([]);
  const [guestLoading, setGuestLoading] = React.useState(true);
  const [guestError, setGuestError] = React.useState<string | null>(null);
  const [guestSearch, setGuestSearch] = React.useState("");

  useSystemUsersAgentBinding({
    usersCount: users.length,
    guestsCount: guests.length,
    searchTerm: tab === "catalog" ? searchTerm : guestSearch,
    setSearchTerm: tab === "catalog" ? setSearchTerm : setGuestSearch,
    tab,
    setTab,
    screenTitle: t("title"),
  });

  const fetchGuests = React.useCallback(async () => {
    setGuestLoading(true);
    setGuestError(null);
    try {
      const res = await fetch("/api/system/identities?unlinked=1", { cache: "no-store" });
      const data = (await res.json()) as { identities?: SystemIdentity[]; error?: string };
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setGuests(Array.isArray(data.identities) ? data.identities : []);
    } catch (error) {
      setGuestError(error instanceof Error ? error.message : String(error));
    } finally {
      setGuestLoading(false);
    }
  }, []);

  const fetchUsers = React.useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/system/users", { cache: "no-store" });
      const data = (await res.json()) as { users?: Record<string, unknown>[]; error?: string };
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setUsers(Array.isArray(data.users) ? data.users.map(normalizeRow) : []);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [usersRes, guestsRes] = await Promise.all([
          fetch("/api/system/users", { cache: "no-store" }),
          fetch("/api/system/identities?unlinked=1", { cache: "no-store" }),
        ]);
        if (active && usersRes.ok) {
          const data = (await usersRes.json()) as { users?: Record<string, unknown>[]; error?: string };
          setUsers(Array.isArray(data.users) ? data.users.map(normalizeRow) : []);
        }
        if (active && guestsRes.ok) {
          const data = (await guestsRes.json()) as { identities?: SystemIdentity[]; error?: string };
          setGuests(Array.isArray(data.identities) ? data.identities : []);
        }
      } catch (error) {
        if (active) setLoadError(error instanceof Error ? error.message : String(error));
      } finally {
        if (active) {
          setLoading(false);
          setGuestLoading(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const filteredUsers = users.filter(
    (u) =>
      u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.role.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleToggleStatus = async (user: SystemUser) => {
    const next = user.status === "Active" ? "Inactive" : "Active";
    setRowBusyId(user.id);
    try {
      const res = await fetch("/api/system/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...user, status: next }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, status: next } : u)));
    } catch {
      // sessiz geç — liste eski halde kalır
    } finally {
      setRowBusyId(null);
    }
  };

  const handleSetRole = async (user: SystemUser, role: string) => {
    if (role === user.role) return;
    setRowBusyId(user.id);
    try {
      const res = await fetch("/api/system/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...user, role }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, role } : u)));
    } catch {
      // sessiz geç — liste eski halde kalır
    } finally {
      setRowBusyId(null);
    }
  };

  const handleTenantRoleChanged = (userId: string, tenantId: string, role: string) => {
    setUsers((prev) =>
      prev.map((u) => {
        if (u.id !== userId) return u;
        return {
          ...u,
          tenantRoles: {
            ...u.tenantRoles,
            [tenantId]: role,
          },
        };
      })
    );
  };

  const handleDelete = async (user: SystemUser) => {
    if (!window.confirm(`${user.name || user.email} ${t("delete_confirm")}`)) return;
    setRowBusyId(user.id);
    try {
      const res = await fetch(`/api/system/users?id=${encodeURIComponent(user.id)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await fetchUsers();
    } catch {
      // sessiz geç
    } finally {
      setRowBusyId(null);
    }
  };

  return (
    <WorkspacePageShell
      title={<PageHeaderTitle>{t("title")}</PageHeaderTitle>}
      showSearch={false}
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={signingOut}
            className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-destructive hover:border-destructive/40 transition-colors"
            onClick={handleLogout}
            title={tNav("sign_out")}
          >
            <LogOut className="size-3.5" />
            <span className="hidden sm:inline">{tNav("sign_out")}</span>
          </Button>
          <AIChatAssistant />
        </div>
      }
    >
      <div className={cn(panelCardClass, "min-h-0 flex-1 flex flex-col p-4 md:p-6 space-y-4 overflow-hidden")}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <ShieldCheck className="size-4 text-primary" />
              {t("catalog_title")}
            </h2>
            <p className="text-xs text-muted-foreground">{t("subtitle")}</p>
          </div>

          {tab === "catalog" && (
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={t("search_placeholder")}
                className="h-8 pl-8 text-xs bg-muted/20 border-muted-foreground/20"
              />
            </div>
          )}
        </div>

        {/* Sekmeler: katalog (yetkilendirilmiş) vs guest picker (link bekleyen). */}
        <div className="flex items-center gap-1 border-b pb-2">
          {(["catalog", "guests"] as const).map((k) => (
            <Button
              key={k}
              variant={tab === k ? "default" : "ghost"}
              size="sm"
              className="h-8 text-xs"
              onClick={() => setTab(k)}
            >
              {k === "catalog" ? t("tab_users") : t("tab_guests")}
              {k === "guests" && !guestLoading && (
                <Badge variant="secondary" className="ml-1.5 text-[10px]">
                  {guests.length}
                </Badge>
              )}
            </Button>
          ))}
        </div>

        {tab === "catalog" && (
          <div className="rounded-md border bg-card flex-1 overflow-auto">
            <Table>
              <TableHeader className="bg-muted/40 text-xs sticky top-0 bg-card">
                <TableRow className="border-b hover:bg-transparent">
                  <TableHead className="w-12">{t("col_id")}</TableHead>
                  <TableHead>{t("col_name")}</TableHead>
                  <TableHead>{t("col_email")}</TableHead>
                  <TableHead>{t("col_provider")}</TableHead>
                  <TableHead>{t("col_role")}</TableHead>
                  <TableHead>Tenant / Şirket</TableHead>
                  <TableHead>{t("col_status")}</TableHead>
                  <TableHead>{t("col_last_active")}</TableHead>
                  <TableHead className="w-10 text-center">{tc("actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y text-xs">
                {loading &&
                  Array.from({ length: 4 }).map((_, i) => (
                    <TableRow key={`skeleton-${i}`}>
                      <TableCell colSpan={9}>
                        <Skeleton className="h-6 w-full" />
                      </TableCell>
                    </TableRow>
                  ))}
                {!loading && loadError && (
                  <TableRow>
                    <TableCell colSpan={9}>
                      <Empty>
                        <EmptyHeader>
                          <EmptyTitle className="text-sm">{t("load_error_title")}</EmptyTitle>
                          <EmptyDescription className="text-xs">{loadError}</EmptyDescription>
                        </EmptyHeader>
                        <Button size="sm" className="h-7 text-xs" onClick={fetchUsers}>
                          {tc("retry")}
                        </Button>
                      </Empty>
                    </TableCell>
                  </TableRow>
                )}
                {!loading && !loadError && filteredUsers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9}>
                      <Empty>
                        <EmptyHeader>
                          <EmptyTitle className="text-sm">{t("empty_title")}</EmptyTitle>
                          <EmptyDescription className="text-xs">
                            {searchTerm ? t("empty_search") : t("empty_new")}
                          </EmptyDescription>
                        </EmptyHeader>
                      </Empty>
                    </TableCell>
                  </TableRow>
                )}
                {!loading &&
                  !loadError &&
                  filteredUsers.map((user) => (
                    <TableRow key={user.id} className="hover:bg-muted/30">
                      <TableCell className="font-mono text-muted-foreground">{user.id}</TableCell>
                      <TableCell className="font-semibold text-foreground">{user.name}</TableCell>
                      <TableCell className="text-muted-foreground font-mono">{user.email}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {user.provider ? (
                          <span className="inline-flex items-center gap-1.5" title={user.providerId ?? undefined}>
                            <span className="font-mono">{user.provider}</span>
                            {user.providerId && (
                              <span className="text-[10px] opacity-60">
                                {user.providerId.length > 8 ? `${user.providerId.slice(0, 8)}…` : user.providerId}
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="opacity-50">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[11px] font-medium">
                          {user.role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <SystemUserTenantRolesCell
                          userId={user.id}
                          tenantRoles={user.tenantRoles}
                          onRoleChanged={handleTenantRoleChanged}
                        />
                      </TableCell>
                      <TableCell>
                        {user.status === "Active" ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                            <CheckCircle2 className="size-3" /> {tc("active")}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-muted-foreground font-medium">
                            <XCircle className="size-3" /> {tc("inactive")}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{user.lastActive}</TableCell>
                      <TableCell className="text-center">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-6 text-muted-foreground"
                              disabled={rowBusyId === user.id}
                            >
                              <MoreVertical className="size-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="text-xs">
                            <DropdownMenuSub>
                              <DropdownMenuSubTrigger>{t("role_change")}</DropdownMenuSubTrigger>
                              <DropdownMenuSubContent className="text-xs">
                                {ROLE_OPTIONS.map((role) => (
                                  <DropdownMenuItem
                                    key={role}
                                    onClick={() => handleSetRole(user, role)}
                                    className="flex items-center gap-2"
                                  >
                                    <span className="w-4">
                                      {user.role === role && <Check className="size-3.5" />}
                                    </span>
                                    {role}
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuSubContent>
                            </DropdownMenuSub>
                            <DropdownMenuItem onClick={() => handleToggleStatus(user)}>
                              {user.status === "Active" ? t("deactivate") : t("activate")}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleDelete(user)}
                              className="text-red-500"
                            >
                              {tc("delete")}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        )}

        {tab === "guests" && (
          <SystemUsersGuestsTab
            guests={guests}
            guestLoading={guestLoading}
            guestError={guestError}
            guestSearch={guestSearch}
            setGuestSearch={setGuestSearch}
            fetchGuests={fetchGuests}
            fetchUsers={fetchUsers}
            t={t}
            tc={tc}
          />
        )}
      </div>
    </WorkspacePageShell>
  );
}
