import { useTranslations } from "next-intl";
import type { ComponentType } from "react";
import {
  Package,
  ShoppingCart,
  RefreshCw,
  BarChart2,
  Factory,
} from "lucide-react";

export interface WorkspaceCardItem {
  id: string;
  name: string;
  titleLead: string;
  titleTrail: string;
  description: string;
  url: string;
  icon: ComponentType<{ className?: string }>;
}

/**
 * Workspace kartlarının yapısal alanları (id, ad, url, ikon). Görüntülenen
 * metinler `messages/<locale>.json` → `WorkspaceLanding.cards.<id>` alt
 * ağacından gelir (dil kilitli değildir).
 */
export const WORKSPACE_CARDS_STRUCTURE: Omit<
  WorkspaceCardItem,
  "titleLead" | "titleTrail" | "description"
>[] = [
  {
    id: "stock",
    name: "Stock",
    url: "/stock",
    icon: Package,
  },
  {
    id: "selling",
    name: "Selling",
    url: "/selling",
    icon: ShoppingCart,
  },
  {
    id: "subcontracting",
    name: "Subcontracting",
    url: "/subcontracting",
    icon: RefreshCw,
  },
  {
    id: "accounting",
    name: "Accounting",
    url: "/accounting",
    icon: BarChart2,
  },
  {
    id: "manufacturing",
    name: "Manufacturing",
    url: "/manufacturing",
    icon: Factory,
  },
];

export interface WorkspaceCardText {
  title_lead: string;
  title_trail: string;
  description: string;
}

/**
 * Mevcut locale'e göre tam workspace kart listesini üretir. Yalnız istemci
 * bileşenlerinden çağrılmalıdır.
 */
export function useWorkspaceCards(): WorkspaceCardItem[] {
  const t = useTranslations("WorkspaceLanding");
  const cards = (t.raw("cards") ?? {}) as Record<string, WorkspaceCardText>;
  return WORKSPACE_CARDS_STRUCTURE.map((card) => {
    const s = cards[card.id];
    return {
      ...card,
      titleLead: s?.title_lead ?? card.name,
      titleTrail: s?.title_trail ?? "",
      description: s?.description ?? "",
    };
  });
}
