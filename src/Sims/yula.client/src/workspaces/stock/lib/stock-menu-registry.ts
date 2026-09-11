/**
 * Arama katalogu — TEK KAYNAK: `src/lib/workspace-search-catalog.ts`.
 *
 * Bu dosya yalnızca geriye uyumluluk için re-export sağlar. Menü öğeleri
 * workspace nav tanımlarından (routes.ts) türetilir; küratörlü TR
 * zenginleştirmesi katalog modülündeki `SEARCH_ITEM_OVERRIDES` tablosundadır.
 * Yeni nav modülleri otomatik olarak arama listesine girer.
 */
export {
  ALL_WORKSPACE_MENU_ITEMS,
  ACCOUNTING_WORKSPACE_MENU_ITEMS,
  MANUFACTURING_WORKSPACE_MENU_ITEMS,
  SELLING_WORKSPACE_MENU_ITEMS,
  STOCK_WORKSPACE_MENU_ITEMS,
  SUBCONTRACTING_WORKSPACE_MENU_ITEMS,
  WORKSPACE_SEARCH_CONFIGS,
  type SearchItemOverride,
  type WorkspaceMenuItem,
  type WorkspaceSearchConfig,
} from "@/lib/workspace-search-catalog";
