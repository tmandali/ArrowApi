"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { ChevronRight, LayoutGrid, PanelLeftClose } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { getWorkspaceNavForPath } from "@/lib/workspace-registry";
import { useEffectiveRole } from "@/features/auth/lib/use-effective-role";
import { useNavTitleLocalizer } from "@/components/layout/module-nav-menu";
import { workspaceIconFor } from "@/components/layout/workspace-brand";
import { useActiveWorkspaceId } from "@/hooks/use-active-workspace";
import { cn } from "@/utils/cn";
import type { WorkspaceId } from "@/types";

export function ModuleSidebar({ className }: { className?: string }) {
  const pathname = usePathname();
  const { status: sessionStatus } = useSession();
  const { ready: roleReady, isAdmin } = useEffectiveRole();
  const activeWorkspaceId = useActiveWorkspaceId();
  const tHeader = useTranslations("AppHeader");
  const tRail = useTranslations("WorkspaceRail");
  const localizedTitle = useNavTitleLocalizer(pathname);

  const activeWsName = activeWorkspaceId
    ? (tHeader.has(`workspace_${activeWorkspaceId}` as `workspace_${WorkspaceId}`)
        ? tHeader(`workspace_${activeWorkspaceId}` as `workspace_${WorkspaceId}`)
        : (tRail.has(activeWorkspaceId) ? tRail(activeWorkspaceId) : activeWorkspaceId))
    : (tRail.has("workspaces") ? tRail("workspaces") : "Menü");

  const allItems = getWorkspaceNavForPath(pathname);
  const items = allItems.filter(
    (item) => !item.adminOnly || (sessionStatus === "authenticated" && roleReady && isAdmin)
  );

  const [openGroups, setOpenGroups] = React.useState<Record<string, boolean>>({});

  const toggleGroup = React.useCallback((url: string, open: boolean) => {
    setOpenGroups((prev) => (prev[url] === open ? prev : { ...prev, [url]: open }));
  }, []);

  const { toggleSidebar, state } = useSidebar();

  return (
    <Sidebar
      collapsible="icon"
      className={cn(
        "top-(--header-height) h-[calc(100svh-var(--header-height))] border-none group-data-[side=left]:border-none border-r-0 bg-[#13151b] z-20 transition-[width] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] overflow-hidden",
        className
      )}
      style={
        {
          "--sidebar": "#13151b",
          "--sidebar-foreground": "#e5e7eb",
          "--sidebar-border": "transparent",
          "--sidebar-accent": "rgba(255, 255, 255, 0.08)",
          "--sidebar-accent-foreground": "#ffffff",
          "--sidebar-primary": "oklch(0.623 0.214 259.815)",
          "--sidebar-primary-foreground": "#ffffff",
        } as React.CSSProperties
      }
    >
      <SidebarHeader className="h-12 flex-row items-center overflow-hidden border-none px-2">
        {/* Workspace ikonu: Hem açıkken hem kapalıyken sol 8px noktasında sabit durur, asla zıplamaz */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={toggleSidebar}
              aria-label={`${activeWsName} — Menüyü Aç / Kapat`}
              className="flex size-8 shrink-0 items-center justify-center rounded-lg text-orange-400 transition-colors hover:bg-white/10 hover:text-orange-300 cursor-pointer"
            >
              {React.createElement(workspaceIconFor(activeWorkspaceId) ?? LayoutGrid, {
                className: "size-4.5 shrink-0",
                "aria-hidden": true,
              })}
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" align="center" hidden={state !== "collapsed"}>
            {activeWsName} (Menüyü Genişlet)
          </TooltipContent>
        </Tooltip>

        {/* Başlık ve daraltma butonu: Açıkken görünür, daralırken pürüzsüzce silinir */}
        <div className="flex min-w-0 flex-1 items-center justify-between pl-2 transition-opacity duration-200 group-data-[collapsible=icon]:opacity-0 group-data-[collapsible=icon]:pointer-events-none">
          <span className="truncate text-xs font-semibold tracking-tight text-white">
            {activeWsName}
          </span>
          <button
            type="button"
            onClick={toggleSidebar}
            title="Menüyü Daralt"
            aria-label="Menüyü Daralt"
            className="flex size-7 items-center justify-center rounded-md text-white/60 transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
          >
            <PanelLeftClose className="size-4 shrink-0" aria-hidden />
          </button>
        </div>
      </SidebarHeader>

      <SidebarContent className="overflow-x-hidden px-0">
        <SidebarGroup className="px-2">
          <SidebarMenu className="gap-1">
            {items.map((item) => {
              const hasChildren = Boolean(item.items && item.items.length > 0);
              const isChildActive = item.items?.some(
                (subItem) => subItem.url === pathname
              );
              const title = localizedTitle(item.url, item.title);

              if (!hasChildren) {
                const isActive = item.url === pathname;
                return (
                  <SidebarMenuItem key={item.url} className="relative">
                    {/* Seçili durumda sol kenarda beliren mavi gösterge çizgisi */}
                    <span
                      aria-hidden
                      className={cn(
                        "absolute top-1/2 -left-1.5 h-5 w-1 -translate-y-1/2 rounded-full bg-primary z-10 transition-opacity duration-200 pointer-events-none",
                        isActive ? "group-data-[collapsible=icon]:opacity-100 opacity-0" : "opacity-0"
                      )}
                    />
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      tooltip={title}
                      className={cn(
                        "relative text-xs transition-colors",
                        isActive
                          ? "bg-white/10 text-primary font-medium ring-1 ring-white/15 group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:ring-0 group-data-[collapsible=icon]:text-primary"
                          : "text-white/70 hover:bg-white/8 hover:text-white"
                      )}
                    >
                      <Link href={item.url} className="flex items-center gap-2">
                        {React.createElement(item.icon, {
                          className: cn(
                            "size-4.5 shrink-0 transition-colors",
                            isActive ? "text-primary" : "text-white/70"
                          ),
                          "aria-hidden": true,
                        })}
                        <span className="truncate transition-opacity duration-200 group-data-[collapsible=icon]:opacity-0">
                          {title}
                        </span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              }

              return (
                <Collapsible
                  key={item.url}
                  open={openGroups[item.url] ?? Boolean(isChildActive)}
                  onOpenChange={(open) => toggleGroup(item.url, open)}
                  className="group/collapsible relative w-full"
                >
                  <SidebarMenuItem className="relative">
                    {/* Seçili durumda sol kenarda beliren mavi gösterge çizgisi */}
                    <span
                      aria-hidden
                      className={cn(
                        "absolute top-1/2 -left-1.5 h-5 w-1 -translate-y-1/2 rounded-full bg-primary z-10 transition-opacity duration-200 pointer-events-none",
                        isChildActive ? "group-data-[collapsible=icon]:opacity-100 opacity-0" : "opacity-0"
                      )}
                    />
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton
                        tooltip={title}
                        isActive={isChildActive}
                        className={cn(
                          "relative text-xs transition-colors",
                          isChildActive
                            ? "font-medium text-white group-data-[collapsible=icon]:text-primary group-data-[collapsible=icon]:bg-transparent"
                            : "text-white/70 hover:bg-white/8 hover:text-white"
                        )}
                      >
                        {React.createElement(item.icon, {
                          className: cn(
                            "size-4.5 shrink-0 transition-colors",
                            isChildActive ? "text-primary" : "text-white/70"
                          ),
                          "aria-hidden": true,
                        })}
                        <span className="truncate transition-opacity duration-200 group-data-[collapsible=icon]:opacity-0">
                          {title}
                        </span>
                        <ChevronRight className="ml-auto size-3.5 shrink-0 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90 group-data-[collapsible=icon]:hidden text-white/50" />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub className="mr-0 border-l border-[#232734] pl-3">
                        {item.items?.map((subItem) => {
                          const isSubActive = subItem.url === pathname;
                          const subTitle = localizedTitle(subItem.url, subItem.title);
                          return (
                            <SidebarMenuSubItem key={subItem.url}>
                              <SidebarMenuSubButton
                                asChild
                                isActive={isSubActive}
                                className={cn(
                                  "text-xs text-white/70 transition-colors hover:bg-white/8 hover:text-white",
                                  isSubActive && "bg-white/10 text-white font-medium"
                                )}
                              >
                                <Link href={subItem.url}>
                                  <span className="truncate">{subTitle}</span>
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          );
                        })}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </Collapsible>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarRail />
    </Sidebar>
  );
}
