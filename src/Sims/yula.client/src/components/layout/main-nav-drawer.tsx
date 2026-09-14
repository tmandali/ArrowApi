"use client";

import * as React from "react";
import { usePagePanelContext } from "@/context/page-panel-context";
import { ModuleNavMenu } from "@/components/layout/module-nav-menu";
import { cn } from "@/utils/cn";

/**
 * Ana nav menü çekmecesi: menü içeriği solda kart olarak süzülür.
 * Arka plan karartması (overlay / backdrop) kaldırılmıştır.
 * Dışarı tıklama veya Escape / Ctrl+B ile kapanır.
 */
export function MainNavDrawer() {
  const { openById, setOpen } = usePagePanelContext();
  const open = openById["module-nav"] ?? false;
  const drawerRef = React.useRef<HTMLDivElement>(null);

  // Dışarı tıklandığında menüyü kapatma (Overlay olmadan)
  React.useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
        const target = e.target as HTMLElement;
        if (target.closest('[data-slot="nav-menu-toggle"]')) return;
        setOpen("module-nav", false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open, setOpen]);

  // Ctrl+B / ⌘+B ile klavyeden menü açıp kapama
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        setOpen("module-nav", !open);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, setOpen]);

  // Escape ile kapatma
  React.useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen("module-nav", false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, setOpen]);

  return (
    <div
      ref={drawerRef}
      className={cn(
        "absolute bottom-2 left-2 top-0 z-40 w-60 transition-transform duration-200 ease-out",
        open ? "translate-x-0" : "pointer-events-none -translate-x-[110%]"
      )}
      aria-hidden={!open}
      inert={!open}
    >
      <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-md border border-border/60 bg-card/95 shadow-xl backdrop-blur-md">
        <ModuleNavMenu />
      </div>
    </div>
  );
}
