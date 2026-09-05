"use client";

import * as React from "react";
import {
  PAGE_PANEL_COOKIE_NAME,
  PAGE_PANEL_STORAGE_KEY,
  PagePanelContext,
  type PagePanelContextValue,
  type RegisteredPagePanel,
} from "./page-panel-context";

function writePanelCookie(state: Record<string, boolean>) {
  if (typeof document === "undefined") return;
  try {
    const json = JSON.stringify(state);
    // 1 yıl geçerli cookie — SSR aşamasında Next.js tarafından okunur
    document.cookie = `${PAGE_PANEL_COOKIE_NAME}=${encodeURIComponent(
      json
    )}; path=/; max-age=31536000; SameSite=Lax`;
    // localStorage'a da yedek olarak kaydet
    window.localStorage.setItem(
      PAGE_PANEL_STORAGE_KEY,
      JSON.stringify({ state: { openById: state } })
    );
  } catch {
    // Storage/cookie engellenmişse sessizce devam et
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
    null
  );

  const [openById, setOpenById] = React.useState<Record<string, boolean>>(() => {
    if (Object.keys(initialOpenById).length > 0) return initialOpenById;
    if (typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem(PAGE_PANEL_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          const stored = parsed?.state?.openById || parsed?.openById;
          if (stored && typeof stored === "object") {
            return stored;
          }
        }
      } catch {}
    }
    return initialOpenById;
  });

  React.useEffect(() => {
    if (
      Object.keys(initialOpenById).length === 0 &&
      Object.keys(openById).length > 0
    ) {
      writePanelCookie(openById);
    }
  }, [initialOpenById, openById]);

  const register = React.useCallback((panel: RegisteredPagePanel) => {
    setRegistered(panel);
  }, []);

  const unregister = React.useCallback((id: string) => {
    setRegistered((current) => (current?.id === id ? null : current));
  }, []);

  const setOpen = React.useCallback((id: string, open: boolean) => {
    setOpenById((prev) => {
      const next = { ...prev, [id]: open };
      writePanelCookie(next);
      return next;
    });
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
