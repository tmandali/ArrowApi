import { z } from "zod";
import { defineBoundedContext } from "@/lib/contracts/bounded-context";
import { salesOrderState, type SalesOrderHeader } from "./sales-order.state";
import { salesOrderProcess } from "./sales-order.process";
import { salesOrderTrStrategy } from "./strategies/sales-order.tr";
import { salesOrderDeStrategy } from "./strategies/sales-order.de";

/**
 * 1:1 Bounded Context definition for Sales Order Menu Item.
 * 
 * Formula: Bounded Context = Bounded State (Aggregate Root) + Bounded Process + Strategies
 */
export const salesOrderContext = defineBoundedContext<SalesOrderHeader>({
  id: "sales_order",
  title: "Satış Siparişi Yönetimi",
  titleKey: "title",
  workspace: "selling",
  type: "transactional",
  partyReferenceKey: "customer_id",
  i18nNamespace: "BoundedContext.SalesOrder",
  state: salesOrderState,
  process: salesOrderProcess,
  strategies: {
    TR: salesOrderTrStrategy,
    DE: salesOrderDeStrategy,
  },
  screen: {
    screenId: "sales_order",
    screenTitle: "Satış Siparişi",
    workspace: "selling",
    category: "interactive_operator",
    aiEnabled: true,
    actions: {
      submitForApproval: {
        description: "Siparişi yönetici onayına sunar.",
        inputSchema: z.object({}).optional(),
        whenToCall: "Sipariş taslak aşamasındayken ve onay gerektirdiğinde.",
        whenNotToCall: "Sipariş zaten onaylanmış veya iptal edilmişse.",
      },
      approve: {
        description: "Siparişi onaylayarak sevk edilebilir hale getirir.",
        inputSchema: z.object({}).optional(),
        whenToCall: "Sipariş onay beklerken ve yetkili kullanıcı onaylamak istediğinde.",
        whenNotToCall: "Sipariş taslak aşamasındaysa veya zaten onaylanmışsa.",
      },
      cancel: {
        description: "Siparişi iptal eder.",
        inputSchema: z.object({ reason: z.string().optional() }).optional(),
        whenToCall: "Kullanıcı siparişi iptal etmek istediğinde.",
        whenNotToCall: "Sipariş sevk edilmiş veya tamamlanmışsa.",
      },
    },
  },
});

export type SalesOrderContext = typeof salesOrderContext;
