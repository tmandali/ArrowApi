"use client";

import * as React from "react";
import { useRouter, usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronDown, Check, LayoutGrid } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useActiveWorkspaceId } from "@/hooks/use-active-workspace";
import { getRailWorkspaces } from "@/lib/workspace-registry";
import { workspaceIconFor } from "@/components/layout/workspace-brand";
import { cn } from "@/utils/cn";
import type { WorkspaceId } from "@/types";

export function WorkspaceSelectorDropdown({ className }: { className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const activeWorkspaceId = useActiveWorkspaceId();
  const railWorkspaces = getRailWorkspaces();
  const tHeader = useTranslations("AppHeader");
  const tRail = useTranslations("WorkspaceRail");

  const activeWsName = activeWorkspaceId
    ? (tHeader.has(`workspace_${activeWorkspaceId}` as `workspace_${WorkspaceId}`)
        ? tHeader(`workspace_${activeWorkspaceId}` as `workspace_${WorkspaceId}`)
        : (tRail.has(activeWorkspaceId) ? tRail(activeWorkspaceId) : activeWorkspaceId))
    : (tRail.has("workspaces") ? tRail("workspaces") : "Çalışma Alanı");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Çalışma alanı seçici"
          className={cn(
            "flex h-7 items-center gap-1.5 rounded-md border border-border/60 bg-muted/40 px-2 text-xs font-medium text-foreground/90 transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer",
            className
          )}
        >
          {React.createElement(workspaceIconFor(activeWorkspaceId) ?? LayoutGrid, {
            className: "size-3.5 shrink-0 text-orange-600 dark:text-orange-400",
            "aria-hidden": true,
          })}
          <span className="max-w-[130px] truncate text-xs font-medium">
            {activeWsName}
          </span>
          <ChevronDown className="size-3 shrink-0 text-muted-foreground opacity-60" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56 p-1">
        <DropdownMenuLabel className="px-2 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
          {tRail.has("workspaces") ? tRail("workspaces") : "Çalışma Alanları"}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {railWorkspaces.map((ws) => {
            const isActive = ws.id === activeWorkspaceId;
            const label = tRail.has(ws.id) ? tRail(ws.id) : ws.name;
            return (
              <DropdownMenuItem
                key={ws.id}
                onClick={() => {
                  if (pathname !== ws.url) {
                    router.push(ws.url);
                  }
                }}
                className={cn(
                  "flex items-center gap-2 px-2 py-1.5 text-xs cursor-pointer",
                  isActive && "bg-accent/60 font-medium text-accent-foreground"
                )}
              >
                {React.createElement(ws.icon, {
                  className: cn(
                    "size-4 shrink-0",
                    isActive ? "text-orange-600 dark:text-orange-400" : "text-muted-foreground"
                  ),
                })}
                <span className="flex-1 truncate">{label}</span>
                {isActive ? (
                  <Check className="size-3.5 shrink-0 text-primary" />
                ) : null}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
