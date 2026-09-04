import * as React from "react";
import {
  Package,
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
  icon: React.ComponentType<{ className?: string }>;
}

export const WORKSPACE_CARDS: WorkspaceCardItem[] = [
  {
    id: "stock",
    name: "Stock",
    titleLead: "Stok",
    titleTrail: "Yönetimi",
    description: "Stok kartları, bakiyeler, ekstreler ve analitik raporlar",
    url: "/stock",
    icon: Package,
  },
  {
    id: "subcontracting",
    name: "Subcontracting",
    titleLead: "Fason",
    titleTrail: "İşlemleri",
    description: "İç/dış fason siparişleri, irsaliyeler ve teslimat takibi",
    url: "/subcontracting",
    icon: RefreshCw,
  },
  {
    id: "accounting",
    name: "Accounting",
    titleLead: "Muhasebe",
    titleTrail: "& Finans",
    description: "Finansal raporlar, bilanço, kâr/zarar ve genel mizan",
    url: "/accounting",
    icon: BarChart2,
  },
  {
    id: "manufacturing",
    name: "Manufacturing",
    titleLead: "Üretim",
    titleTrail: "Planlama",
    description: "Üretim planları, iş emirleri, BOM ve ürün reçeteleri",
    url: "/manufacturing",
    icon: Factory,
  },
];
