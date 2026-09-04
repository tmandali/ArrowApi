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

const EMPTY_PINNED_ITEMS: PinnedMenuItem[] = [];

/** getSnapshot'ın referansı sabit kalmalı — aynı raw için önbelleklenir. */
let storedCache: { raw: string | null; items: PinnedMenuItem[] } | null = null;

function subscribePinnedItems(callback: () => void) {
  window.addEventListener(CHANGE_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(CHANGE_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

function getStoredPinnedItemsSnapshot(): PinnedMenuItem[] {
  const raw =
    typeof window === "undefined" ? null : localStorage.getItem(STORAGE_KEY);
  if (storedCache && storedCache.raw === raw) return storedCache.items;
  let items = EMPTY_PINNED_ITEMS;
  if (raw) {
    try {
      items = JSON.parse(raw) as PinnedMenuItem[];
    } catch (e) {
      console.warn("[usePinnedWorkspaceItems] Error reading localStorage:", e);
    }
  }
  storedCache = { raw, items };
  return items;
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
  // localStorage + özel event = dış store; useSyncExternalStore doğru primitiftir
  // (SSR'da boş, hydration güvenli, event'te otomatik tazelenir).
  const allPinnedItems = React.useSyncExternalStore(
    subscribePinnedItems,
    getStoredPinnedItemsSnapshot,
    () => EMPTY_PINNED_ITEMS,
  );

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
