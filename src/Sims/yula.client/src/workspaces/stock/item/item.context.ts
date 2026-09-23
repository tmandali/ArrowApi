import { defineBoundedContext } from "@/lib/contracts/bounded-context";
import { StockItemContract } from "./components/stock-item.contract";
import { itemState, type StockItemState } from "./item.state";
import { itemTrStrategy } from "./strategies/item.tr";
import { itemDeStrategy } from "./strategies/item.de";

/**
 * 1:1 Bounded Context definition for Stock Item Menu Item.
 * 
 * Formula: Bounded Context = Bounded State + Bounded Process (Süreçsiz Master Data)
 */
export const itemContext = defineBoundedContext<StockItemState>({
  id: "stock_item",
  title: "Malzeme Yönetimi (Stok Kartı)",
  titleKey: "title",
  workspace: "stock",
  type: "masterdata",
  i18nNamespace: "BoundedContext.StockItem",
  state: itemState,
  strategies: {
    TR: itemTrStrategy,
    DE: itemDeStrategy,
  },
  // Master data does not require a transactional lifecycle state machine
  process: undefined,
  screen: {
    ...StockItemContract,
  },
});

export type ItemContext = typeof itemContext;
