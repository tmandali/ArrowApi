"use client";

import * as React from "react";
import {
  PAGE_PANEL_COOKIE_NAME,
  PAGE_PANEL_STORAGE_KEY,
} from "@/lib/page-panel-constants";

export { PAGE_PANEL_COOKIE_NAME, PAGE_PANEL_STORAGE_KEY };

export interface RegisteredPagePanel {
  id: string;
  title: string;
  defaultOpen: boolean;
}

export interface PagePanelContextValue {
  registered: RegisteredPagePanel | null;
  /** Sayfa header trigger'ının varsayılan paneli: register edilmiş bir pane var mı? */
  hasRegisteredPane: boolean;
  openById: Record<string, boolean>;
  register: (panel: RegisteredPagePanel) => void;
  unregister: (id: string) => void;
  setOpen: (id: string, open: boolean) => void;
}

// Sayfa header trigger'ının varsayılan hedefi: BAĞIMSIZ sayfa pane'i.
// Ana nav menüyle (AppHeader "module-nav" drawer'ı) hiçbir bağlantısı yok.
export const DEFAULT_PAGE_PANEL: RegisteredPagePanel = {
  id: "page-pane",
  title: "Panel",
  defaultOpen: false,
};

export const PagePanelContext = React.createContext<PagePanelContextValue | null>(null);

export function usePagePanelContext(): PagePanelContextValue {
  const ctx = React.useContext(PagePanelContext);
  if (!ctx) {
    return {
      registered: DEFAULT_PAGE_PANEL,
      hasRegisteredPane: false,
      openById: {},
      register: () => {},
      unregister: () => {},
      setOpen: () => {},
    };
  }
  return ctx;
}
