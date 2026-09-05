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
  openById: Record<string, boolean>;
  register: (panel: RegisteredPagePanel) => void;
  unregister: (id: string) => void;
  setOpen: (id: string, open: boolean) => void;
}

export const PagePanelContext = React.createContext<PagePanelContextValue | null>(null);

export function usePagePanelContext(): PagePanelContextValue {
  const ctx = React.useContext(PagePanelContext);
  if (!ctx) {
    return {
      registered: null,
      openById: {},
      register: () => {},
      unregister: () => {},
      setOpen: () => {},
    };
  }
  return ctx;
}
