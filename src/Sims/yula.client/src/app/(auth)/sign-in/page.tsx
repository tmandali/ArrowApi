"use client";

import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ProviderButtons } from "@/features/auth/components/provider-buttons";
import type { GsiButtonTheme } from "@/features/auth/components/google-one-tap-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/utils/cn";

/**
 * Google buton teması override'ı — undefined = sistemi izle.
 * Kart zemini + yazı renkleri bu değerle senkron tutulur, böylece
 * koyu butonun etrafında beyaz kart kalmaz (ve tersi).
 */
const GOOGLE_THEME: GsiButtonTheme | undefined = undefined;

export default function SignInPage() {
  const t = useTranslations("SignIn");
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";
  // Yönetici tarafından devre dışı bırakılan hesap (AccountStatusGuard
  // sign-out'u buraya düşer) — kullanıcıya sebep gösterilir.
  const isDeactivated = searchParams.get("reason") === "deactivated";
  // Token refresh hatası / oturum süresi dolması
  const isSessionExpired = searchParams.get("reason") === "session_expired";
  // OAuth callback hatası (auth.ts'de pages.error = "/sign-in") —
  // tarayıcıda çıplak `?error=` yerine kartta anlamlı mesaj.
  const oauthError = searchParams.get("error");
  // Explicit tema yoksa kart saf CSS ile sistemi izler (dark: varyantı,
  // flash yok). Explicit tema varsa kart o temaya zorlanır.
  const forceDarkCard = GOOGLE_THEME === "filled_black" || GOOGLE_THEME === "outline_dark";
  const forceLightCard = GOOGLE_THEME === "outline" || GOOGLE_THEME === "filled_blue";

  return (
    <Card
      className={cn(
        "w-full max-w-sm bg-white/70 backdrop-blur-md dark:bg-neutral-900/60",
        forceDarkCard &&
          "border-neutral-700/50 bg-neutral-900/70 dark:border-neutral-700/50 dark:bg-neutral-900/70",
        forceLightCard && "bg-white/70 dark:border-white/40 dark:bg-white/70",
      )}
    >
      <CardHeader className="text-center">
        <CardTitle
          className={cn(
            "text-lg font-semibold",
            forceDarkCard && "text-white dark:text-white",
            forceLightCard && "dark:text-neutral-900",
          )}
        >
          {t("title")}
        </CardTitle>
        <CardDescription
          className={cn(
            forceDarkCard && "text-neutral-400 dark:text-neutral-400",
            forceLightCard && "dark:text-neutral-600",
          )}
        >
          {t("description")}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {isDeactivated && (
          <p
            role="alert"
            className={cn(
              "rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs",
              forceDarkCard ? "text-amber-200" : "text-amber-600 dark:text-amber-300",
            )}
          >
            {t("deactivated_notice")}
          </p>
        )}
        {isSessionExpired && (
          <p
            role="alert"
            className={cn(
              "rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs",
              forceDarkCard ? "text-amber-200" : "text-amber-600 dark:text-amber-300",
            )}
          >
            {t("session_expired_notice")}
          </p>
        )}
        {oauthError ? (
          <div className="flex flex-col gap-1.5">
            <p
              role="alert"
              className={cn(
                "rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs",
                forceDarkCard ? "text-red-200" : "text-red-600 dark:text-red-300",
              )}
            >
              {oauthError === "OAuthAccountNotLinked" ? (
                t("error_account_not_linked")
              ) : (
                t("error_oauth_generic")
              )}
            </p>
            {process.env.NODE_ENV === "development" && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-200">
                <div className="font-mono font-semibold">[DEV] Auth Hata Kodu: {oauthError}</div>
                <div className="mt-1 text-[11px] opacity-90">
                  {oauthError === "Configuration"
                    ? "Sağlayıcı (Google/Keycloak vb.) OIDC uç noktasına bağlanamadı (DNS/Firewall/SSL). Ayrıntı için sunucu terminalindeki [auth][root cause] loguna bakın."
                    : "Ayrıntılı hata ve yığın izi için sunucu konsolundaki [auth] loglarını inceleyin."}
                </div>
              </div>
            )}
          </div>
        ) : null}
        {/* Tek giriş noktası: ilk girişte hesap otomatik oluşur, ayrı
            sign-up akışı yok (/sign-up buraya redirect eder). */}
        <ProviderButtons labelPrefix="sign_in" t={t} next={next} googleTheme={GOOGLE_THEME} />
      </CardContent>
    </Card>
  );
}
