import type { ComponentType } from "react"
import {
  BarChart2Icon,
  BoxIcon,
  LayoutDashboardIcon,
  Package,
  ReceiptIcon,
  ScaleIcon,
  SendIcon,
  TruckIcon,
} from "lucide-react"
import { emptyModulePath } from "@/lib/workspace-paths"

const e = emptyModulePath

export type KpiTone = "primary" | "orange"

export const kpiToneClassName: Record<
  KpiTone,
  { title: string; value: string }
> = {
  primary: {
    title: "text-primary dark:text-sidebar-primary",
    value: "text-primary dark:text-sidebar-primary",
  },
  orange: {
    title: "text-orange-700 dark:text-orange-400",
    value: "text-orange-700 dark:text-orange-400",
  },
}

export const kpiCards = [
  {
    titleKey: "kpi_total_stock_value",
    value: "3.510 L",
    changeKey: "kpi_change_yesterday",
    trend: "flat" as const,
    tone: "primary" as const satisfies KpiTone,
  },
  {
    titleKey: "kpi_total_warehouses",
    value: "5",
    changeKey: "kpi_change_last_month",
    trend: "flat" as const,
    tone: "orange" as const satisfies KpiTone,
  },
  {
    titleKey: "kpi_total_active_items",
    value: "37",
    changeKey: "kpi_change_106_last_month",
    trend: "up" as const,
    tone: "primary" as const satisfies KpiTone,
  },
]

export const badgeToneClassName = {
  success:
    "border-transparent bg-orange-500/15 text-orange-700 hover:bg-orange-500/15 dark:text-orange-400",
  warning:
    "border-transparent bg-amber-500/10 text-amber-700 hover:bg-amber-500/10 dark:text-amber-400",
  neutral: "",
} as const

export type ShortcutItem = {
  titleKey: string
  url: string
  icon: ComponentType<{ className?: string; "data-icon"?: string }>
  badge?: { label: string; tone: "success" | "warning" | "neutral" }
}

export const shortcuts: ShortcutItem[] = [
  {
    titleKey: "sc_item",
    url: "/stock/item",
    icon: Package,
    badge: { label: "37", tone: "success" },
  },
  {
    titleKey: "sc_material_request",
    url: e("stock", "Material Request"),
    icon: SendIcon,
    badge: { label: "Draft 2", tone: "warning" },
  },
  {
    titleKey: "sc_stock_entry",
    url: e("stock", "Stock Entry"),
    icon: BoxIcon,
  },
  {
    titleKey: "sc_purchase_receipt",
    url: e("stock", "Purchase Receipt"),
    icon: ReceiptIcon,
  },
  {
    titleKey: "sc_delivery_note",
    url: e("stock", "Delivery Note"),
    icon: TruckIcon,
  },
  {
    titleKey: "sc_stock_ledger",
    url: "/stock/stock-ledger",
    icon: LayoutDashboardIcon,
  },
  {
    titleKey: "sc_stock_balance",
    url: "/stock/stock-balance",
    icon: ScaleIcon,
  },
  {
    titleKey: "sc_stock_analytics",
    url: "/stock/stock-analytics",
    icon: BarChart2Icon,
  },
]

export type FeatureLink = {
  titleKey: string
  url: string
}

export type FeatureSection = {
  titleLeadKey: string
  titleTrailKey: string
  visual: "catalogue" | "setup" | "reports" | "tools"
  links: FeatureLink[]
}

export const featureSections: FeatureSection[] = [
  {
    titleLeadKey: "sec_items",
    titleTrailKey: "sec_catalogue",
    visual: "catalogue",
    links: [
      { titleKey: "sc_item", url: "/stock/item" },
      { titleKey: "sc_item_group", url: e("stock", "Item Group") },
      { titleKey: "sc_product_bundle", url: e("stock", "Product Bundle") },
      { titleKey: "sc_item_price", url: e("stock", "Item Price") },
      { titleKey: "sc_shipping_rule", url: e("stock", "Shipping Rule") },
      { titleKey: "sc_pricing_rule", url: e("stock", "Pricing Rule") },
      { titleKey: "sc_item_alternative", url: e("stock", "Item Alternative") },
      { titleKey: "sc_item_manufacturer", url: e("stock", "Item Manufacturer") },
    ],
  },
  {
    titleLeadKey: "sec_stock",
    titleTrailKey: "sec_transactions",
    visual: "catalogue",
    links: [
      { titleKey: "sc_material_request", url: e("stock", "Material Request") },
      { titleKey: "sc_stock_entry", url: e("stock", "Stock Entry") },
      { titleKey: "sc_delivery_note", url: e("stock", "Delivery Note") },
      { titleKey: "sc_purchase_receipt", url: e("stock", "Purchase Receipt") },
      { titleKey: "sc_pick_list", url: e("stock", "Pick List") },
      { titleKey: "sc_delivery_trip", url: e("stock", "Delivery Trip") },
    ],
  },
  {
    titleLeadKey: "sec_stock",
    titleTrailKey: "sec_reports",
    visual: "reports",
    links: [
      { titleKey: "sc_stock_ledger", url: "/stock/stock-ledger" },
      { titleKey: "sc_stock_balance", url: "/stock/stock-balance" },
      { titleKey: "sc_retail_sales", url: "/stock/retail-sales-report" },
      { titleKey: "sc_stock_projected_qty", url: e("stock", "Stock Projected Qty") },
      { titleKey: "sc_stock_summary", url: e("stock", "Stock Summary") },
      { titleKey: "sc_stock_ageing", url: e("stock", "Stock Ageing") },
      { titleKey: "sc_item_price_stock", url: e("stock", "Item Price Stock") },
      {
        titleKey: "sc_warehouse_wise_stock_balance",
        url: e("stock", "Warehouse Wise Stock Balance"),
      },
    ],
  },
  {
    titleLeadKey: "sec_stock",
    titleTrailKey: "sec_settings",
    visual: "setup",
    links: [
      { titleKey: "sc_stock_settings", url: e("stock", "Stock Settings") },
      { titleKey: "sc_warehouse", url: e("stock", "Warehouse") },
      { titleKey: "sc_unit_of_measure", url: e("stock", "Unit of Measure") },
      {
        titleKey: "sc_item_variant_settings",
        url: e("stock", "Item Variant Settings"),
      },
      { titleKey: "sc_brand", url: e("stock", "Brand") },
      { titleKey: "sc_item_attribute", url: e("stock", "Item Attribute") },
      {
        titleKey: "sc_uom_conversion_factor",
        url: e("stock", "UOM Conversion Factor"),
      },
    ],
  },
  {
    titleLeadKey: "sec_serial",
    titleTrailKey: "sec_and_batch",
    visual: "setup",
    links: [
      { titleKey: "sc_serial_no", url: e("stock", "Serial No") },
      { titleKey: "sc_batch", url: e("stock", "Batch") },
      {
        titleKey: "sc_serial_batch_traceability",
        url: "/stock/serial-batch-traceability",
      },
      { titleKey: "sc_serial_no_ledger", url: e("stock", "Serial No Ledger") },
      { titleKey: "sc_installation_note", url: e("stock", "Installation Note") },
      {
        titleKey: "sc_serial_no_service_contract_expiry",
        url: e("stock", "Serial No Service Contract Expiry"),
      },
      { titleKey: "sc_serial_no_status", url: e("stock", "Serial No Status") },
      {
        titleKey: "sc_serial_no_warranty_expiry",
        url: e("stock", "Serial No Warranty Expiry"),
      },
    ],
  },
  {
    titleLeadKey: "sec_stock",
    titleTrailKey: "sec_tools",
    visual: "tools",
    links: [
      {
        titleKey: "sc_stock_reconciliation",
        url: e("stock", "Stock Reconciliation"),
      },
      { titleKey: "sc_landed_cost_voucher", url: "/landed-cost-voucher" },
      { titleKey: "sc_packing_slip", url: e("stock", "Packing Slip") },
      {
        titleKey: "sc_quality_inspection",
        url: e("stock", "Quality Inspection"),
      },
      {
        titleKey: "sc_quality_inspection_template",
        url: e("stock", "Quality Inspection Template"),
      },
      {
        titleKey: "sc_quick_stock_balance",
        url: e("stock", "Quick Stock Balance"),
      },
    ],
  },
  {
    titleLeadKey: "sec_key",
    titleTrailKey: "sec_reports",
    visual: "reports",
    links: [
      { titleKey: "sc_stock_analytics", url: "/stock/stock-analytics" },
      {
        titleKey: "sc_delivery_note_trends",
        url: e("stock", "Delivery Note Trends"),
      },
      {
        titleKey: "sc_purchase_receipt_trends",
        url: e("stock", "Purchase Receipt Trends"),
      },
      {
        titleKey: "sc_sales_order_analysis",
        url: e("stock", "Sales Order Analysis"),
      },
      {
        titleKey: "sc_purchase_order_analysis",
        url: e("stock", "Purchase Order Analysis"),
      },
      {
        titleKey: "sc_item_shortage_report",
        url: e("stock", "Item Shortage Report"),
      },
      {
        titleKey: "sc_batch_wise_balance_history",
        url: e("stock", "Batch-Wise Balance History"),
      },
    ],
  },
  {
    titleLeadKey: "sec_other",
    titleTrailKey: "sec_reports",
    visual: "reports",
    links: [
      {
        titleKey: "sc_requested_items_to_be_transferred",
        url: e("stock", "Requested Items To Be Transferred"),
      },
      {
        titleKey: "sc_requested_items_to_order_and_receive",
        url: e("stock", "Requested Items To Order and Receive"),
      },
      {
        titleKey: "sc_batch_item_expiry_status",
        url: e("stock", "Batch Item Expiry Status"),
      },
      { titleKey: "sc_item_prices", url: e("stock", "Item Prices") },
      {
        titleKey: "sc_itemwise_recommended_reorder_level",
        url: e("stock", "Itemwise Recommended Reorder Level"),
      },
      {
        titleKey: "sc_item_variant_details",
        url: e("stock", "Item Variant Details"),
      },
      {
        titleKey: "sc_subcontracted_raw_materials_to_be_transferred",
        url: e("stock", "Subcontracted Raw Materials To Be Transferred"),
      },
      {
        titleKey: "sc_subcontracted_item_to_be_received",
        url: e("stock", "Subcontracted Item To Be Received"),
      },
      { titleKey: "sc_bom_stock_report", url: e("stock", "BOM Stock Report") },
      {
        titleKey: "sc_stock_entry_details",
        url: e("stock", "Stock Entry Details"),
      },
      {
        titleKey: "sc_purchase_selling_price_history",
        url: e("stock", "Purchase Selling Price History"),
      },
      { titleKey: "sc_item_availability", url: e("stock", "Item Availability") },
      {
        titleKey: "sc_product_bundle_details",
        url: e("stock", "Product Bundle Details"),
      },
      {
        titleKey: "sc_stock_and_account_value_comparison",
        url: e("stock", "Stock and Account Value Comparison"),
      },
      {
        titleKey: "sc_warehouse_wise_item_balance",
        url: e("stock", "Warehouse Wise Item Balance"),
      },
      {
        titleKey: "sc_total_stock_summary",
        url: e("stock", "Total Stock Summary"),
      },
      {
        titleKey: "sc_stock_qty_vs_serial_no_count",
        url: e("stock", "Stock Qty vs Serial No Count"),
      },
    ],
  },
]
