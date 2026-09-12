import { useTranslations } from "next-intl";
import type { ComponentType } from "react";
import {
  TrendingUp,
  AlertCircle,
  Clock,
  CheckCircle2,
  FileText,
  Truck,
  ShoppingCart,
  Receipt,
  Package,
  Boxes,
  Users,
  Factory,
  Layers,
  ShieldCheck,
  CreditCard,
  Briefcase,
  Wrench,
  BarChart3,
  Scale,
} from "lucide-react";
import type { WorkspaceId } from "@/types";

export type SoftTone = "emerald" | "blue" | "amber" | "violet" | "rose" | "slate";

export interface WorkspaceKpiItem {
  id: string;
  title: string;
  value: string;
  change?: string;
  trend?: "up" | "down" | "flat";
  subtext?: string;
  tone: SoftTone;
  icon?: ComponentType<{ className?: string }>;
}

export interface WorkspacePendingAction {
  id: string;
  code: string;
  title: string;
  description: string;
  status: "urgent" | "pending" | "review";
  statusLabel: string;
  amountOrCount?: string;
  dueDate?: string;
  actionUrl: string;
  actionLabel: string;
  categoryIcon?: ComponentType<{ className?: string }>;
}

export interface WorkspaceAssignedTask {
  id: string;
  title: string;
  subtitle: string;
  priority: "high" | "medium" | "low";
  priorityLabel: string;
  deadline?: string;
  assignedBy?: string;
  targetUrl: string;
}

export interface WorkspaceQuickShortcut {
  id: string;
  title: string;
  description: string;
  url: string;
  icon: ComponentType<{ className?: string }>;
  badge?: string;
}

export interface WorkspaceLandingData {
  workspaceId: WorkspaceId;
  greetingTitle: string;
  greetingDescription: string;
  kpis: WorkspaceKpiItem[];
  pendingActions: WorkspacePendingAction[];
  assignedTasks: WorkspaceAssignedTask[];
  quickShortcuts: WorkspaceQuickShortcut[];
}

/**
 * Workspace landing demo verisinin METİN katmanı (`messages/<locale>.json`
 * → `WorkspaceLanding.<workspace>` alt ağacı). Modül yalnız yapısal alanları
 * (id, ikon, ton, trend, url, kod) tutar; okunur metinler locale'den gelir.
 */
export interface WorkspaceLandingText {
  greeting: { title: string; description: string };
  kpis: Record<
    string,
    { title: string; value: string; change?: string; subtext?: string }
  >;
  pending_actions: Record<
    string,
    {
      title: string;
      description: string;
      status_label: string;
      amount?: string;
      due?: string;
      action_label: string;
    }
  >;
  assigned_tasks: Record<
    string,
    {
      title: string;
      subtitle: string;
      priority_label: string;
      deadline?: string;
      assigned_by?: string;
    }
  >;
  quick_shortcuts: Record<
    string,
    { title: string; description: string; badge?: string }
  >;
}

interface StructuralKpi {
  id: string;
  trend: "up" | "down" | "flat";
  tone: SoftTone;
  icon?: ComponentType<{ className?: string }>;
}

interface StructuralPendingAction {
  id: string;
  code: string;
  status: "urgent" | "pending" | "review";
  actionUrl: string;
  categoryIcon?: ComponentType<{ className?: string }>;
}

interface StructuralAssignedTask {
  id: string;
  priority: "high" | "medium" | "low";
  targetUrl: string;
}

interface StructuralQuickShortcut {
  id: string;
  url: string;
  icon: ComponentType<{ className?: string }>;
}

interface StructuralLanding {
  kpis: StructuralKpi[];
  pendingActions: StructuralPendingAction[];
  assignedTasks: StructuralAssignedTask[];
  quickShortcuts: StructuralQuickShortcut[];
}

/** Yapısal preset'ler — ikon/tren/ton/url/kod (metin içermez). */
export const WORKSPACE_LANDING_STRUCTURE: Record<WorkspaceId, StructuralLanding> = {
  my: {
    kpis: [],
    pendingActions: [],
    assignedTasks: [],
    quickShortcuts: [
      { id: "my-settings", url: "/my/settings", icon: Wrench },
    ],
  },
  selling: {
    kpis: [
      { id: "open-orders-val", trend: "up", tone: "blue", icon: ShoppingCart },
      { id: "to-be-invoiced", trend: "flat", tone: "amber", icon: Receipt },
      { id: "quote-win-rate", trend: "up", tone: "emerald", icon: TrendingUp },
      { id: "pending-approval", trend: "down", tone: "violet", icon: AlertCircle },
    ],
    pendingActions: [
      { id: "so-1092", code: "SO-2026-0192", status: "urgent", actionUrl: "/selling", categoryIcon: Truck },
      { id: "so-1088", code: "SO-2026-0188", status: "pending", actionUrl: "/selling", categoryIcon: Receipt },
      { id: "qt-0421", code: "QT-2026-0421", status: "review", actionUrl: "/selling", categoryIcon: FileText },
    ],
    assignedTasks: [
      { id: "task-sel-1", priority: "high", targetUrl: "/selling" },
      { id: "task-sel-2", priority: "medium", targetUrl: "/selling" },
      { id: "task-sel-3", priority: "low", targetUrl: "/selling" },
    ],
    quickShortcuts: [
      { id: "new-sales-order", url: "/selling", icon: ShoppingCart },
      { id: "sales-analytics", url: "/selling/dashboard", icon: BarChart3 },
      { id: "delivery-tracking", url: "/selling", icon: Truck },
      { id: "customer-accounts", url: "/selling", icon: Users },
    ],
  },
  stock: {
    kpis: [
      { id: "critical-stock-count", trend: "down", tone: "rose", icon: AlertCircle },
      { id: "stock-receipts", trend: "flat", tone: "blue", icon: Boxes },
      { id: "warehouse-occupancy", trend: "up", tone: "emerald", icon: Package },
      { id: "stock-total-val", trend: "flat", tone: "slate", icon: Scale },
    ],
    pendingActions: [
      { id: "stock-po-rec", code: "PR-2026-0310", status: "urgent", actionUrl: "/stock/item", categoryIcon: Package },
      { id: "stock-min-reorder", code: "MR-2026-0084", status: "pending", actionUrl: "/stock/stock-balance", categoryIcon: AlertCircle },
      { id: "stock-transfer", code: "STE-2026-0155", status: "review", actionUrl: "/stock/stock-ledger", categoryIcon: Truck },
    ],
    assignedTasks: [
      { id: "task-stk-1", priority: "high", targetUrl: "/stock/stock-balance" },
      { id: "task-stk-2", priority: "medium", targetUrl: "/stock/item" },
      { id: "task-stk-3", priority: "low", targetUrl: "/stock/stock-analytics" },
    ],
    quickShortcuts: [
      { id: "stock-items", url: "/stock/item", icon: Package },
      { id: "stock-balance", url: "/stock/stock-balance", icon: Scale },
      { id: "stock-ledger", url: "/stock/stock-ledger", icon: FileText },
      { id: "stock-analytics", url: "/stock/stock-analytics", icon: BarChart3 },
    ],
  },
  accounting: {
    kpis: [
      { id: "receivables-due", trend: "up", tone: "emerald", icon: TrendingUp },
      { id: "payables-due", trend: "flat", tone: "rose", icon: CreditCard },
      { id: "pending-invoices", trend: "flat", tone: "amber", icon: Receipt },
      { id: "vat-period-days", trend: "flat", tone: "blue", icon: Clock },
    ],
    pendingActions: [
      { id: "acc-inv-match", code: "INV-2026-884", status: "urgent", actionUrl: "/accounting", categoryIcon: Receipt },
      { id: "acc-exp-approval", code: "EXP-2026-0041", status: "pending", actionUrl: "/accounting", categoryIcon: FileText },
      { id: "acc-bank-recon", code: "BNK-2026-03", status: "review", actionUrl: "/accounting", categoryIcon: CreditCard },
    ],
    assignedTasks: [
      { id: "task-acc-1", priority: "high", targetUrl: "/accounting" },
      { id: "task-acc-2", priority: "medium", targetUrl: "/accounting" },
      { id: "task-acc-3", priority: "low", targetUrl: "/accounting" },
    ],
    quickShortcuts: [
      { id: "acc-general-ledger", url: "/accounting", icon: FileText },
      { id: "acc-fin-reports", url: "/financial-reports", icon: BarChart3 },
      { id: "acc-sales-invoices", url: "/accounting", icon: Receipt },
      { id: "acc-payment-plan", url: "/accounting/dashboard", icon: TrendingUp },
    ],
  },
  manufacturing: {
    kpis: [
      { id: "active-work-orders", trend: "up", tone: "blue", icon: Factory },
      { id: "oee-efficiency", trend: "up", tone: "emerald", icon: TrendingUp },
      { id: "delayed-operations", trend: "down", tone: "rose", icon: AlertCircle },
      { id: "scrap-rate", trend: "flat", tone: "slate", icon: ShieldCheck },
    ],
    pendingActions: [
      { id: "mfg-wo-start", code: "WO-2026-0056", status: "urgent", actionUrl: "/manufacturing", categoryIcon: Factory },
      { id: "mfg-qc-check", code: "QC-2026-0112", status: "pending", actionUrl: "/manufacturing", categoryIcon: ShieldCheck },
      { id: "mfg-bom-change", code: "ECO-2026-004", status: "review", actionUrl: "/manufacturing", categoryIcon: Layers },
    ],
    assignedTasks: [
      { id: "task-mfg-1", priority: "high", targetUrl: "/manufacturing" },
      { id: "task-mfg-2", priority: "medium", targetUrl: "/manufacturing" },
      { id: "task-mfg-3", priority: "low", targetUrl: "/manufacturing" },
    ],
    quickShortcuts: [
      { id: "mfg-work-orders", url: "/manufacturing", icon: Factory },
      { id: "mfg-bom", url: "/manufacturing", icon: Layers },
      { id: "mfg-dashboard", url: "/manufacturing/dashboard", icon: BarChart3 },
      { id: "mfg-maintenance", url: "/manufacturing", icon: Wrench },
    ],
  },
  subcontracting: {
    kpis: [
      { id: "out-for-subcontract", trend: "flat", tone: "blue", icon: Layers },
      { id: "pending-sub-receipt", trend: "up", tone: "emerald", icon: Truck },
      { id: "sub-qc-pending", trend: "flat", tone: "amber", icon: ShieldCheck },
      { id: "subcontractor-balance", trend: "flat", tone: "slate", icon: Scale },
    ],
    pendingActions: [
      { id: "sub-send-raw", code: "SCO-2026-0034", status: "urgent", actionUrl: "/subcontracting", categoryIcon: Truck },
      { id: "sub-return-qc", code: "SCR-2026-0019", status: "pending", actionUrl: "/subcontracting", categoryIcon: ShieldCheck },
      { id: "sub-recon", code: "REC-2026-008", status: "review", actionUrl: "/subcontracting", categoryIcon: FileText },
    ],
    assignedTasks: [
      { id: "task-sub-1", priority: "high", targetUrl: "/subcontracting" },
      { id: "task-sub-2", priority: "medium", targetUrl: "/subcontracting" },
    ],
    quickShortcuts: [
      { id: "sub-orders", url: "/subcontracting", icon: Layers },
      { id: "sub-transfers", url: "/subcontracting", icon: Truck },
      { id: "sub-dashboard", url: "/subcontracting/dashboard", icon: BarChart3 },
    ],
  },
  system: {
    kpis: [
      { id: "active-users", trend: "up", tone: "blue", icon: Users },
      { id: "system-status", trend: "up", tone: "emerald", icon: CheckCircle2 },
      { id: "duckdb-status", trend: "flat", tone: "violet", icon: Briefcase },
      { id: "unread-notifications", trend: "flat", tone: "amber", icon: AlertCircle },
    ],
    pendingActions: [
      { id: "sys-backup", code: "SYS-BCK-01", status: "pending", actionUrl: "/my/settings", categoryIcon: ShieldCheck },
    ],
    assignedTasks: [
      { id: "task-sys-1", priority: "high", targetUrl: "/system/users" },
    ],
    quickShortcuts: [
      { id: "sys-users", url: "/system/users", icon: Users },
      { id: "sys-my-settings", url: "/my/settings", icon: Wrench },
    ],
  },
};

/**
 * Mevcut locale'e göre tam landing veri nesnesini üretir (yapısal preset +
 * `WorkspaceLanding.<workspace>` mesaj alt ağacı birleştirilir). Yalnız
 * istemci bileşenlerinden çağrılmalıdır.
 */
export function useWorkspaceLandingData(workspaceId: WorkspaceId): WorkspaceLandingData {
  const t = useTranslations("WorkspaceLanding");
  const struct =
    WORKSPACE_LANDING_STRUCTURE[workspaceId] ??
    WORKSPACE_LANDING_STRUCTURE.system;
  const text = (t.raw(workspaceId) ?? t.raw("system")) as WorkspaceLandingText;

  return {
    workspaceId,
    greetingTitle: text.greeting.title,
    greetingDescription: text.greeting.description,
    kpis: struct.kpis.map((k) => {
      const s = text.kpis[k.id];
      return {
        id: k.id,
        title: s?.title ?? "",
        value: s?.value ?? "",
        change: s?.change,
        subtext: s?.subtext,
        trend: k.trend,
        tone: k.tone,
        icon: k.icon,
      };
    }),
    pendingActions: struct.pendingActions.map((a) => {
      const s = text.pending_actions[a.id];
      return {
        id: a.id,
        code: a.code,
        title: s?.title ?? "",
        description: s?.description ?? "",
        status: a.status,
        statusLabel: s?.status_label ?? "",
        amountOrCount: s?.amount,
        dueDate: s?.due,
        actionUrl: a.actionUrl,
        actionLabel: s?.action_label ?? "",
        categoryIcon: a.categoryIcon,
      };
    }),
    assignedTasks: struct.assignedTasks.map((task) => {
      const s = text.assigned_tasks[task.id];
      return {
        id: task.id,
        title: s?.title ?? "",
        subtitle: s?.subtitle ?? "",
        priority: task.priority,
        priorityLabel: s?.priority_label ?? "",
        deadline: s?.deadline,
        assignedBy: s?.assigned_by,
        targetUrl: task.targetUrl,
      };
    }),
    quickShortcuts: struct.quickShortcuts.map((q) => {
      const s = text.quick_shortcuts[q.id];
      return {
        id: q.id,
        title: s?.title ?? "",
        description: s?.description ?? "",
        url: q.url,
        icon: q.icon,
        badge: s?.badge,
      };
    }),
  };
}
