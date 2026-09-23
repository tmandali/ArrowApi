import { defineJurisdictionStrategy } from "@/lib/contracts/jurisdiction-strategy";
import type { DeliveryNoteHeader } from "../delivery-note.state";

/**
 * Turkey (TR) Country Strategy for Delivery Note.
 * Mandates GİB E-İrsaliye legal requirements (carrier VKN, driver TCKN, vehicle plate, departure time).
 */
export const deliveryNoteTrStrategy = defineJurisdictionStrategy<DeliveryNoteHeader>({
  countryCode: "TR",
  stateAugmentation: {
    fields: {
      gib_uuid: {
        type: "string",
        description: "GİB E-İrsaliye Evrensel Tekil Tanımlayıcısı (UUID)",
        aliases: ["GİB UUID", "ETTN"],
      },
      carrier_vkn: {
        type: "string",
        description: "Taşıyıcı / Kargo Firması VKN veya TCKN",
        aliases: ["Taşıyıcı VKN", "Kargo Firması"],
      },
      driver_tckn: {
        type: "string",
        description: "Taşımayı yapan şoförün T.C. Kimlik Numarası",
        aliases: ["Şoför TCKN", "Sürücü TCKN"],
      },
      plate_number: {
        type: "string",
        description: "Nakil aracının plaka numarası",
        aliases: ["Plaka No", "Araç Plakası"],
      },
      dispatch_time: {
        type: "string",
        description: "Fiili sevk saati (HH:mm formatında)",
        aliases: ["Sevk Saati", "Çıkış Saati"],
      },
    },
    businessRules: [
      "Türkiye'de fiili sevk başlamadan önce e-İrsaliye GİB sistemine başarıyla iletilmiş ve imzalanmış olmalıdır.",
      "Kendi aracıyla sevkiyatlarda plaka numarası ve şoför TCKN zorunludur.",
      "Kargo/Lojistik şirketi ile sevkiyatlarda taşıyıcı firmanın VKN'si zorunludur.",
    ],
  },
});
