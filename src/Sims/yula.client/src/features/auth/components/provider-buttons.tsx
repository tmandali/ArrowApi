"use client";

/**
 * Dinamik provider butonları.
 *
 * NextAuth'a kayıtlı (yani .env'te gerçekten yapılandırılmış) provider'ları
 * `getProviders()` üzerinden okur ve YALNIZCA onları çizer. Env'de olmayan /
 * koşullu olarak register edilmeyen provider'lar ekranda görünmez.
 *
 * Yeni provider eklenmesi → auth.ts + .env yeter; bu bileşen otomatik tanır.
 * Tanımlı olmayan provider'lar için genel bir fallback (ikon + provider.name) var.
 */
import * as React from "react";
import { getProviders, signIn } from "next-auth/react";
import { providerSignInParams } from "@/features/auth/lib/provider-signin-params";
import { isGoogleOneTapEnabled } from "@/features/auth/lib/google-one-tap-flag";
import { GoogleOneTapButton, type GsiButtonTheme } from "@/features/auth/components/google-one-tap-button";
import { Button } from "@/components/ui/button";
import {
  Fingerprint,
  Globe,
  KeyRound,
  Loader2,
  type LucideIcon,
} from "lucide-react";

// getProviders() → Record<ProviderId, ClientSafeProvider> | null
// (ClientSafeProvider bu sürümde next-auth/react'ten export edilmediği için türetiyoruz)
type Providers = NonNullable<Awaited<ReturnType<typeof getProviders>>>;

/**
 * Sign-in ekranında GİZLİ provider'lar — getProviders() bunları döndürür
 * ama buton olarak çizilmez:
 *  - google-onesig: GIS credential akışının server karşılığı, butonu
 *    GoogleOneTapButton çizer (aşağıda).
 *  - google: One Tap modu açıkken (GOOGLE_ONE_TAP=1) OAuth redirect butonu
 *    gizlenir — yerine listedeki GIS butonu geçer, çift buton çıkmaz.
 */
const HIDDEN_PROVIDER_IDS = new Set(["google-onesig"]);

/** provider id → buton görünümü. Yeni provider'lar buraya eklenir. */
const PROVIDER_UI: Record<string, { icon: LucideIcon; variant: "default" | "outline" }> = {
  keycloak: { icon: KeyRound, variant: "default" },
  google: { icon: Globe, variant: "outline" },
};

const FALLBACK_UI = { icon: Fingerprint, variant: "outline" as const };

interface ProviderButtonsProps {
  /**
   * Etiket anahtarını üreten prefix. Örn. `${labelPrefix}_${providerId}`
   * (sign_in_google). Bu anahtarın useTranslations'ın namespace'inde
   * tanımlı olması gerekir.
   */
  labelPrefix: string;
  /** Doğru namespace'de (labelPrefix'in ait olduğu) useTranslations fonksiyonu. */
  t: (key: string) => string;
  /** Giriş sonrası yönlendirilecek URL. */
  next?: string | null;
  /** GIS buton teması — verilmezse sistem temasını izler. */
  googleTheme?: GsiButtonTheme;
}

export function ProviderButtons({ labelPrefix, t, next = "/", googleTheme }: ProviderButtonsProps) {
  const [providers, setProviders] = React.useState<Providers | null>(null);
  const [loading, setLoading] = React.useState<string | null>(null);

  React.useEffect(() => {
    getProviders()
      .then((p) => setProviders(p ?? ({} as Providers)))
      .catch(() => setProviders({} as Providers));
  }, []);

  const handleProvider = async (id: string) => {
    setLoading(id);
    try {
      await signIn(id, { redirectTo: next ?? "/" }, providerSignInParams(id));
    } catch {
      setLoading(null);
    }
  };

  // Provider listesi hâlâ yükleniyor → spinner (i18n'sız, sadeliği koru).
  if (providers === null) {
    return (
      <div className="flex items-center justify-center gap-2 py-2 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
      </div>
    );
  }

  const available = Object.values(providers).filter(
    (p) => !HIDDEN_PROVIDER_IDS.has(p.id) && !(p.id === "google" && isGoogleOneTapEnabled()),
  );
  // One Tap modu: OAuth redirect butonu yerine GIS butonu listenin en üstünde.
  // (clientId yoksa GoogleOneTapButton null döner, yer kaplamaz.)
  const showOneTapButton = isGoogleOneTapEnabled();
  if (available.length === 0 && !showOneTapButton) {
    return (
      <p className="text-center text-sm text-muted-foreground">{t("no_providers")}</p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {showOneTapButton ? (
        <GoogleOneTapButton
          label={t(`${labelPrefix}_google`)}
          className="min-h-10 w-full"
          theme={googleTheme}
        />
      ) : null}
      {available.map((p) => {
        const ui = PROVIDER_UI[p.id] ?? FALLBACK_UI;
        const Icon = ui.icon;
        // Bilinen provider'lar i18n anahtarı taşır (sign_in_google vb.); bilinmeyenler
        // provider adıyla düşer. Bu anahtar labelPrefix'in ait olduğu namespace'te tanımlıdır.
        const label = PROVIDER_UI[p.id] ? t(`${labelPrefix}_${p.id}`) : p.name;
        return (
          <Button
            key={p.id}
            variant={ui.variant}
            // Standart satır ölçüsü: GIS "large" butonu 40px'tir — tüm
            // provider butonları h-10 + w-full ile aynı satırda durur
            // (cn() içindeki tailwind-merge h-7'yi ezer).
            className="h-10 w-full"
            type="button"
            onClick={() => void handleProvider(p.id)}
            disabled={loading !== null}
          >
            {loading === p.id ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Icon className="mr-2 size-4" />
            )}
            {label}
          </Button>
        );
      })}
    </div>
  );
}
