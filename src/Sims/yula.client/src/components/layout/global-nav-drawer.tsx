"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Users,
  Bot,
  Sparkles,
  Settings,
  UserCog,
  X,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { YULA } from "@/components/layout/yula-brand-data";
import { YulaMarkIcon } from "@/components/layout/yula-brand";
import { usePagePanelContext } from "@/context/page-panel-context";
import { getRailWorkspaces } from "@/lib/workspace-registry";
import { useActiveWorkspaceId } from "@/hooks/use-active-workspace";
import { cn } from "@/utils/cn";

export function GlobalNavDrawer() {
  const pathname = usePathname();
  const { openById, setOpen } = usePagePanelContext();
  const open = openById["global-drawer"] ?? false;
  const activeWorkspaceId = useActiveWorkspaceId();
  const railWorkspaces = getRailWorkspaces();
  const tRail = useTranslations("WorkspaceRail");
  const tNav = useTranslations("SystemNav");

  // Ctrl+B / ⌘+B toggle shortcut
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        setOpen("global-drawer", !open);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, setOpen]);

  const handleClose = () => {
    setOpen("global-drawer", false);
  };

  const systemLinks = [
    {
      url: "/system/users",
      label: tNav("system_users"),
      icon: Users,
    },
    {
      url: "/system/agents",
      label: tNav("system_agents"),
      icon: Bot,
    },
    {
      url: "/system/skills",
      label: tNav("system_skills"),
      icon: Sparkles,
    },
    {
      url: "/settings",
      label: tNav("system_settings"),
      icon: Settings,
    },
    {
      url: "/my/settings",
      label: tNav("my_settings"),
      icon: UserCog,
    },
  ];

  return (
    <Sheet open={open} onOpenChange={(isOpen) => setOpen("global-drawer", isOpen)}>
      <SheetContent
        side="left"
        showCloseButton={false}
        className="flex w-72 flex-col p-0 bg-sidebar border-r border-sidebar-border text-sidebar-foreground shadow-2xl z-50"
      >
        <SheetHeader className="flex h-12 shrink-0 flex-row items-center justify-between border-b border-sidebar-border px-3.5 space-y-0">
          <Link
            href="/"
            onClick={handleClose}
            className="flex items-center gap-2 transition-opacity hover:opacity-85"
          >
            <span className="flex size-6 items-center justify-center text-primary dark:text-sidebar-primary">
              <YulaMarkIcon />
            </span>
            <SheetTitle className="text-sm font-semibold tracking-tight text-sidebar-foreground cursor-pointer">
              {YULA.name}
            </SheetTitle>
          </Link>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Kapat"
            className="flex size-7 items-center justify-center rounded-md text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors cursor-pointer"
          >
            <X className="size-4" />
          </button>
          <SheetDescription className="sr-only">
            Yula ana gezinme menüsü ve çalışma alanları dizini.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-1 flex-col overflow-y-auto px-2 py-3 space-y-5">
          {/* Çalışma Alanları (Workspaces) Bölümü */}
          <div>
            <div className="px-2 pb-1.5 text-[11px] font-semibold text-sidebar-foreground/60 uppercase tracking-wider">
              {tRail.has("workspaces") ? tRail("workspaces") : "Çalışma Alanları"}
            </div>
            <div className="space-y-0.5">
              {railWorkspaces.map((ws) => {
                const isActive = ws.id === activeWorkspaceId;
                const label = tRail.has(ws.id) ? tRail(ws.id) : ws.name;
                return (
                  <Link
                    key={ws.id}
                    href={ws.url}
                    onClick={handleClose}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-sidebar-accent text-sidebar-foreground font-semibold ring-1 ring-sidebar-border"
                        : "text-sidebar-foreground/90 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                    )}
                  >
                    {React.createElement(ws.icon, {
                      className: cn(
                        "size-4 shrink-0",
                        isActive ? "text-orange-500 dark:text-orange-400" : "text-sidebar-foreground/70"
                      ),
                    })}
                    <span className="truncate">{label}</span>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Sistem & Platform Bölümü */}
          <div>
            <div className="px-2 pb-1.5 text-[11px] font-semibold text-sidebar-foreground/60 uppercase tracking-wider">
              Platform & Sistem
            </div>
            <div className="space-y-0.5">
              {systemLinks.map((item) => {
                const isActive = pathname === item.url;
                return (
                  <Link
                    key={item.url}
                    href={item.url}
                    onClick={handleClose}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-sidebar-accent text-sidebar-foreground font-semibold ring-1 ring-sidebar-border"
                        : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                    )}
                  >
                    {React.createElement(item.icon, {
                      className: cn(
                        "size-4 shrink-0",
                        isActive ? "text-primary dark:text-sidebar-primary" : "text-sidebar-foreground/70"
                      ),
                    })}
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>

        {/* Alt Bilgi — tema token'lariyla (light/dark ikisinde de okunur) */}
        <div className="shrink-0 border-t border-sidebar-border p-3 text-xs text-sidebar-foreground/70 flex items-center justify-between gap-3">
          <span className="shrink-0 font-semibold tracking-tight text-sidebar-foreground">{YULA.nameBrand}</span>
          <span className="truncate">{YULA.slogan}</span>
        </div>
      </SheetContent>
    </Sheet>
  );
}
