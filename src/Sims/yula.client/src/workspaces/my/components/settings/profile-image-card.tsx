"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { useSession } from "next-auth/react";
import { Loader2, RefreshCw, Check, TriangleAlert } from "lucide-react";
import { cn } from "@/utils/cn";
import { setLocalProfileImage, useLocalProfileImage } from "@/features/auth/lib/local-profile-image";
import { profileInitialsOf } from "./settings-utils";

/**
 * user-details sekmesinin SAĞ KENAR PANELİNDEKİ profil resmi:
 * - Resim: önce session (`user.image` — giriş anındaki değer), taze getirme
 *   başarılıysa o (`fetchedImage`) öne geçer.
 * - Hover'da görünen "Yeniden getir" butonu: `GET /api/auth/userinfo` proxy'si
 *   üzerinden provider'ın (Google/Keycloak) taze userinfo'sunu çeker.
 * - Sağlayıcı resim vermiyorsa (hesapta profil fotoğrafı yok) alttaki
 *   statü satırı bunu dürüstçe gösterir — fallback initials korunur.
 */
type SyncState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "fresh"; at: string; hasPicture: boolean }
  | { kind: "no-token" }
  | { kind: "error" };

export function ProfileImageCard() {
  const t = useTranslations("MySettings");
  const { data: session } = useSession();
  const user = session?.user;

  const [fetchedImage, setFetchedImage] = React.useState<string | null>(null);
  const [sync, setSync] = React.useState<SyncState>({ kind: "idle" });
  // Radix Avatar'ın state makinesi yerine düz <img> + onError:
  // resim yüklenemezse yalnız o URL için initials'e düş (yeniden getirde
  // yeni URL gelince resim tekrar denenir).
  const [brokenSrc, setBrokenSrc] = React.useState<string | null>(null);

  // Görüntülenecek resim: taze getirilen > session/yerel kayıt > yok
  // (initials). Yerel kayıt: önceki "Yeniden getir" başarısında saklanan
  // URL — reload sonrası da rozetle eşleşmeyi sağlar.
  const baseImage = useLocalProfileImage(user?.image);
  const shownImage = fetchedImage ?? baseImage;
  const imgBroken = shownImage !== null && brokenSrc === shownImage;

  const handleRefresh = React.useCallback(async () => {
    setSync({ kind: "loading" });
    try {
      const res = await fetch("/api/auth/userinfo", { cache: "no-store" });
      if (res.status === 409) {
        setSync({ kind: "no-token" });
        return;
      }
      if (!res.ok) {
        setSync({ kind: "error" });
        return;
      }
      const data = (await res.json()) as { picture?: string | null };
      const picture = data.picture ?? null;
      setFetchedImage(picture);
      // Başarılı getirme → yerel kayıt: header rozeti dahil tüm
      // uygulama aynı resimle eşleşir (bkz. local-profile-image.ts).
      setLocalProfileImage(picture);
      setSync({ kind: "fresh", at: new Date().toISOString(), hasPicture: !!picture });
    } catch {
      setSync({ kind: "error" });
    }
  }, []);

  // Statü satırı + rengi: yalnız dikkat çeken durumlarda görünür
  // (token yok / hata / hesapta resim yok). Başarı halleri sessizdir —
  // "Taze alındı" satırı gürültüydü.
  let statusText = "";
  let statusClass = "text-muted-foreground";
  switch (sync.kind) {
    case "loading":
      statusText = t("image_loading");
      statusClass = "text-muted-foreground";
      break;
    case "fresh":
      if (!sync.hasPicture) {
        statusText = t("image_no_picture");
        statusClass = "text-amber-600 dark:text-amber-400";
      }
      break;
    case "no-token":
      statusText = t("image_no_token");
      statusClass = "text-amber-600 dark:text-amber-400";
      break;
    case "error":
      statusText = t("image_fetch_error");
      statusClass = "text-red-600 dark:text-red-400";
      break;
    case "idle":
      break;
  }

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="group/avatar relative shrink-0">
        {shownImage && !imgBroken ? (
          <img
            src={shownImage}
            alt={user?.name ?? ""}
            onError={() => setBrokenSrc(shownImage)}
            className="size-14 rounded-full object-cover shadow-xs ring-1 ring-border"
          />
        ) : (
          <div
            className="flex size-14 items-center justify-center rounded-full bg-linear-to-br from-primary/25 to-primary/10 text-sm font-semibold tracking-wider text-foreground shadow-xs ring-1 ring-border"
          >
            {profileInitialsOf(user?.name ?? "")}
          </div>
        )}
        {/* Hover'da beliren "Yeniden getir" butonu — aynı anda statü
            göstergesi: spinning (yükleniyor), onay (başarılı), uyarı
            (token/hata). Renk statüyle eşleşir. */}
        <button
          type="button"
          onClick={handleRefresh}
          disabled={sync.kind === "loading"}
          title={t("image_refresh")}
          aria-label={t("image_refresh")}
          className={cn(
            "absolute -bottom-1 -right-1 z-10 flex size-7 items-center justify-center rounded-full",
            "bg-background ring-1 ring-border shadow-sm text-muted-foreground",
            "hover:text-foreground transition-all cursor-pointer",
            "opacity-0 group-hover/avatar:opacity-100 focus-visible:opacity-100",
            sync.kind === "loading" && "opacity-100 cursor-wait",
            sync.kind === "no-token" && "opacity-100 text-amber-600 dark:text-amber-400 hover:text-amber-600 dark:hover:text-amber-400",
            sync.kind === "error" && "opacity-100 text-red-600 dark:text-red-400 hover:text-red-600 dark:hover:text-red-400",
          )}
        >
          {sync.kind === "loading" ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : sync.kind === "fresh" ? (
            <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" />
          ) : sync.kind === "no-token" || sync.kind === "error" ? (
            <TriangleAlert className="size-3.5" />
          ) : (
            <RefreshCw className="size-3.5" />
          )}
        </button>
      </div>
      {/* Tek satır durum: yalnız hata/dikkat anlarında görünür
          (token yok, getirme hatası, hesapta resim yok). Başarıda
          sessiz — boştaysa satır hiç render edilmez. */}
      {statusText ? <p className={cn("max-w-full truncate text-[10px]", statusClass)}>{statusText}</p> : null}
    </div>
  );
}
