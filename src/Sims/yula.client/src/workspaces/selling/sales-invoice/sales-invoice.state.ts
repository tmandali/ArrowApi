/**
 * Sales Invoice Bounded State & Aggregate Root
 * 
 * Formalizes the Sales Invoice (Satış Faturası / Ausgangsrechnung) as a DDD Aggregate Root:
 * - Root Entity: Invoice Header
 * - Child Collections: Line Items and Tax Breakdown Lines
 * - Invariants:
 *   1. Must have at least 1 invoice item line (minCount: 1)
 *   2. subtotal must equal the sum of item amounts
 *   3. tax_total must equal the sum of item vat amounts
 *   4. grand_total must equal subtotal + tax_total
 */

import {
  defineAggregateRoot,
  toBoundedStateDefinition,
} from "../../../lib/contracts/aggregate-root";

export interface SalesInvoiceHeader {
  invoice_no: string;
  order_no?: string;
  delivery_note_no?: string;
  customer_id: string;
  invoice_date: string;
  subtotal: number;
  tax_total: number;
  grand_total: number;
  currency: string;
  status: string;
}

export interface SalesInvoiceItemLine {
  item_code: string;
  item_name?: string;
  qty: number;
  rate: number;
  amount: number;
  vat_rate: number;
  vat_amount: number;
}

export interface SalesInvoiceTaxLine {
  tax_type: string;
  tax_rate: number;
  taxable_amount: number;
  tax_amount: number;
}

export const salesInvoiceAggregate = defineAggregateRoot<
  SalesInvoiceHeader,
  {
    items: SalesInvoiceItemLine[];
    tax_breakdown: SalesInvoiceTaxLine[];
  }
>({
  name: "SalesInvoice",
  description: "Customer Sales Invoice Document Aggregate Root",
  root: {
    fields: {
      invoice_no: {
        type: "string",
        description: "Official legal invoice number / series",
        aliases: ["Fatura No", "Invoice No", "Rechnungsnummer"],
      },
      order_no: {
        type: "string",
        description: "Originating Sales Order reference number",
        aliases: ["Sipariş No", "Auftrags-Nr"],
      },
      delivery_note_no: {
        type: "string",
        description: "Originating Delivery Note reference number",
        aliases: ["İrsaliye No", "Lieferschein-Nr"],
      },
      customer_id: {
        type: "string",
        description: "Customer account identifier",
        aliases: ["Cari Kodu", "Müşteri Kodu", "Debitoren-Nr"],
      },
      invoice_date: {
        type: "date",
        description: "Official invoice issuing date",
        aliases: ["Fatura Tarihi", "Rechnungsdatum"],
      },
      subtotal: {
        type: "number",
        description: "Total net amount before taxes",
        aliases: ["Ara Toplam", "KDV Matrahı", "Nettobetrag"],
      },
      tax_total: {
        type: "number",
        description: "Total tax amount calculated",
        aliases: ["KDV Toplamı", "Vergi Tutarı", "Steuerbetrag"],
      },
      grand_total: {
        type: "number",
        description: "Gross invoice total payable (subtotal + tax_total)",
        aliases: ["Genel Toplam", "Ödenecek Tutar", "Bruttobetrag"],
      },
      currency: {
        type: "string",
        description: "Transaction ISO currency code (e.g. TRY, EUR, USD)",
        aliases: ["Para Birimi", "Währung"],
      },
      status: {
        type: "enum",
        description: "Current invoice lifecycle status",
        aliases: ["Statü", "Durum", "Status"],
        enumValues: [
          { code: "Draft", label: "Taslak" },
          { code: "Signed", label: "İmzalandı / Onaylandı" },
          { code: "Posted", label: "Muhasebeleşti" },
          { code: "Paid", label: "Ödendi" },
          { code: "Voided", label: "İptal Edildi" },
        ],
      },
    },
  },
  children: {
    items: {
      entityName: "SalesInvoiceItem",
      description: "Invoice Line Items",
      minCount: 1,
      fields: {
        item_code: {
          type: "string",
          description: "Inventory item code",
          aliases: ["Malzeme Kodu", "Stok Kodu", "Artikel"],
        },
        qty: {
          type: "number",
          description: "Invoiced quantity",
          aliases: ["Miktar", "Menge"],
        },
        rate: {
          type: "number",
          description: "Unit selling price excluding VAT",
          aliases: ["Birim Fiyat", "Einzelpreis"],
        },
        amount: {
          type: "number",
          description: "Net line total amount (qty * rate)",
          aliases: ["Net Tutar", "Zeilenbetrag"],
        },
        vat_rate: {
          type: "number",
          description: "VAT percentage rate (e.g. 20, 10, 1, 0)",
          aliases: ["KDV Oranı", "MwSt-Satz"],
        },
        vat_amount: {
          type: "number",
          description: "Calculated line VAT amount",
          aliases: ["KDV Tutarı", "MwSt-Betrag"],
        },
      },
    },
    tax_breakdown: {
      entityName: "SalesInvoiceTaxLine",
      description: "Aggregated Tax Breakdown by Tax Rate",
      fields: {
        tax_type: {
          type: "string",
          description: "Tax code or category (e.g. KDV20, KDV10, UST19)",
          aliases: ["Vergi Tipi"],
        },
        tax_rate: {
          type: "number",
          description: "Tax rate percentage",
          aliases: ["Vergi Oranı"],
        },
        taxable_amount: {
          type: "number",
          description: "Base taxable net amount",
          aliases: ["Matrah"],
        },
        tax_amount: {
          type: "number",
          description: "Calculated tax amount for this bucket",
          aliases: ["Hesaplanan Vergi"],
        },
      },
    },
  },
  invariants: [
    {
      id: "invoice-grand-total-consistency",
      description: "Genel toplam, ara toplam ile vergi toplamının toplamına eşit olmalıdır.",
      validate: (root) => {
        const expected = (root.subtotal || 0) + (root.tax_total || 0);
        const diff = Math.abs(root.grand_total - expected);
        if (diff > 0.01) {
          return {
            valid: false,
            message: `Invoice grand_total (${root.grand_total}) does not equal subtotal (${root.subtotal}) + tax_total (${root.tax_total}). Expected ${expected}.`,
          };
        }
        return true;
      },
    },
    {
      id: "invoice-subtotal-items-sum-consistency",
      description: "Ara toplam, kalem satırlarının net tutarlarının toplamına eşit olmalıdır.",
      validate: (root, children) => {
        const items = children.items || [];
        const itemsSum = items.reduce((acc, it) => acc + (it.amount || 0), 0);
        const diff = Math.abs(root.subtotal - itemsSum);
        if (diff > 0.01) {
          return {
            valid: false,
            message: `Invoice subtotal (${root.subtotal}) does not match sum of item amounts (${itemsSum}).`,
          };
        }
        return true;
      },
    },
    {
      id: "invoice-tax-items-vat-sum-consistency",
      description: "Vergi toplamı, kalem satırlarındaki KDV tutarlarının toplamına eşit olmalıdır.",
      validate: (root, children) => {
        const items = children.items || [];
        const vatSum = items.reduce((acc, it) => acc + (it.vat_amount || 0), 0);
        const diff = Math.abs(root.tax_total - vatSum);
        if (diff > 0.01) {
          return {
            valid: false,
            message: `Invoice tax_total (${root.tax_total}) does not match sum of item VAT amounts (${vatSum}).`,
          };
        }
        return true;
      },
    },
  ],
  businessRules: [
    "Fatura onaylanıp imzalandıktan sonra satır ve tutar bilgileri değiştirilemez.",
    "Muhasebeleşen faturaların yasal iptali için ters kayıt veya iade faturası gereklidir.",
  ],
});

export const salesInvoiceState = toBoundedStateDefinition(salesInvoiceAggregate);
