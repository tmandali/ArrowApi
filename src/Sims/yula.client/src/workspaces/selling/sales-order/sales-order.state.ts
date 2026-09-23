/**
 * Sales Order Bounded State & Aggregate Root
 * 
 * Formalizes the Sales Order document as a DDD Aggregate Root:
 * - Root Entity: Order Header (order_no, customer_id, grand_total, status)
 * - Child Collection: Items (item_code, qty, rate, amount)
 * - Invariants:
 *   1. Must have at least 1 item (minCount: 1)
 *   2. grand_total must equal the exact sum of line amounts
 */

import {
  defineAggregateRoot,
  toBoundedStateDefinition,
} from "../../../lib/contracts/aggregate-root";

export interface SalesOrderHeader {
  order_no: string;
  customer_id: string;
  order_date: string;
  grand_total: number;
  currency: string;
  status: string;
}

export interface SalesOrderItemLine {
  item_code: string;
  qty: number;
  rate: number;
  amount: number;
}

export const salesOrderAggregate = defineAggregateRoot<
  SalesOrderHeader,
  { items: SalesOrderItemLine[] }
>({
  name: "SalesOrder",
  description: "Customer Sales Order Aggregate Root",
  root: {
    fields: {
      order_no: {
        type: "string",
        description: "Unique Sales Order identifier",
        aliases: ["Sipariş No", "Order Number"],
      },
      customer_id: {
        type: "string",
        description: "Customer / Account code",
        aliases: ["Cari Kodu", "Müşteri Kodu"],
      },
      order_date: {
        type: "date",
        description: "Date when order was placed",
        aliases: ["Sipariş Tarihi"],
      },
      grand_total: {
        type: "number",
        description: "Grand total including taxes",
        aliases: ["Genel Toplam"],
      },
      currency: {
        type: "string",
        description: "Transaction currency code (e.g. TRY, EUR)",
        aliases: ["Para Birimi"],
      },
      status: {
        type: "enum",
        description: "Current order lifecycle status",
        aliases: ["Statü", "Durum"],
        enumValues: [
          { code: "Draft", label: "Taslak" },
          { code: "PendingApproval", label: "Onay Bekliyor" },
          { code: "Approved", label: "Onaylandı" },
          { code: "Dispatched", label: "Sevk Edildi" },
          { code: "Completed", label: "Tamamlandı" },
          { code: "Canceled", label: "İptal Edildi" },
        ],
      },
    },
  },
  children: {
    items: {
      entityName: "SalesOrderItem",
      description: "Sales Order Line Items",
      minCount: 1,
      fields: {
        item_code: {
          type: "string",
          description: "Inventory stock item code",
          aliases: ["Malzeme Kodu", "Stok Kodu"],
        },
        qty: {
          type: "number",
          description: "Ordered quantity",
          aliases: ["Miktar"],
        },
        rate: {
          type: "number",
          description: "Unit selling price",
          aliases: ["Birim Fiyat"],
        },
        amount: {
          type: "number",
          description: "Line item total amount (qty * rate)",
          aliases: ["Satır Tutarı"],
        },
      },
    },
  },
  invariants: [
    {
      id: "grand-total-sum-consistency",
      description: "Genel toplam, satır tutarlarının (amount) toplamına eşit olmalıdır.",
      validate: (root, children) => {
        const items = children.items || [];
        const calculatedSum = items.reduce((acc, it) => acc + (it.amount || 0), 0);
        const diff = Math.abs(root.grand_total - calculatedSum);
        if (diff > 0.01) {
          return {
            valid: false,
            message: `Grand total (${root.grand_total}) does not match the sum of item amounts (${calculatedSum}).`,
          };
        }
        return true;
      },
    },
  ],
  businessRules: [
    "Sipariş onaylanmadan önce en az 1 satır içermelidir.",
    "Onaylanmış siparişlerin satırları silinemez, revizyon statüsüne alınmalıdır.",
  ],
});

export const salesOrderState = toBoundedStateDefinition(salesOrderAggregate);
