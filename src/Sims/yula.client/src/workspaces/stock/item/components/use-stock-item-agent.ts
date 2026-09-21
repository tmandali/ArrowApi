"use client";

import { useAgentComponent } from "@my-agent/react";
import type { ActionContract } from "@my-agent/core";
import { z } from "zod";

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

export const STOCK_ITEM_SET_FIELDS_CONTRACT = {
  description:
    "Updates item master data attributes ({ maintainStock, disabled, allowAlternative, isZeroRated, isExempt, isFixedAsset }).",
  inputSchema: z.object({
    maintainStock: z.boolean().optional(),
    disabled: z.boolean().optional(),
    allowAlternative: z.boolean().optional(),
    isZeroRated: z.boolean().optional(),
    isExempt: z.boolean().optional(),
    isFixedAsset: z.boolean().optional(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    updated: z.record(z.string(), z.any()).optional(),
    message: z.string().optional(),
    error: z.string().optional(),
  }),
  whenToCall:
    "When the user wants to enable/disable stock tracking, toggle exemption, or update item flags.",
  whenNotToCall: "When switching tabs or inspecting values.",
} satisfies ActionContract;

export const STOCK_ITEM_SWITCH_TAB_CONTRACT = {
  description:
    "Switches the active tab in the item form ({ tab: 'details'|'dashboard'|'inventory'|'variants'|'accounting'|'purchasing'|'sales'|'tax'|'report'|'quality'|'manufacturing' }).",
  inputSchema: z.object({
    tab: z.string(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    activeTab: z.string().optional(),
    message: z.string().optional(),
    error: z.string().optional(),
  }),
  whenToCall: "When the user asks to switch to a specific tab of the item details.",
  whenNotToCall: "When the requested tab is already active.",
} satisfies ActionContract;

export const STOCK_ITEM_READ_CONTRACT = {
  description: "Reads the current fields, toggles, and active tab of the item form.",
  inputSchema: z.object({}).optional(),
  outputSchema: z.object({
    success: z.boolean(),
    activeTab: z.string(),
    maintainStock: z.boolean(),
    disabled: z.boolean(),
    allowAlternative: z.boolean(),
    isZeroRated: z.boolean(),
    isExempt: z.boolean(),
    isFixedAsset: z.boolean(),
  }),
  whenToCall: "When inspecting the current state of the item details form.",
  whenNotToCall: "When modifying values.",
} satisfies ActionContract;

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
  useAgentComponent({
    id: "entity_form:stock_item",
    meta: {
      entity: "stock_item",
      screenTitle: "Item Details",
      workspace: "stock",
      activeTab,
      maintainStock,
      disabled,
      allowAlternative,
      isZeroRated,
      isExempt,
      isFixedAsset,
    },
    actions: {
      SET_FIELDS: STOCK_ITEM_SET_FIELDS_CONTRACT,
      SWITCH_TAB: STOCK_ITEM_SWITCH_TAB_CONTRACT,
      READ: STOCK_ITEM_READ_CONTRACT,
    },
    handlers: {
      SWITCH_TAB: async (payload) => {
        const targetTab = payload.tab as ItemFormTab;
        if (visibleTabs.has(targetTab)) {
          setActiveTab(targetTab);
          return { success: true, activeTab: targetTab, message: `Switched to tab ${targetTab}` };
        }
        return { success: false, error: `Tab '${payload.tab}' is not available on this screen.` };
      },
      SET_FIELDS: async (payload) => {
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
