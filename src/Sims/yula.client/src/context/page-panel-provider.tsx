"use client";

import * as React from "react";
import {
  PAGE_PANEL_COOKIE_NAME,
  PAGE_PANEL_STORAGE_KEY,
  DEFAULT_PAGE_PANEL,
  PagePanelContext,
  type PagePanelContextValue,
  type RegisteredPagePanel,
} from "./page-panel-context";

// Eski oturumlardan kalan panel cookie ve localStorage kayıtlarını temizle
if (typeof document !== "undefined") {
  try {
    document.cookie = `${PAGE_PANEL_COOKIE_NAME}=; path=/; max-age=0; SameSite=Lax`;
    window.localStorage.removeItem(PAGE_PANEL_STORAGE_KEY);
  } catch {
    // yoksay
  }
}

export function PagePanelProvider({
  children,
  initialOpenById = {},
}: {
  children: React.ReactNode;
  initialOpenById?: Record<string, boolean>;
}) {
  const [registered, setRegistered] = React.useState<RegisteredPagePanel | null>(
    DEFAULT_PAGE_PANEL
  );

  const [openById, setOpenById] = React.useState<Record<string, boolean>>(
    () => initialOpenById
  );

  const register = React.useCallback((panel: RegisteredPagePanel) => {
    setRegistered(panel);
  }, []);

  const unregister = React.useCallback((id: string) => {
    setRegistered((current) => (current?.id === id ? DEFAULT_PAGE_PANEL : current));
  }, []);

  const setOpen = React.useCallback((id: string, open: boolean) => {
    setOpenById((prev) => ({ ...prev, [id]: open }));
  }, []);

  const value = React.useMemo<PagePanelContextValue>(
    () => ({
      registered,
      openById,
      register,
      unregister,
      setOpen,
    }),
    [registered, openById, register, unregister, setOpen]
  );

  return (
    <PagePanelContext.Provider value={value}>
      {children}
    </PagePanelContext.Provider>
  );
}

