"use client";

import { usePathname } from "next/navigation";
import * as React from "react"
import { isWorkspaceHomePath } from "@/lib/workspace-paths"
import { useYulaDockStore } from "@/lib/stores/dock"
import {
  WorkspaceAiChatContext,
  type WorkspaceAiChatContextValue,
} from "./workspace-ai-chat-context"

/**
 * Checks if a clicked element is strictly an internal IDE interaction
 * that must NEVER collapse the fullscreen IDE overlay (e.g. session selection,
 * folder toggles, diagram controls, chat composer).
 */
function isIdeInternalAction(target: HTMLElement): boolean {
  return Boolean(
    target.closest(
      '[data-ide-action="true"], [data-slot="ide-conversation-item"], [data-slot="ide-folder-toggle"], [data-slot="ide-control"], [data-slot="ide-tab"], [data-slot="chat-composer"]',
    ),
  );
}

/**
 * Checks if a clicked element represents a user navigation intent towards
 * an application screen.
 */
function isScreenNavigationClick(target: HTMLElement): {
  isNav: boolean;
  isHome: boolean;
} {
  if (isIdeInternalAction(target)) {
    return { isNav: false, isHome: false };
  }

  // Collapsible toggle in sidebar only toggles a folder, does not navigate to a screen
  if (
    target.closest(
      '[data-slot="collapsible-trigger"], [data-sidebar="group-action"]',
    )
  ) {
    return { isNav: false, isHome: false };
  }

  // Anchor links (<a href="...">)
  const anchor = target.closest("a");
  if (anchor) {
    const href = anchor.getAttribute("href");
    if (href) {
      const isExternal =
        href.startsWith("http://") ||
        href.startsWith("https://") ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:") ||
        href.startsWith("#") ||
        anchor.getAttribute("target") === "_blank" ||
        anchor.hasAttribute("download");

      if (!isExternal) {
        return { isNav: true, isHome: isWorkspaceHomePath(href) };
      }
    }
  }

  // Elements explicitly marked as screen navigation buttons or sidebar menu items
  const navBtn = target.closest(
    '[data-nav="screen"], [data-slot="sidebar-menu-button"], [data-slot="sidebar-menu-sub-button"], [data-slot="workspace-item"]',
  );
  if (navBtn) {
    const hrefAttr = navBtn.getAttribute("data-href") || navBtn.getAttribute("href");
    return { isNav: true, isHome: hrefAttr ? isWorkspaceHomePath(hrefAttr) : false };
  }

  return { isNav: false, isHome: false };
}

export function WorkspaceAiChatProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const sideDockAllowed = true;

  const open = useYulaDockStore((s) => s.open);
  const setOpenStore = useYulaDockStore((s) => s.setOpen);
  const expanded = useYulaDockStore((s) => s.expanded);
  const setExpandedStore = useYulaDockStore((s) => s.setExpanded);

  const pathname = usePathname();
  const prevPathnameRef = React.useRef(pathname);

  // Route change listener
  React.useEffect(() => {
    if (prevPathnameRef.current !== pathname) {
      prevPathnameRef.current = pathname;
      // Rota değiştiğinde tam ekran overlay modunu kapat
      setExpandedStore(false);

      // Ana sayfaya dönüldüyse dock'u da kapat (ana sayfa kendi görünümünü kullanır)
      if (isWorkspaceHomePath(pathname)) {
        setOpenStore(false);
      }
    }
  }, [pathname, setExpandedStore, setOpenStore]);

  // Universal click capture listener: collapses fullscreen overlay when user clicks any screen navigation element
  React.useEffect(() => {
    if (!expanded) return;

    const handleGlobalCaptureClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;

      const { isNav, isHome } = isScreenNavigationClick(target);
      if (isNav) {
        setExpandedStore(false);
        if (isHome) {
          setOpenStore(false);
        }
      }
    };

    document.addEventListener("click", handleGlobalCaptureClick, true);
    return () => {
      document.removeEventListener("click", handleGlobalCaptureClick, true);
    };
  }, [expanded, setExpandedStore, setOpenStore]);

  const setOpen = React.useCallback(
    (next: boolean) => {
      setOpenStore(next)
      if (!next) {
        setExpandedStore(false)
      }
    },
    [setOpenStore, setExpandedStore]
  )

  const setExpanded = React.useCallback(
    (next: boolean) => {
      setExpandedStore(next)
    },
    [setExpandedStore]
  )

  const toggleExpanded = React.useCallback(() => {
    setExpandedStore(!expanded)
  }, [expanded, setExpandedStore])

  const value = React.useMemo<WorkspaceAiChatContextValue>(
    () => ({
      open,
      setOpen,
      toggle: () => setOpen(!open),
      expanded: open && expanded,
      setExpanded,
      toggleExpanded,
      sideDockAllowed,
    }),
    [
      open,
      setOpen,
      expanded,
      setExpanded,
      toggleExpanded,
      sideDockAllowed,
    ]
  )

  return (
    <WorkspaceAiChatContext.Provider value={value}>
      {children}
    </WorkspaceAiChatContext.Provider>
  )
}
