"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { usePagePanelContext } from "@/context/page-panel-context";
import { ModuleNavMenu } from "@/components/layout/module-nav-menu";
import { cn } from "@/utils/cn";

/**
 * Ana nav menü çekmecesi (AppHeader seviyesi): menü içeriği asla itilmez,
 * solda kart olarak üstte açılır (overlay). AppHeader'daki başlık veya
 * Ctrl/⌘+B ile açılır; backdrop / Escape ile kapanır.
 *
 * Durum global PagePanel context'indeki "module-nav" panelinden yönetilir.
 * Bağımsız sayfa pane'leri (ModuleNavPane / "page-pane") ana nav menüyle
 * HİÇBİR bağlantı taşımaz: kendi panel id'lerini kullanırlar, AppHeader
 * başlığı yalnızca "module-nav" drawer'ını kontrol eder.
 *
 * Çekmece her zaman mounted kalır (translate ile gizlenir); böylece
 * aç/kapa geçişi sayfa içeriğini kaydırmaz.
 */
export function MainNavDrawer() {
  const t = useTranslations("ModuleNav");
  const { openById, setOpen } = usePagePanelContext();
  const open = openById["module-nav"] ?? false;

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
    <>
      {open ? (
        <button
          type="button"
          aria-label={t("close_menu")}
          onClick={() => setOpen("module-nav", false)}
          className="absolute inset-0 z-30 cursor-default bg-background/40 backdrop-blur-[1px]"
        />
      ) : null}
      <div
        className={cn(
          "absolute bottom-2 left-2 top-0 z-40 w-60 transition-transform duration-200 ease-out",
          open ? "translate-x-0" : "pointer-events-none -translate-x-[110%]"
        )}
        aria-hidden={!open}
        inert={!open}
      >
        <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-md border border-border/60 bg-card/80 shadow-lg backdrop-blur-md">
          <ModuleNavMenu />
        </div>
      </div>
    </>
  );
}
