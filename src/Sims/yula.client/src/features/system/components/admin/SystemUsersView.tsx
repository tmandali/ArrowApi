"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { AIChatAssistant } from "@/components/layout/ai-chat-assistant";
import { PageHeaderTitle } from "@/components/layout/page-header-title";
import { WorkspacePageShell } from "@/components/layout/workspace-page-shell";
import { panelCardClass } from "@/components/layout/panel-chrome";
import { cn } from "@/utils/cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { UserPlus, Search, ShieldCheck, GitMerge, MoreVertical, CheckCircle2, XCircle, Check } from "lucide-react";

type SystemUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: "Active" | "Inactive";
  lastActive: string;
  /** Login provider'ı (keycloak/google/local) — admin/manuel satırlarda null. */
  provider: string | null;
  /** Provider'daki ham sub (Keycloak UUID / Google sayısal). */
  providerId: string | null;
};

/** Login kimliği (`user_identities`) — guest picker satırı. */
type SystemIdentity = {
  id: string;
  provider: string | null;
  providerId: string | null;
  name: string | null;
  email: string | null;
  language: string | null;
  lastActive: string | null;
  createdAt: string | null;
  /** Katalog linki: null = GUEST. */
  userId: string | null;
  catalogRole: string | null;
  catalogStatus: string | null;
};

const ROLE_OPTIONS = ["System Administrator", "Stock Manager", "Financial Analyst", "Viewer"] as const;

function normalizeRow(row: Record<string, unknown>): SystemUser {
  const status = String(row.status ?? "Active") === "Inactive" ? "Inactive" : "Active";
  const provider = row.provider == null ? null : String(row.provider);
  const providerId = row.providerId == null ? null : String(row.providerId);
  return {
    id: String(row.id ?? ""),
    name: String(row.name ?? ""),
    email: String(row.email ?? ""),
    role: String(row.role ?? "Viewer"),
    status,
    lastActive: String(row.lastActive ?? ""),
    provider,
    providerId,
  };
}

export function SystemUsersView() {
  const t = useTranslations("SystemUsers");
  const tc = useTranslations("Common");
  const [searchTerm, setSearchTerm] = React.useState("");
  const [users, setUsers] = React.useState<SystemUser[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [formName, setFormName] = React.useState("");
  const [formEmail, setFormEmail] = React.useState("");
  const [formRole, setFormRole] = React.useState<string>("Viewer");
  const [formError, setFormError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [rowBusyId, setRowBusyId] = React.useState<string | null>(null);

  // ── Sekmeler + guest (yetkilendirilmemiş kimlik) picker ──
  const [tab, setTab] = React.useState<"catalog" | "guests">("catalog");
  const [guests, setGuests] = React.useState<SystemIdentity[]>([]);
  const [guestLoading, setGuestLoading] = React.useState(true);
  const [guestError, setGuestError] = React.useState<string | null>(null);
  const [guestSearch, setGuestSearch] = React.useState("");
  const [authorizeOpen, setAuthorizeOpen] = React.useState(false);
  const [authorizeIdentity, setAuthorizeIdentity] = React.useState<SystemIdentity | null>(null);
  const [authorizeRole, setAuthorizeRole] = React.useState<string>("Viewer");
  const [authorizing, setAuthorizing] = React.useState(false);
  const [authorizeError, setAuthorizeError] = React.useState<string | null>(null);

  // ── Cross-provider birleştirme (identity_aliases) ──
  const [guestSelected, setGuestSelected] = React.useState<string[]>([]);
  const [mergeOpen, setMergeOpen] = React.useState(false);
  const [mergeOwnerId, setMergeOwnerId] = React.useState("");
  const [merging, setMerging] = React.useState(false);
  const [mergeError, setMergeError] = React.useState<string | null>(null);

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  React.useEffect(() => {
    void fetchUsers();
    void fetchGuests();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredUsers = users.filter(
    (u) =>
      u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.role.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleAddUser = async () => {
    const name = formName.trim();
    const email = formEmail.trim();
    if (!name) {
      setFormError(t("name_required"));
      return;
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setFormError(t("email_invalid"));
      return;
    }
    setFormError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/system/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: `usr_${Date.now()}`,
          provider: null,
          providerId: null,
          name,
          email: email || null,
          role: formRole,
          status: "Active",
          lastActive: "Now",
        }),
      });
      const data = (await res.json()) as { user?: Record<string, unknown>; error?: string };
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      if (data.user) setUsers((prev) => [normalizeRow(data.user as Record<string, unknown>), ...prev]);
      setDialogOpen(false);
      setFormName("");
      setFormEmail("");
      setFormRole("Viewer");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

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

  const handleDelete = async (user: SystemUser) => {
    if (!window.confirm(`${user.name || user.email} ${t("delete_confirm")}`)) return;
    setRowBusyId(user.id);
    try {
      const res = await fetch(`/api/system/users?id=${encodeURIComponent(user.id)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // Soft-delete: satır `Deleted` tombstone olur; GET catalog zaten
      // filtirligi dondurur → listeyi tazele.
      await fetchUsers();
    } catch {
      // sessiz geç
    } finally {
      setRowBusyId(null);
    }
  };

  // ── Guest yetkilendirme: seçili kimliğe katalog satırı açılır + linklenir ──
  const openAuthorize = (identity: SystemIdentity) => {
    setAuthorizeIdentity(identity);
    setAuthorizeRole("Viewer");
    setAuthorizeError(null);
    setAuthorizeOpen(true);
  };

  const handleAuthorize = async () => {
    if (!authorizeIdentity) return;
    setAuthorizing(true);
    setAuthorizeError(null);
    try {
      const res = await fetch("/api/system/identities", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          identityId: authorizeIdentity.id,
          role: authorizeRole,
          status: "Active",
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setAuthorizeOpen(false);
      setAuthorizeIdentity(null);
      // İki tarafı da tazele: guest listesinden düşer, kataloğa eklenir.
      void fetchGuests();
      void fetchUsers();
    } catch (error) {
      setAuthorizeError(error instanceof Error ? error.message : String(error));
    } finally {
      setAuthorizing(false);
    }
  };

  const filteredGuests = guests.filter(
    (g) =>
      (g.name ?? "").toLowerCase().includes(guestSearch.toLowerCase()) ||
      (g.email ?? "").toLowerCase().includes(guestSearch.toLowerCase()) ||
      (g.provider ?? "").toLowerCase().includes(guestSearch.toLowerCase())
  );

  // ── Birleştirme: seçili guest'ler tek ana kimliğe toplanır ──
  // Stale seçim (yetkilendirilmiş/birleştirilmiş id'ler) otomatik elelenir:
  const mergeableIds = guestSelected.filter((id) =>
    guests.some((g) => g.id === id && g.provider)
  );
  const selectedMergeables = guests.filter(
    (g) => mergeableIds.includes(g.id)
  );

  const toggleGuest = (id: string) => {
    setGuestSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const openMerge = () => {
    // Ana kimlik: en son aktif olan seçili (varsayılan).
    const pick = selectedMergeables
      .slice()
      .sort((a, b) =>
        (b.lastActive ?? b.createdAt ?? "").localeCompare(
          a.lastActive ?? a.createdAt ?? ""
        )
      )[0];
    setMergeOwnerId(pick?.id ?? "");
    setMergeError(null);
    setMergeOpen(true);
  };

  const handleMerge = async () => {
    const targets = mergeableIds.filter((id) => id !== mergeOwnerId);
    if (!mergeOwnerId || targets.length === 0) return;
    setMerging(true);
    setMergeError(null);
    try {
      // API hedef başına POST → sıralı birleştir (her adım kendi transaction'ı).
      for (const targetIdentityId of targets) {
        const res = await fetch("/api/system/identities/merge", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ownerId: mergeOwnerId, targetIdentityId }),
        });
        const data = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      }
      setMergeOpen(false);
      setGuestSelected([]);
      // Hedef satır silindi → guest listesi de katalog da tazelenir.
      void fetchGuests();
      void fetchUsers();
    } catch (error) {
      setMergeError(error instanceof Error ? error.message : String(error));
    } finally {
      setMerging(false);
    }
  };

  return (
    <WorkspacePageShell
      title={<PageHeaderTitle>{t("title")}</PageHeaderTitle>}
      showSearch={false}
      actions={
        <>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="h-7 px-3 text-xs gap-1.5">
                <UserPlus className="size-3.5" />
                {t("add_user")}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="text-sm">{t("dialog_title")}</DialogTitle>
                <DialogDescription className="text-xs">
                  {t("dialog_description")}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-1">
                <div className="space-y-1.5">
                  <Label htmlFor="new-user-name" className="text-xs">{t("field_name")}</Label>
                  <Input
                    id="new-user-name"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder={t("field_name").replace(" *", "")}
                    className="h-9 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="new-user-email" className="text-xs">{t("field_email")}</Label>
                  <Input
                    id="new-user-email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    placeholder="ornek@sirket.com"
                    className="h-9 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("field_role")}</Label>
                  <Select value={formRole} onValueChange={setFormRole}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder={t("field_role")} />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLE_OPTIONS.map((role) => (
                        <SelectItem key={role} value={role}>
                          {role}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {formError && <p className="text-xs text-red-500">{formError}</p>}
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => setDialogOpen(false)}
                  disabled={saving}
                >
                  {tc("cancel")}
                </Button>
                <Button size="sm" className="h-8 text-xs" onClick={handleAddUser} disabled={saving}>
                  {saving ? tc("adding") : tc("add")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <AIChatAssistant />
        </>
      }
    >
      <div className={cn(panelCardClass, "min-h-0 flex-1 flex flex-col p-4 md:p-6 space-y-4 overflow-hidden")}>
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <ShieldCheck className="size-4 text-primary" />
                  {t("catalog_title")}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {t("subtitle")}
                </p>
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
                    <TableHead>{t("col_status")}</TableHead>
                    <TableHead>{t("col_last_active")}</TableHead>
                    <TableHead className="w-10 text-center">{tc("actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y text-xs">
                  {loading &&
                    Array.from({ length: 4 }).map((_, i) => (
                      <TableRow key={`skeleton-${i}`}>
                        <TableCell colSpan={8}>
                          <Skeleton className="h-6 w-full" />
                        </TableCell>
                      </TableRow>
                    ))}
                  {!loading && loadError && (
                    <TableRow>
                        <TableCell colSpan={8}>
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
                        <TableCell colSpan={8}>
                        <Empty>
                          <EmptyHeader>
                            <EmptyTitle className="text-sm">{t("empty_title")}</EmptyTitle>
                            <EmptyDescription className="text-xs">
                              {searchTerm
                                ? t("empty_search")
                                : t("empty_new")}
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
              <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <p className="text-xs text-muted-foreground">{t("guests_subtitle")}</p>
                    <Button
                      size="sm"
                      className="h-7 text-xs"
                      onClick={openMerge}
                      disabled={mergeableIds.length < 2 || guestLoading}
                    >
                      <GitMerge className="size-3.5" />
                      {t("merge")}
                    </Button>
                  </div>
                  <div className="relative w-56">
                    <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
                    <Input
                      value={guestSearch}
                      onChange={(e) => setGuestSearch(e.target.value)}
                      placeholder={t("guest_search_placeholder")}
                      className="h-8 pl-8 text-xs bg-muted/20 border-muted-foreground/20"
                    />
                  </div>
                </div>
                <div className="rounded-md border bg-card flex-1 overflow-auto">
                  <Table>
                    <TableHeader className="bg-muted/40 text-xs sticky top-0 bg-card">
                      <TableRow className="border-b hover:bg-transparent">
                        <TableHead className="w-8">
                          <span className="sr-only">{t("merge_owner")}</span>
                        </TableHead>
                        <TableHead>{t("col_name")}</TableHead>
                        <TableHead>{t("col_email")}</TableHead>
                        <TableHead>{t("col_provider")}</TableHead>
                        <TableHead>{t("col_language")}</TableHead>
                        <TableHead>{t("col_last_active")}</TableHead>
                        <TableHead className="text-right">{t("authorize")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="divide-y text-xs">
                      {guestLoading &&
                        Array.from({ length: 3 }).map((_, i) => (
                          <TableRow key={`gskeleton-${i}`}>
                            <TableCell colSpan={7}>
                              <Skeleton className="h-6 w-full" />
                            </TableCell>
                          </TableRow>
                        ))}
                      {!guestLoading && guestError && (
                        <TableRow>
                          <TableCell colSpan={7}>
                            <Empty>
                              <EmptyHeader>
                                <EmptyTitle className="text-sm">{t("guest_load_error")}</EmptyTitle>
                                <EmptyDescription className="text-xs">{guestError}</EmptyDescription>
                              </EmptyHeader>
                              <Button size="sm" className="h-7 text-xs" onClick={fetchGuests}>
                                {tc("retry")}
                              </Button>
                            </Empty>
                          </TableCell>
                        </TableRow>
                      )}
                      {!guestLoading && !guestError && filteredGuests.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={7}>
                            <Empty>
                              <EmptyHeader>
                                <EmptyTitle className="text-sm">{t("guest_empty_title")}</EmptyTitle>
                                <EmptyDescription className="text-xs">{t("guest_empty_desc")}</EmptyDescription>
                              </EmptyHeader>
                            </Empty>
                          </TableCell>
                        </TableRow>
                      )}
                      {!guestLoading &&
                        !guestError &&
                        filteredGuests.map((g) => (
                          <TableRow key={g.id} className="hover:bg-muted/30">
                            <TableCell>
                              <Checkbox
                                checked={guestSelected.includes(g.id)}
                                onCheckedChange={() => toggleGuest(g.id)}
                                disabled={!g.provider}
                                title={g.provider ? undefined : "provider'sız — birleştirilemez"}
                              />
                            </TableCell>
                            <TableCell className="font-semibold text-foreground">
                              {g.name || "—"}
                            </TableCell>
                            <TableCell className="text-muted-foreground font-mono">{g.email || "—"}</TableCell>
                            <TableCell className="text-muted-foreground">
                              {g.provider ? (
                                <span className="inline-flex items-center gap-1.5" title={g.providerId ?? undefined}>
                                  <span className="font-mono">{g.provider}</span>
                                  {g.providerId && (
                                    <span className="text-[10px] opacity-60">
                                      {g.providerId.length > 8 ? `${g.providerId.slice(0, 8)}…` : g.providerId}
                                    </span>
                                  )}
                                </span>
                              ) : (
                                <span className="opacity-50">—</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {g.language ? (
                                <Badge variant="outline" className="text-[11px] uppercase">
                                  {g.language}
                                </Badge>
                              ) : (
                                <span className="opacity-50">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-muted-foreground">{g.lastActive || "—"}</TableCell>
                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                className="h-7 gap-1.5 text-xs"
                                onClick={() => openAuthorize(g)}
                              >
                                <ShieldCheck className="size-3.5" />
                                {t("authorize")}
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {/* Yetkilendirme diyaloğu: katalog satırı aç + kimliği linkle (tek transaction). */}
            <Dialog
              open={authorizeOpen}
              onOpenChange={(o) => {
                setAuthorizeOpen(o);
                if (!o) setAuthorizeIdentity(null);
              }}
            >
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="text-sm">{t("authorize_title")}</DialogTitle>
                  <DialogDescription className="text-xs">{t("authorize_description")}</DialogDescription>
                </DialogHeader>
                <div className="space-y-3 py-1">
                  {authorizeIdentity && (
                    <div className="rounded-md border bg-muted/20 p-3 text-xs">
                      <p className="font-semibold text-foreground">
                        {authorizeIdentity.name || authorizeIdentity.email || "—"}
                      </p>
                      <p className="font-mono text-muted-foreground">{authorizeIdentity.email || "—"}</p>
                      <p className="mt-1 text-muted-foreground">
                        {authorizeIdentity.provider
                          ? `${authorizeIdentity.provider} · ${
                              authorizeIdentity.providerId
                                ? authorizeIdentity.providerId.slice(0, 8) + "…"
                                : ""
                            }`
                          : "provider'sız"}
                      </p>
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t("authorize_role")}</Label>
                    <Select value={authorizeRole} onValueChange={setAuthorizeRole}>
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue placeholder={t("authorize_role")} />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLE_OPTIONS.map((role) => (
                          <SelectItem key={role} value={role}>
                            {role}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {authorizeError && <p className="text-xs text-red-500">{authorizeError}</p>}
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => setAuthorizeOpen(false)}
                    disabled={authorizing}
                  >
                    {tc("cancel")}
                  </Button>
                  <Button size="sm" className="h-8 text-xs" onClick={handleAuthorize} disabled={authorizing}>
                    {authorizing ? tc("adding") : t("authorize_done")}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            {/* Birleştirme diyaloğu: seçili guest'ler tek ana kimliğe toplanır. */}
            <Dialog
              open={mergeOpen}
              onOpenChange={(o) => {
                setMergeOpen(o);
                if (!o) setMergeOwnerId("");
              }}
            >
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="text-sm">{t("merge_title")}</DialogTitle>
                  <DialogDescription className="text-xs">{t("merge_description")}</DialogDescription>
                </DialogHeader>
                <div className="space-y-3 py-1">
                  <Label className="text-xs">{t("merge_owner")}</Label>
                  {selectedMergeables.map((g) => (
                    <div
                      key={g.id}
                      className={
                        "flex cursor-pointer items-center gap-2.5 rounded-md border p-2.5 text-xs " +
                        (mergeOwnerId === g.id ? "border-foreground bg-muted/40" : "hover:bg-muted/20")
                      }
                      onClick={() => setMergeOwnerId(g.id)}
                    >
                      <Checkbox
                        checked={mergeOwnerId === g.id}
                        onCheckedChange={() => setMergeOwnerId(g.id)}
                      />
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-foreground">
                          {g.name || g.email || "—"}
                        </p>
                        <p className="truncate text-muted-foreground">
                          {g.provider ?? "—"}
                          {g.email ? ` · ${g.email}` : ""}
                        </p>
                      </div>
                    </div>
                  ))}
                  {mergeError && <p className="text-xs text-red-500">{mergeError}</p>}
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => setMergeOpen(false)}
                    disabled={merging}
                  >
                    {tc("cancel")}
                  </Button>
                  <Button size="sm" className="h-8 text-xs" onClick={handleMerge} disabled={merging}>
                    {merging ? tc("adding") : t("merge_confirm")}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
    </WorkspacePageShell>
  );
}
