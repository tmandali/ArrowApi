import { z } from "zod";
import { defineBoundedContext } from "@/lib/contracts/bounded-context";
import { salesInvoiceState, type SalesInvoiceHeader } from "./sales-invoice.state";
import { salesInvoiceProcess } from "./sales-invoice.process";
import { salesInvoiceTrStrategy } from "./strategies/sales-invoice.tr";
import { salesInvoiceDeStrategy } from "./strategies/sales-invoice.de";

/**
 * 1:1 Bounded Context definition for Sales Invoice Menu Item.
 * 
 * Formula: Bounded Context = Bounded State (Aggregate Root) + Bounded Process + Strategies
 */
export const salesInvoiceContext = defineBoundedContext<SalesInvoiceHeader>({
  id: "sales_invoice",
  title: "Satış Faturası Yönetimi",
  titleKey: "title",
  workspace: "selling",
  type: "transactional",
  partyReferenceKey: "customer_id",
  i18nNamespace: "BoundedContext.SalesInvoice",
  state: salesInvoiceState,
  process: salesInvoiceProcess,
  strategies: {
    TR: salesInvoiceTrStrategy,
    DE: salesInvoiceDeStrategy,
  },
  screen: {
    screenId: "sales_invoice",
    screenTitle: "Satış Faturası",
    workspace: "selling",
    category: "interactive_operator",
    aiEnabled: true,
    actions: {
      sign: {
        description: "Faturayı resmileştirir ve mali mühür ile imzalar.",
        inputSchema: z.object({}).optional(),
        whenToCall: "Fatura onaylanıp resmileştirilmek istendiğinde.",
        whenNotToCall: "Fatura zaten imzalanmış veya iptal edilmişse.",
      },
      post: {
        description: "Faturayı genel muhasebe yevmiye defterine kaydeder.",
        inputSchema: z.object({}).optional(),
        whenToCall: "İmzalı fatura muhasebeleştirilmek istendiğinde.",
        whenNotToCall: "Fatura henüz taslak aşamasındaysa veya zaten muhasebeleşmişse.",
      },
      void: {
        description: "Faturayı iptal eder veya ters kayıt oluşturur.",
        inputSchema: z.object({ reason: z.string().optional() }).optional(),
        whenToCall: "Kullanıcı faturayı iptal etmek istediğinde.",
        whenNotToCall: "Fatura zaten iptal edilmişse.",
      },
    },
  },
});

export type SalesInvoiceContext = typeof salesInvoiceContext;
