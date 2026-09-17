"use client";

import * as React from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { useCompanyStore } from "@/store/slices/company-store";
import { useTranslations } from "next-intl";

/**
 * Gizli bileşen — session ↔ şirket store senkron katmanı (providers.tsx).
 *
 * Model: **şirket bilgisi session property'sidir.**
 *  - Session geldiğinde store AYNALANIR (`hydrateFromSession`): yetkili
 *    şirketler `session.user.companies`'tan, aktif şirket
 *    `session.user.activeCompanyId`'den gelir. localStorage'da kalıcı
 *    "aktif şirket" YOKTUR.
 *  - Kullanıcı şirketi anaştığı anda (`store.activeCompanyId` ≠
 *    `session.user.activeCompanyId`) `POST /api/companies/active` yapılır;
 *    route session JWT'sini yeni aktif şirketle yeniden imzalar. Başarıda
 *    client session kopyası `update()` ile eşitlenir (server tarafı zaten
 *    doğru); hata durumunda seçim session değerine İADE edilir.
 */

type SessionUser = {
  companies?: { id: string; name: string; abbr?: string }[];
  activeCompanyId?: string | null;
} & Record<string, unknown>;

export function CompanySessionSync() {
  const t = useTranslations("Company");
  const { data: session, status, update } = useSession();
  const activeCompanyId = useCompanyStore((state) => state.activeCompanyId);
  const lastRequestRef = React.useRef(0);

  const sessionUser = session?.user as SessionUser | undefined;
  const sessionActive = sessionUser?.activeCompanyId ?? null;

  // Session'ın güncel anlık görüntüsü (effect gövdesi içinde okunur;
  // dependency listesi KISIR: POST'u yalnızca store/session ayrımı tetikler).
  const sessionRef = React.useRef<{ session: NonNullable<typeof session>; active: string | null } | null>(null);
  React.useEffect(() => {
    sessionRef.current = session ? { session, active: sessionActive } : null;
  });
  // 1) Session → store: her session değişiminde aynala.
  React.useEffect(() => {
    useCompanyStore.getState().hydrateFromSession(
      sessionUser?.companies ?? [],
      sessionActive,
      status === "authenticated",
    );
  }, [sessionUser?.companies, sessionActive, status]);

  // 2) Store → session: store'daki seçim session'dan farklıysa sunucuya yaz.
  React.useEffect(() => {
    if (status !== "authenticated" || !activeCompanyId) return;
    if (activeCompanyId === sessionActive) return;

    const requestId = ++lastRequestRef.current;
    let cancelled = false;
    (async () => {
      let response: Response | null = null;
      try {
        response = await fetch("/api/companies/active", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ companyId: activeCompanyId }),
        });
      } catch {
        response = null;
      }
      if (cancelled) return;

      if (response?.ok) {
        // Sunucu tarafı doğru; client session kopyasını eşitle ki
        // senkron etkene yeniden POST tetiklemesin.
        if (requestId === lastRequestRef.current) {
          const snapshot = sessionRef.current;
          if (snapshot) {
            void update({
              ...snapshot.session,
              user: {
                ...snapshot.session.user,
                activeCompanyId,
              },
            });
          }
        }
      } else {
        // Hata → seçim session değerine iade edilir (uygulama kullanılmaz
        // durumda KALMAZ; en kötü ihtimalle eski şirkette devam edilir).
        if (requestId === lastRequestRef.current) {
          const store = useCompanyStore.getState();
          // Yalnızca hata veren istek Hâlâ en son istekse iade et —
          // üzerine yığılan yeni bir seçimi ezme.
          if (store.activeCompanyId === activeCompanyId) {
            store.rollbackTo(sessionActive);
            toast.error(t("sync_failed"));
          }
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeCompanyId, sessionActive, status, update, t]);

  return null;
}
