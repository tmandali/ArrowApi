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

export const TAB_ITEMS: { value: ItemFormTab; labelKey: string }[] = [
  { value: "details", labelKey: "tab_details" },
  { value: "dashboard", labelKey: "tab_dashboard" },
  { value: "inventory", labelKey: "tab_inventory" },
  { value: "variants", labelKey: "tab_variants" },
  { value: "accounting", labelKey: "tab_accounting" },
  { value: "purchasing", labelKey: "tab_purchasing" },
  { value: "sales", labelKey: "tab_sales" },
  { value: "tax", labelKey: "tab_tax" },
  { value: "report", labelKey: "tab_report" },
  { value: "quality", labelKey: "tab_quality" },
  { value: "manufacturing", labelKey: "tab_manufacturing" },
];

export const PLACEHOLDER_TABS: ItemFormTab[] = [
  "dashboard",
  "inventory",
  "variants",
  "accounting",
  "purchasing",
  "sales",
  "quality",
  "manufacturing",
];
