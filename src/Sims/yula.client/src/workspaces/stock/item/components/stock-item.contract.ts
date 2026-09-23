import { z } from "zod";
import { defineScreenContract } from "@/lib/contracts/screen-contract";

export const StockItemSetFieldsInputSchema = z.object({
  maintainStock: z.boolean().optional(),
  disabled: z.boolean().optional(),
  allowAlternative: z.boolean().optional(),
  isZeroRated: z.boolean().optional(),
  isExempt: z.boolean().optional(),
  isFixedAsset: z.boolean().optional(),
});

export const StockItemSwitchTabInputSchema = z.object({
  tab: z.string(),
});

export const StockItemContract = defineScreenContract({
  screenId: "entity_form:stock_item",
  screenTitle: "Stok Kartı Detayı",
  workspace: "stock",
  category: "interactive_operator",
  aiEnabled: true,
  actions: {
    READ: {
      description: "Reads the current fields, toggles, and active tab of the item form.",
      inputSchema: z.object({}).optional(),
      whenToCall: "When inspecting the current state of the item details form.",
      whenNotToCall: "When modifying values.",
    },
    SWITCH_TAB: {
      description:
        "Switches the active tab in the item form ({ tab: 'details'|'dashboard'|'inventory'|'variants'|'accounting'|'purchasing'|'sales'|'tax'|'report'|'quality'|'manufacturing' }).",
      inputSchema: StockItemSwitchTabInputSchema,
      whenToCall: "When the user asks to switch to a specific tab of the item details.",
      whenNotToCall: "When the requested tab is already active.",
    },
    SET_FIELDS: {
      description:
        "Updates item master data attributes ({ maintainStock, disabled, allowAlternative, isZeroRated, isExempt, isFixedAsset }).",
      inputSchema: StockItemSetFieldsInputSchema,
      whenToCall:
        "When the user wants to enable/disable stock tracking, toggle exemption, or update item flags.",
      whenNotToCall: "When switching tabs or inspecting values.",
    },
  },
});

export type StockItemAction = keyof typeof StockItemContract.actions;
