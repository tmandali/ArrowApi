"use client";

import * as React from "react";
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { Search, ShieldCheck, GitMerge } from "lucide-react";
import { SystemIdentity, ROLE_OPTIONS } from "./system-users-types";

interface SystemUsersGuestsTabProps {
  guests: SystemIdentity[];
  guestLoading: boolean;
  guestError: string | null;
  guestSearch: string;
  setGuestSearch: (val: string) => void;
  fetchGuests: () => Promise<void>;
  fetchUsers: () => Promise<void>;
  t: (k: string) => string;
  tc: (k: string) => string;
}

export function SystemUsersGuestsTab({
  guests,
  guestLoading,
  guestError,
  guestSearch,
  setGuestSearch,
  fetchGuests,
  fetchUsers,
  t,
  tc,
}: SystemUsersGuestsTabProps) {
  const [authorizeOpen, setAuthorizeOpen] = React.useState(false);
  const [authorizeIdentity, setAuthorizeIdentity] = React.useState<SystemIdentity | null>(null);
  const [authorizeRole, setAuthorizeRole] = React.useState<string>("Viewer");
  const [authorizing, setAuthorizing] = React.useState(false);
  const [authorizeError, setAuthorizeError] = React.useState<string | null>(null);

  const [guestSelected, setGuestSelected] = React.useState<string[]>([]);
  const [mergeOpen, setMergeOpen] = React.useState(false);
  const [mergeOwnerId, setMergeOwnerId] = React.useState("");
  const [merging, setMerging] = React.useState(false);
  const [mergeError, setMergeError] = React.useState<string | null>(null);

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

  const mergeableIds = guestSelected.filter((id) =>
    guests.some((g) => g.id === id && g.provider)
  );
  const selectedMergeables = guests.filter((g) => mergeableIds.includes(g.id));

  const toggleGuest = (id: string) => {
    setGuestSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const openMerge = () => {
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
      void fetchGuests();
      void fetchUsers();
    } catch (error) {
      setMergeError(error instanceof Error ? error.message : String(error));
    } finally {
      setMerging(false);
    }
  };

  return (
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
  );
}
