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

  React.useEffect(() => {
    setOpenGroups((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const item of allItems) {
        const childActive = item.items?.some((subItem) => subItem.url === pathname) ?? false;
        if (childActive && !next[item.url]) {
          next[item.url] = true;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [pathname, allItems]);

  const toggleGroup = React.useCallback((url: string, open: boolean) => {
    setOpenGroups((prev) => (prev[url] === open ? prev : { ...prev, [url]: open }));
  }, []);

  const { toggleSidebar } = useSidebar();

  return (
    <Sidebar
      collapsible="icon"
      className={cn(
        "top-(--header-height) h-[calc(100svh-var(--header-height))] border-r border-border/60 bg-card/60 backdrop-blur-md z-20",
        className
      )}
    >
      <SidebarHeader className="h-10 flex-row items-center justify-between border-b border-border/40 px-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
        {/* Genişletilmiş mod: Sol tarafta ikon + başlık, sağda daraltma butonu */}
        <div className="flex min-w-0 items-center gap-2 group-data-[collapsible=icon]:hidden">
          {React.createElement(workspaceIconFor(activeWorkspaceId) ?? LayoutGrid, {
            className: "size-4 shrink-0 text-orange-600 dark:text-orange-400",
            "aria-hidden": true,
          })}
          <span className="truncate text-xs font-semibold tracking-tight text-foreground">
            {activeWsName}
          </span>
        </div>
        <button
          type="button"
          onClick={toggleSidebar}
          title="Menüyü Daralt"
          aria-label="Menüyü Daralt"
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground cursor-pointer group-data-[collapsible=icon]:hidden"
        >
          <PanelLeftClose className="size-4 shrink-0" aria-hidden />
        </button>

        {/* Küçültülmüş (İkon) modu: Genişlet ikonu yerine seçili workspace ikonu gösterilir, tıklandığında menüyü genişletir */}
        <div className="hidden group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:justify-center">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={toggleSidebar}
                aria-label={`${activeWsName} — Menüyü Genişlet`}
                className="flex size-8 items-center justify-center rounded-md text-orange-600 transition-colors hover:bg-sidebar-accent hover:text-orange-500 dark:text-orange-400 cursor-pointer"
              >
                {React.createElement(workspaceIconFor(activeWorkspaceId) ?? LayoutGrid, {
                  className: "size-4.5 shrink-0",
                  "aria-hidden": true,
                })}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" align="center">
              {activeWsName} (Menüyü Genişlet)
            </TooltipContent>
          </Tooltip>
        </div>
      </SidebarHeader>

      <SidebarContent className="p-1">
        <SidebarGroup className="p-0">
          <SidebarMenu>
            {items.map((item) => {
              const hasChildren = Boolean(item.items && item.items.length > 0);
              const isChildActive = item.items?.some(
                (subItem) => subItem.url === pathname
              );
              const title = localizedTitle(item.url, item.title);

              if (!hasChildren) {
                const isActive = item.url === pathname;
                return (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      tooltip={title}
                      className={cn(
                        "text-xs transition-colors",
                        isActive && "bg-primary/10 text-primary font-medium dark:bg-primary/15 dark:text-sidebar-primary ring-1 ring-primary/20 dark:ring-primary/30"
                      )}
                    >
                      <Link href={item.url}>
                        {React.createElement(item.icon, {
                          className: "size-4 shrink-0",
                          "aria-hidden": true,
                        })}
                        <span className="truncate">{title}</span>
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
                  className="group/collapsible"
                >
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton
                        tooltip={title}
                        isActive={isChildActive}
                        className={cn(
                          "text-xs transition-colors",
                          isChildActive && "font-medium text-foreground"
                        )}
                      >
                        {React.createElement(item.icon, {
                          className: "size-4 shrink-0",
                          "aria-hidden": true,
                        })}
                        <span className="truncate">{title}</span>
                        <ChevronRight className="ml-auto size-3.5 shrink-0 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90 group-data-[collapsible=icon]:hidden" />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub className="mr-0 border-l border-border/60 pl-3">
                        {item.items?.map((subItem) => {
                          const isSubActive = subItem.url === pathname;
                          const subTitle = localizedTitle(subItem.url, subItem.title);
                          return (
                            <SidebarMenuSubItem key={subItem.url}>
                              <SidebarMenuSubButton
                                asChild
                                isActive={isSubActive}
                                className={cn(
                                  "text-xs transition-colors",
                                  isSubActive && "bg-primary/10 text-primary font-medium dark:bg-primary/15 dark:text-sidebar-primary"
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
