"use client";

import * as React from "react";

export interface PinnedMenuItem {
  id: string;
  title: string;
  titleTr?: string;
  url: string;
  category: string;
  workspace: string;
}

const STORAGE_KEY = "yula_pinned_menu_items";
const CHANGE_EVENT = "yula-pinned-items-change";

function getStoredPinnedItems(): PinnedMenuItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as PinnedMenuItem[];
  } catch (e) {
    console.warn("[usePinnedWorkspaceItems] Error reading localStorage:", e);
    return [];
  }
}

function saveStoredPinnedItems(items: PinnedMenuItem[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: items }));
  } catch (e) {
    console.warn("[usePinnedWorkspaceItems] Error saving localStorage:", e);
  }
}

export function usePinnedWorkspaceItems(workspace?: string) {
  const [allPinnedItems, setAllPinnedItems] = React.useState<PinnedMenuItem[]>([]);

  React.useEffect(() => {
    setAllPinnedItems(getStoredPinnedItems());

    const handleSync = () => {
      setAllPinnedItems(getStoredPinnedItems());
    };

    window.addEventListener(CHANGE_EVENT, handleSync);
    window.addEventListener("storage", handleSync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, handleSync);
      window.removeEventListener("storage", handleSync);
    };
  }, []);

  const pinnedItems = React.useMemo(() => {
    if (!workspace || workspace === "all" || workspace === "system") {
      return allPinnedItems;
    }
    return allPinnedItems.filter((item) => {
      if (item.workspace === workspace) return true;
      if (workspace === "selling" && item.workspace === "subcontracting") return true;
      if (workspace === "subcontracting" && item.workspace === "selling") return true;
      if (workspace === "financial-reports" && item.workspace === "accounting") return true;
      return false;
    });
  }, [allPinnedItems, workspace]);

  const isPinned = React.useCallback(
    (id: string) => {
      return allPinnedItems.some((item) => item.id === id);
    },
    [allPinnedItems]
  );

  const pinItem = React.useCallback((item: PinnedMenuItem) => {
    const current = getStoredPinnedItems();
    if (!current.some((i) => i.id === item.id)) {
      const next = [...current, item];
      saveStoredPinnedItems(next);
    }
  }, []);

  const unpinItem = React.useCallback((id: string) => {
    const current = getStoredPinnedItems();
    const next = current.filter((i) => i.id !== id);
    saveStoredPinnedItems(next);
  }, []);

  const togglePin = React.useCallback((item: PinnedMenuItem) => {
    const current = getStoredPinnedItems();
    const exists = current.some((i) => i.id === item.id);
    if (exists) {
      saveStoredPinnedItems(current.filter((i) => i.id !== item.id));
    } else {
      saveStoredPinnedItems([...current, item]);
    }
  }, []);

  return {
    pinnedItems,
    allPinnedItems,
    isPinned,
    pinItem,
    unpinItem,
    togglePin,
  };
}
