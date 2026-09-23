import type { BoundedProcessDefinition } from "@/lib/contracts/bounded-context";

/**
 * Sales Invoice Process Lifecycle & State Machine
 */
export const salesInvoiceProcess: BoundedProcessDefinition = {
  flowName: "Satış Faturası Yaşam Döngüsü",
  flowNameKey: "flow_name",
  initialState: "Draft",
  terminalStates: ["Paid", "Voided"],
  statuses: {
    Draft: "Taslak",
    Signed: "İmzalandı",
    Posted: "Muhasebeleşti",
    Paid: "Tahsil Edildi",
    Voided: "İptal Edildi",
  },
  statusKeys: {
    Draft: "status_draft",
    Signed: "status_signed",
    Posted: "status_posted",
    Paid: "status_paid",
    Voided: "status_voided",
  },
  transitions: [
    {
      from: "Draft",
      to: "Signed",
      action: "sign",
      label: "Faturayı İmzala",
      labelKey: "action_sign",
    },
    {
      from: "Draft",
      to: "Voided",
      action: "void",
      label: "İptal Et",
      labelKey: "action_void",
    },
    {
      from: "Signed",
      to: "Posted",
      action: "post",
      label: "Muhasebeleştir",
      labelKey: "action_post",
    },
    {
      from: "Signed",
      to: "Voided",
      action: "void",
      label: "İptal Et",
      labelKey: "action_void",
    },
    {
      from: "Posted",
      to: "Paid",
      action: "markPaid",
      label: "Tahsil Edildi İşaretle",
      labelKey: "action_mark_paid",
    },
    {
      from: "Posted",
      to: "Voided",
      action: "void",
      label: "Ters Kayıt ile İptal Et",
      labelKey: "action_void",
    },
  ],
  businessRules: [
    "İmzalanan fatura üzerinde mali veri (tutar, vergi, cari) değişikliği yapılamaz.",
    "Muhasebeleşen fatura iptal edildiğinde otomatik ters yevmiye fişi üretilmelidir.",
  ],
};
