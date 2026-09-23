import { z } from "zod";
import { defineBoundedContext } from "@/lib/contracts/bounded-context";
import { deliveryNoteState, type DeliveryNoteHeader } from "./delivery-note.state";
import { deliveryNoteProcess } from "./delivery-note.process";
import { deliveryNoteTrStrategy } from "./strategies/delivery-note.tr";
import { deliveryNoteDeStrategy } from "./strategies/delivery-note.de";

/**
 * 1:1 Bounded Context definition for Delivery Note Menu Item.
 * 
 * Formula: Bounded Context = Bounded State (Aggregate Root) + Bounded Process + Strategies
 */
export const deliveryNoteContext = defineBoundedContext<DeliveryNoteHeader>({
  id: "delivery_note",
  title: "Sevk İrsaliyesi Yönetimi",
  titleKey: "title",
  workspace: "stock",
  type: "transactional",
  partyReferenceKey: "customer_id",
  i18nNamespace: "BoundedContext.DeliveryNote",
  state: deliveryNoteState,
  process: deliveryNoteProcess,
  strategies: {
    TR: deliveryNoteTrStrategy,
    DE: deliveryNoteDeStrategy,
  },
  screen: {
    screenId: "delivery_note",
    screenTitle: "Sevk İrsaliyesi",
    workspace: "stock",
    category: "interactive_operator",
    aiEnabled: true,
    actions: {
      dispatch: {
        description: "İrsaliyeyi fiilen sevk edildi durumuna alır.",
        inputSchema: z.object({}).optional(),
        whenToCall: "Depodan mallar fiilen sevk edildiğinde.",
        whenNotToCall: "İrsaliye zaten sevk edilmiş veya iptal edilmişse.",
      },
      invoice: {
        description: "Sevk edilen malları satış faturasına dönüştürür.",
        inputSchema: z.object({}).optional(),
        whenToCall: "İrsaliye faturalaştırılmak istendiğinde.",
        whenNotToCall: "İrsaliye henüz taslak aşamasındaysa veya iptal edilmişse.",
      },
      cancel: {
        description: "İrsaliyeyi iptal eder.",
        inputSchema: z.object({ reason: z.string().optional() }).optional(),
        whenToCall: "Kullanıcı irsaliyeyi iptal etmek istediğinde.",
        whenNotToCall: "İrsaliye faturalaştırılmışsa.",
      },
    },
  },
});

export type DeliveryNoteContext = typeof deliveryNoteContext;
