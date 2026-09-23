import type { BoundedProcessDefinition } from "@/lib/contracts/bounded-context";

/**
 * Delivery Note Process Lifecycle & State Machine
 */
export const deliveryNoteProcess: BoundedProcessDefinition = {
  flowName: "Sevk İrsaliyesi Yaşam Döngüsü",
  flowNameKey: "flow_name",
  initialState: "Draft",
  terminalStates: ["Invoiced", "Returned", "Canceled"],
  statuses: {
    Draft: "Taslak",
    Dispatched: "Sevk Edildi",
    Invoiced: "Faturalandı",
    Returned: "İade Alındı",
    Canceled: "İptal Edildi",
  },
  statusKeys: {
    Draft: "status_draft",
    Dispatched: "status_dispatched",
    Invoiced: "status_invoiced",
    Returned: "status_returned",
    Canceled: "status_canceled",
  },
  transitions: [
    {
      from: "Draft",
      to: "Dispatched",
      action: "dispatch",
      label: "Fiili Sevk Yap",
      labelKey: "action_dispatch",
    },
    {
      from: "Draft",
      to: "Canceled",
      action: "cancel",
      label: "İptal Et",
      labelKey: "action_cancel",
    },
    {
      from: "Dispatched",
      to: "Invoiced",
      action: "invoice",
      label: "Faturalaştır",
      labelKey: "action_invoice",
    },
    {
      from: "Dispatched",
      to: "Returned",
      action: "return",
      label: "İade Al",
      labelKey: "action_return",
    },
    {
      from: "Dispatched",
      to: "Canceled",
      action: "cancel",
      label: "İptal Et",
      labelKey: "action_cancel",
    },
  ],
  businessRules: [
    "Taslak irsaliye sevk edilmeden önce araç ve şoför bilgileri eksiksiz girilmelidir.",
    "Faturalandırılmış bir irsaliye doğrudan iptal edilemez; önce bağlı fatura iptal edilmelidir.",
  ],
};
