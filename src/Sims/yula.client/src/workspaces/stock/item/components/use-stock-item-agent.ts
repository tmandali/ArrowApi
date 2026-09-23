"use client";

import { useTranslations } from "next-intl";
import { useScreenBinding } from "@/hooks/use-screen-binding";
import { itemContext } from "../item.context";

export type ItemFormTab =
  | "details"
  | "dashboard"
  | "inventory"
  | "variants"
  | "accounting"
  | "purchasing"
  | "sales"
  | "tax"
  | "report"
  | "quality"
  | "manufacturing";

export interface UseStockItemAgentOptions {
  activeTab: ItemFormTab;
  visibleTabs: Set<ItemFormTab>;
  maintainStock: boolean;
  disabled: boolean;
  allowAlternative: boolean;
  isZeroRated: boolean;
  isExempt: boolean;
  isFixedAsset: boolean;
  setActiveTab: (tab: ItemFormTab) => void;
  setMaintainStock: (val: boolean) => void;
  setDisabled: (val: boolean) => void;
  setAllowAlternative: (val: boolean) => void;
  setIsZeroRated: (val: boolean) => void;
  setIsExempt: (val: boolean) => void;
  setIsFixedAsset: (val: boolean) => void;
}

/**
 * Headless UI-Agent binding hook for Stock Item Form (`id: "entity_form:stock_item"`).
 */
export function useStockItemAgent({
  activeTab,
  visibleTabs,
  maintainStock,
  disabled,
  allowAlternative,
  isZeroRated,
  isExempt,
  isFixedAsset,
  setActiveTab,
  setMaintainStock,
  setDisabled,
  setAllowAlternative,
  setIsZeroRated,
  setIsExempt,
  setIsFixedAsset,
}: UseStockItemAgentOptions) {
  const t = useTranslations();

  useScreenBinding(itemContext.screen!, {
    t,
    state: {
      activeTab,
      maintainStock,
      disabled,
      allowAlternative,
      isZeroRated,
      isExempt,
      isFixedAsset,
    },
    getExitSnapshot: () => ({
      activeTab,
      maintainStock,
      disabled,
    }),
    runtimeMeta: {
      entity: "stock_item",
      screenTitle: "Stok Kartı Detayı",
      workspace: "stock",
      activeTab,
      maintainStock,
      disabled,
      allowAlternative,
      isZeroRated,
      isExempt,
      isFixedAsset,
    },
    handlers: {
      SWITCH_TAB: async (payload) => {
        const targetTab = payload?.tab as ItemFormTab;
        if (visibleTabs.has(targetTab)) {
          setActiveTab(targetTab);
          return { success: true, activeTab: targetTab, message: `Switched to tab ${targetTab}` };
        }
        return { success: false, error: `Tab '${payload?.tab}' is not available on this screen.` };
      },
      SET_FIELDS: async (payload) => {
        if (!payload) return { success: false, error: "Empty payload" };
        if (payload.maintainStock !== undefined) setMaintainStock(payload.maintainStock);
        if (payload.disabled !== undefined) setDisabled(payload.disabled);
        if (payload.allowAlternative !== undefined) setAllowAlternative(payload.allowAlternative);
        if (payload.isZeroRated !== undefined) setIsZeroRated(payload.isZeroRated);
        if (payload.isExempt !== undefined) setIsExempt(payload.isExempt);
        if (payload.isFixedAsset !== undefined) setIsFixedAsset(payload.isFixedAsset);
        return { success: true, updated: payload, message: "Item fields updated successfully." };
      },
      READ: async () => {
        return {
          success: true,
          activeTab,
          maintainStock,
          disabled,
          allowAlternative,
          isZeroRated,
          isExempt,
          isFixedAsset,
        };
      },
    },
  });
}
