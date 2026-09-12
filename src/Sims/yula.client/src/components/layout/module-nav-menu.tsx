"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  getWorkspaceForPath,
  getWorkspaceNavForPath,
} from "@/lib/workspace-registry";
import { useEffectiveRole } from "@/features/auth/lib/use-effective-role";
import { cn } from "@/utils/cn";

/**
 * Sistem workspace nav URL'leri → `SystemNav` mesaj anahtarı.
 */
const SYSTEM_NAV_KEYS: Record<string, string> = {
  "/": "home",
  "/my/settings": "my_settings",
  "/system/users": "system_users",
  "/system/agents": "system_agents",
  "/system/skills": "system_skills",
}

/**
 * Workspace nav URL'leri → `NavMenu` mesaj anahtarı (workspace bazlı).
 * Aynı URL farklı workspace'lerde farklı başlık taşıyabilir
 * (ör. "/landed-cost-voucher": stock → Landed Cost Voucher, manufacturing →
 * Master Production Schedule), bu yüzden beyan liste workspace'ye göre ayrılır.
 * `#` (Material Planning tutucu) yalnız manufacturing grubunda geçerli.
 * Bu URL'ler dışındaki öğeler (veride olmayan/gelecek ekleme) veri metniyle kalır.
 */
const NAV_MENU_KEYS: Record<string, Record<string, string>> = {
  accounting: {
    "/accounting/dashboard": "dashboard",
    "/accounting/financial-reports": "fin_reports",
    "/accounting/balance-sheet": "balance_sheet",
    "/accounting/profit-and-loss": "profit_loss",
    "/accounting/cash-flow": "cash_flow",
    "/accounting/trial-balance": "trial_balance",
    "/accounting": "consolidated_report",
    "/accounting/ledgers": "ledgers",
    "/accounting/general-ledger": "general_ledger",
    "/accounting/customer-ledger": "customer_ledger",
    "/accounting/supplier-ledger": "supplier_ledger",
    "/accounting/profitability": "profitability",
    "/accounting/other-reports": "other_reports",
  },
  manufacturing: {
    "/manufacturing/dashboard": "dashboard",
    "/manufacturing/warehouse": "warehouse",
    "/manufacturing/bom": "bom",
    "/manufacturing/work-order": "work_order",
    "/manufacturing/job-card": "job_card",
    "/manufacturing/stock-entry": "mf_stock_entry",
    "#": "material_planning",
    "/manufacturing/production-plan": "production_plan",
    "/manufacturing/forecasting": "forecasting",
    "/landed-cost-voucher": "mps_stub",
    "/manufacturing/sales-forecast": "sales_forecast",
    "/manufacturing/production-planning-report": "production_planning_report",
    "/manufacturing/reports-production-planning": "production_planning_report_2",
    "/manufacturing/work-order-summary": "work_order_summary",
    "/manufacturing/quality-inspection-summary": "quality_inspection_summary",
    "/manufacturing/downtime-analysis": "downtime_analysis",
    "/manufacturing/job-card-summary": "job_card_summary",
    "/manufacturing/tools": "mf_tools",
    "/manufacturing/reports": "reports",
  },
  selling: {
    "/selling/dashboard": "dashboard",
    "/selling/sales-order": "sales_order",
    "/selling/quotations": "quotations",
    "/selling/customers": "customers",
    "/selling/sales-invoice": "sales_invoice",
    "/selling/delivery-note": "selling_delivery_note",
    "/selling/sales-analytics": "sales_analytics",
    "/selling/sales-funnel": "sales_funnel",
    "/selling/customer-ledger-summary": "customer_ledger_summary",
    "/selling/reports": "reports",
    "/selling/settings": "selling_settings",
  },
  stock: {
    "/stock/dashboard": "dashboard",
    "/stock/item": "stock_item",
    "/stock/warehouse": "warehouse",
    "/stock/stock-entry": "stock_entry",
    "/stock/purchase-receipt": "purchase_receipt",
    "/stock/delivery-note": "stock_delivery_note",
    "/stock/stock-reconciliation": "stock_reconciliation",
    "/landed-cost-voucher": "landed_cost_voucher",
    "/stock/material-request": "material_request",
    "/stock/reports": "reports",
    "/stock/stock-analytics": "stock_analytics",
    "/stock/stock-balance": "stock_balance",
    "/stock/retail-sales-report": "retail_sales",
    "/stock/stock-ledger": "stock_ledger",
    "/stock/serial-batch-traceability": "serial_batch_traceability",
    "/stock/purchase-receipt-trends": "purchase_receipt_trends",
    "/stock/delivery-note-trends": "delivery_note_trends",
  },
  subcontracting: {
    "/subcontracting/dashboard": "dashboard",
    "/subcontracting/inward-subcontracting": "inward_sub",
    "/subcontracting/inward-subcontracting-order": "sub_order",
    "/subcontracting/subcontracting-delivery": "sub_delivery",
    "/subcontracting/outward-subcontracting": "outward_sub",
    "/subcontracting/purchase-order": "sub_purchase_order",
    "/subcontracting/subcontracting-receipt": "sub_receipt",
    "/subcontracting/subcontracting-raw-materials": "sub_raw_materials",
    "/subcontracting/operations": "ops_quality",
    "/subcontracting/inspection": "inspection",
    "/subcontracting/job-work-register": "job_work_register",
    "/subcontracting/tools": "sc_tools",
    "/subcontracting/reports": "reports",
    "/subcontracting/subcontracting-order-summary": "sub_order_summary",
    "/subcontracting/settings": "sc_settings",
  },
}

const rowClass =
  "flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors"
const rowStyleClass = "text-muted-foreground hover:bg-muted hover:text-foreground"
const rowActiveClass = "bg-primary/10 text-primary font-medium"

export type ModuleNavMenuProps = {
  /**
   * @deprecated Menüyü kapat butonu kaldırıldı — yoksayılır, geriye uyumluluk için tutulur.
   */
  headerVisible?: boolean
  className?: string
}

/**
 * Aktif modülün nav menüsü (workspace switcher yok) — Executions ekranının
 * solundaki panelde render edilir. Veri kaynağı workspace-nav (eski sidebar
 * menü verisi); seçili item vurgusu yapılır, gruplar aktif sayfa
 * içeriyorsa açılır.
 */
export function ModuleNavMenu({
  className,
}: ModuleNavMenuProps = {}) {
  const pathname = usePathname()
  const { status: sessionStatus } = useSession()
  const { ready: roleReady, isAdmin } = useEffectiveRole()
  const allItems = getWorkspaceNavForPath(pathname)
  // Guest kuralı: rol yetkilendirmesi yapılmamış ekranlar açık; `adminOnly`
  // öğeler fail-closed — rol hesaplanana (`ready`) VEYA yönetici onaylanana
  // kadar GİZLİ kalır (yanıp sönme + URL ile sızıntı önlenir).
  const items = allItems.filter(
    (item) => !item.adminOnly || (sessionStatus === "authenticated" && roleReady && isAdmin),
  )
  const tNav = useTranslations("SystemNav")
  const tMenu = useTranslations("NavMenu")
  const workspaceId = getWorkspaceForPath(pathname).id
  const navKeys = NAV_MENU_KEYS[workspaceId]

  /**
   * Başlık çözümleme: sistem URL'leri → `SystemNav`; workspace URL'leri →
   * `NavMenu` (aktif workspace beyan listesi); beyan listesinde olmayan
   * öğeler veri metniyle (İngilizce ERP domain terimi) kalır.
   */
  const localizedTitle = (url: string, fallback: string): string => {
    const sysKey = SYSTEM_NAV_KEYS[url]
    if (sysKey) return tNav(sysKey)
    const key = navKeys?.[url]
    if (key) return tMenu(key)
    return fallback
  }

  return (
    <section className={cn("flex h-full min-w-0 flex-col", className)}>
      <nav
        className={cn(
          "flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overscroll-contain p-1.5"
        )}
        aria-label="Module menu"
      >
        {items.map((item) => {
          const Icon = item.icon
          const hasChildren = Boolean(item.items && item.items.length > 0)
          const isChildActive = item.items?.some(
            (subItem) => subItem.url === pathname
          )

          if (!hasChildren) {
            const isActive = item.url === pathname
            return (
              <Link
                key={item.url}
                href={item.url}
                className={cn(rowClass, isActive ? rowActiveClass : rowStyleClass)}
              >
                <Icon className="size-3.5 shrink-0" aria-hidden />
                <span className="truncate">{localizedTitle(item.url, item.title)}</span>
              </Link>
            )
          }

          return (
            <Collapsible
              key={item.url}
              defaultOpen={Boolean(isChildActive)}
              className="group/nav-item"
            >
              <CollapsibleTrigger className={cn(rowClass, "w-full", rowStyleClass)}>
                <Icon className="size-3.5 shrink-0" aria-hidden />
                <span className="min-w-0 truncate text-left">{localizedTitle(item.url, item.title)}</span>
                <ChevronRight
                  className="ml-auto size-3.5 shrink-0 transition-transform duration-200 group-data-[state=open]/nav-item:rotate-90"
                  aria-hidden
                />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-0.5 flex flex-col gap-0.5 border-l border-border/60 pl-4">
                  {item.items?.map((subItem) => {
                    const isActive = subItem.url === pathname
                    return (
                      <Link
                        key={subItem.url}
                        href={subItem.url}
                        className={cn(rowClass, "py-1", isActive ? rowActiveClass : rowStyleClass)}
                      >
                        <span className="truncate">{localizedTitle(subItem.url, subItem.title)}</span>
                      </Link>
                    )
                  })}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )
        })}
      </nav>
    </section>
  )
}
