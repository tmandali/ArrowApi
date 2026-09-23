import type { BoundedProcessDefinition } from "@/lib/contracts/bounded-context";

/**
 * Sales Order Process Lifecycle & State Machine
 */
export const salesOrderProcess: BoundedProcessDefinition = {
  flowName: "Satış Siparişi Yaşam Döngüsü",
  flowNameKey: "flow_name",
  initialState: "Draft",
  terminalStates: ["Completed", "Canceled"],
  statuses: {
    Draft: "Taslak",
    PendingApproval: "Onay Bekliyor",
    Approved: "Onaylandı",
    Dispatched: "Sevk Edildi",
    Completed: "Tamamlandı",
    Canceled: "İptal Edildi",
  },
  statusKeys: {
    Draft: "status_draft",
    PendingApproval: "status_pending_approval",
    Approved: "status_approved",
    Dispatched: "status_dispatched",
    Completed: "status_completed",
    Canceled: "status_canceled",
  },
  transitions: [
    {
      from: "Draft",
      to: "PendingApproval",
      action: "submitForApproval",
      label: "Onaya Gönder",
      labelKey: "action_submit_for_approval",
    },
    {
      from: "Draft",
      to: "Canceled",
      action: "cancel",
      label: "İptal Et",
      labelKey: "action_cancel",
    },
    {
      from: "PendingApproval",
      to: "Approved",
      action: "approve",
      label: "Onayla",
      labelKey: "action_approve",
    },
    {
      from: "PendingApproval",
      to: "Draft",
      action: "reject",
      label: "Revizyona Al",
      labelKey: "action_reject",
    },
    {
      from: "Approved",
      to: "Dispatched",
      action: "dispatch",
      label: "Sevk Et",
      labelKey: "action_dispatch",
    },
    {
      from: "Dispatched",
      to: "Completed",
      action: "complete",
      label: "Tamamla",
      labelKey: "action_complete",
    },
    {
      from: "Approved",
      to: "Canceled",
      action: "cancel",
      label: "İptal Et",
      labelKey: "action_cancel",
    },
  ],
  businessRules: [
    "Taslak sipariş onaylanmadan sevkiyata konu edilemez.",
    "Onaylanan siparişler iptal edildiğinde sevk irsaliyesi oluşturulamaz.",
    "Tamamlanan siparişler üzerinde düzenleme yapılamaz.",
  ],
};
