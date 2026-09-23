/**
 * Delivery Note Bounded State & Aggregate Root
 * 
 * Formalizes the Delivery Note (Sevk İrsaliyesi / Lieferschein) as a DDD Aggregate Root:
 * - Root Entity: Delivery Note Header
 * - Child Collection: Dispatched Items
 * - Invariants:
 *   1. Must contain at least 1 dispatch item line (minCount: 1)
 *   2. total_qty must equal the sum of item quantities
 */

import {
  defineAggregateRoot,
  toBoundedStateDefinition,
} from "../../../lib/contracts/aggregate-root";

export interface DeliveryNoteHeader {
  delivery_note_no: string;
  order_no?: string;
  customer_id: string;
  dispatch_date: string;
  warehouse_id: string;
  total_qty: number;
  status: string;
}

export interface DeliveryNoteItemLine {
  item_code: string;
  item_name?: string;
  qty: number;
  uom: string;
  warehouse_id: string;
}

export const deliveryNoteAggregate = defineAggregateRoot<
  DeliveryNoteHeader,
  { items: DeliveryNoteItemLine[] }
>({
  name: "DeliveryNote",
  description: "Customer Delivery Note / Dispatch Document Aggregate Root",
  root: {
    fields: {
      delivery_note_no: {
        type: "string",
        description: "Unique delivery note / dispatch slip number",
        aliases: ["İrsaliye No", "Delivery Note No", "Lieferschein-Nr"],
      },
      order_no: {
        type: "string",
        description: "Originating Sales Order reference number",
        aliases: ["Sipariş No", "Order No"],
      },
      customer_id: {
        type: "string",
        description: "Receiving customer or party account ID",
        aliases: ["Cari Kodu", "Müşteri Kodu", "Empfänger"],
      },
      dispatch_date: {
        type: "date",
        description: "Actual physical departure / shipment date",
        aliases: ["Sevk Tarihi", "İrsaliye Tarihi", "Lieferdatum"],
      },
      warehouse_id: {
        type: "string",
        description: "Dispatching source warehouse code",
        aliases: ["Çıkış Deposu", "Depo Kodu", "Lager"],
      },
      total_qty: {
        type: "number",
        description: "Total physical quantity of goods shipped",
        aliases: ["Toplam Miktar", "Gesamtmenge"],
      },
      status: {
        type: "enum",
        description: "Current dispatch lifecycle status",
        aliases: ["Statü", "Durum"],
        enumValues: [
          { code: "Draft", label: "Taslak" },
          { code: "Dispatched", label: "Sevk Edildi" },
          { code: "Invoiced", label: "Faturalandı" },
          { code: "Returned", label: "İade Edildi" },
          { code: "Canceled", label: "İptal Edildi" },
        ],
      },
    },
  },
  children: {
    items: {
      entityName: "DeliveryNoteItem",
      description: "Dispatched Item Lines",
      minCount: 1,
      fields: {
        item_code: {
          type: "string",
          description: "Inventory stock item code",
          aliases: ["Malzeme Kodu", "Stok Kodu", "Artikelnummer"],
        },
        qty: {
          type: "number",
          description: "Shipped physical quantity",
          aliases: ["Sevk Miktarı", "Menge"],
        },
        uom: {
          type: "string",
          description: "Unit of measure (e.g. ADET, KG, STK)",
          aliases: ["Birim", "Einheit"],
        },
        warehouse_id: {
          type: "string",
          description: "Specific location or sub-warehouse bin",
          aliases: ["Depo", "Lagerplatz"],
        },
      },
    },
  },
  invariants: [
    {
      id: "delivery-note-total-qty-consistency",
      description: "Toplam sevk miktarı, satırlardaki miktarların toplamına eşit olmalıdır.",
      validate: (root, children) => {
        const items = children.items || [];
        const calculatedQty = items.reduce((acc, it) => acc + (it.qty || 0), 0);
        const diff = Math.abs(root.total_qty - calculatedQty);
        if (diff > 0.0001) {
          return {
            valid: false,
            message: `Delivery note total_qty (${root.total_qty}) does not match sum of items (${calculatedQty}).`,
          };
        }
        return true;
      },
    },
    {
      id: "delivery-note-positive-qty",
      description: "Sevk kalem miktarları sıfırdan büyük olmalıdır.",
      validate: (_root, children) => {
        const invalidItem = (children.items || []).find((it) => (it.qty || 0) <= 0);
        if (invalidItem) {
          return {
            valid: false,
            message: `Item line '${invalidItem.item_code}' has non-positive quantity (${invalidItem.qty}).`,
          };
        }
        return true;
      },
    },
  ],
  businessRules: [
    "İrsaliye düzenlenmeden önce depoda yeterli rezerve stok bulunmalıdır.",
    "Fiili sevk gerçekleştikten sonra irsaliye satırları silinemez, iade irsaliyesi düzenlenmelidir.",
  ],
});

export const deliveryNoteState = toBoundedStateDefinition(deliveryNoteAggregate);
