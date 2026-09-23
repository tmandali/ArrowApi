import type { BoundedStateDefinition } from "@/lib/contracts/bounded-context";

export interface GeneralLedgerFilterState {
  company?: string;
  account?: string;
  from_date?: string;
  to_date?: string;
  include_unposted?: boolean;
  cost_center?: string;
}

/**
 * Bounded State for General Ledger (Muavin / Büyük Defter / Hauptbuch).
 * CQRS Analytical Read Model for debit/credit journal entries and running balance.
 */
export const generalLedgerState: BoundedStateDefinition<GeneralLedgerFilterState> = {
  entityName: "GeneralLedgerReport",
  description: "Şirket hesap planı bazında borç, alacak ve bakiye hareketlerini listeleyen büyük defter (muavin) raporu.",
  fields: {
    company: {
      description: "Raporun çekileceği şirket kodu",
      type: "string",
    },
    account: {
      description: "Sorgulanan muhasebe hesap kodu (örn: 100, 102, 120, 320)",
      aliases: ["Hesap Kodu", "Konto", "G/L Account"],
      type: "string",
    },
    from_date: {
      description: "Muavin başlangıç tarihi",
      aliases: ["Başlangıç Tarihi", "Start Date"],
      type: "date",
    },
    to_date: {
      description: "Muavin bitiş tarihi",
      aliases: ["Bitiş Tarihi", "End Date"],
      type: "date",
    },
    include_unposted: {
      description: "Taslak (onay bekleyen) yevmiye kayıtları dahil edilsin mi",
      aliases: ["Taslakları Dahil Et"],
      type: "boolean",
    },
    cost_center: {
      description: "Masraf / Kar merkezi filtresi",
      aliases: ["Masraf Merkezi", "Kostenstelle"],
      type: "string",
    },
  },
  businessRules: [
    "Muavin raporunda her hesabın açılış bakiyesi, dönemiçi borç/alacak toplamı ve kapanış bakiyesi gösterilir.",
    "Tüm para birimleri şirket ana para birimine (para birimi dönüştürme kuru ile) konsolide edilebilir.",
  ],
};
