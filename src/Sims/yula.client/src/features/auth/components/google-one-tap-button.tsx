"use client";

/**
 * Google One Tap (Google Identity Services) — tıklanabilir GIS giriş butonu.
 *
 * Akış:
 *  1. `https://accounts.google.com/gsi/client` script'i dinamik yüklenir.
 *  2. `google.accounts.id.initialize({ client_id, callback })` + tıklanabilir
 *     GIS butonu (`renderButton`) çizilir. Otomatik One Tap kartı (`prompt()`)
 *     bilinçli çağrılmaz — sayfa açılışında fırlayan "Google ile devam et"
 *     kartı istenmiyor.
 *  3. Callback ID token döndürür → `signIn("google-onesig", { id_token })`
 *     (auth.ts'teki google-onesig credentials provider'ı; server'da
 *     JWT bearer ile doğrulanır).
 *  4. Buton yalnızca oturum yokken render edilir; `NEXT_PUBLIC_GOOGLE_CLIENT_ID`
 *     (build'de AUTH_GOOGLE_ID'den türetilir, bkz. next.config.ts) yoksa null.
 *
 * Konum: sign-in kartındaki provider listesi (ProviderButtons, One Tap
 * modu `GOOGLE_ONE_TAP=1` iken OAuth redirect butonunun yerine geçer).
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { isGoogleOneTapEnabled } from "@/features/auth/lib/google-one-tap-flag";

interface GsiCredentialResponse {
  credential?: string;
  select_account?: boolean;
}

interface GsiIdClient {
  initialize: (config: {
    client_id: string;
    callback: (response: GsiCredentialResponse) => void;
  }) => void;
  renderButton: (container: HTMLElement, config?: Record<string, string>) => void;
}

declare global {
  interface Window {
    google?: { accounts?: { id?: GsiIdClient } };
  }
}

const GSI_SCRIPT_ID = "gsi-client-script";

function loadGsiScript(): Promise<GsiIdClient | null> {
  return new Promise((resolve) => {
    const existing = window.google?.accounts?.id;
    if (existing) {
      resolve(existing);
      return;
    }
    const existingScript = document.getElementById(GSI_SCRIPT_ID) as HTMLScriptElement | null;
    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(window.google?.accounts?.id ?? null), {
        once: true,
      });
      return;
    }
    const script = document.createElement("script");
    script.id = GSI_SCRIPT_ID;
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.addEventListener(
      "load",
      () => resolve(window.google?.accounts?.id ?? null),
      { once: true },
    );
    script.addEventListener("error", () => resolve(null), { once: true });
    document.head.appendChild(script);
  });
}

export interface GoogleOneTapButtonProps {
  /** GIS buton boyutu — "large" 40px'tir (shadcn h-10 ile aynı satır). */
  size?: "small" | "medium" | "large";
  /**
   * Yedek genişlik (px). Asıl ölçü kap genişliğinden alınır
   * (ResizeObserver) — Keycloak `w-full` butonuyla birebir hiza için.
   */
  width?: number;
  /** title/aria-label metni; verilmezse SystemHome.google_one_tap kullanılır. */
  label?: string;
  /** Dış sarmalayıcıya eklenecek class. */
  className?: string;
}

export function GoogleOneTapButton({
  size = "large",
  // Sign-in kartı (max-w-sm, içeriği ~336px) ile aynı hizada dursun diye.
  width = 336,
  label,
  className,
}: GoogleOneTapButtonProps = {}) {
  const t = useTranslations("SystemHome");
  const router = useRouter();
  const { status } = useSession();
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [busy, setBusy] = React.useState(false);
  // Son giriş denemesi server'da reddedildiyse kullanıcıya gösterilir
  // (eskiden sessizce yutuluyordu — örn. token doğrulama hatası).
  const [failed, setFailed] = React.useState(false);

  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const authenticated = status === "authenticated";
  // One Tap modu env bayrağıyla açılır (GOOGLE_ONE_TAP=1); kapalıysa Google
  // girişi çizilmez — sign-in ekranındaki Google OAuth butonu görünür.
  const oneTapEnabled = isGoogleOneTapEnabled();
  const accessibleLabel = label ?? t("google_one_tap");
  const gsiRef = React.useRef<GsiIdClient | null>(null);
  // Kap genişliğinden ölçülen piksel (standart hizalama). İlk ölçüme kadar null.
  const [fluidWidth, setFluidWidth] = React.useState<number | null>(null);

  const handleCredential = React.useCallback(
    async (credential: string) => {
      setBusy(true);
      setFailed(false);
      try {
        // redirect:false → sonuç döner; error alanı doluysa session oluşmadı.
        // (next-auth v5 beta tipinde credentials yanıtı daraltılamadığı için
        // gevşek tip kullanılır.)
        const result = (await signIn("google-onesig", { id_token: credential }, { redirect: false })) as
          | { error?: string | null }
          | undefined;
        if (result?.error) {
          setFailed(true);
          return;
        }
        // Başarılı ya da değil, sunucu tarafında state değişmiş olabilir →
        // RSC + useSession'ı tazele; oturum oluştuysa buton kendiliğinden gizlenir.
        await router.refresh();
      } catch {
        // Ağ/sign-in hatası → buton görünür kalır, yeniden denenebilir.
        setFailed(true);
      } finally {
        setBusy(false);
      }
    },
    [router],
  );

  // Standartlara uyum: shadcn Button (h-10 ≈ 40px, rectangular) ile aynı
  // satır yüksekliği, köşe formu ve kap genişliği — GIS'in resmi
  // stillendirme parametreleriyle (özel Google butonu çizmek marka
  // kurallarına aykırı, o yüzden renderButton kullanılmaya devam).
  const renderGsiButton = React.useCallback(
    (gsi: GsiIdClient, container: HTMLElement, pixelWidth: number) => {
      try {
        container.innerHTML = "";
        gsi.renderButton(container, {
          theme: "outline",
          size,
          width: String(Math.max(200, Math.round(pixelWidth))),
          shape: "rectangular",
          text: "signin",
        });
      } catch {
        // GIS API arızası → buton boş kalır, UI kırılmaz.
      }
    },
    [size],
  );

  React.useEffect(() => {
    if (!clientId || !oneTapEnabled || authenticated) return;
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    let observer: ResizeObserver | null = null;

    void loadGsiScript().then((gsi) => {
      if (!gsi || cancelled) return;
      try {
        gsi.initialize({
          client_id: clientId,
          callback: (response) => {
            if (response?.credential) void handleCredential(response.credential);
          },
        });
      } catch {
        return;
      }
      gsiRef.current = gsi;
      // Otomatik One Tap kartı bilinçli GÖSTERİLMEZ (prompt() çağrılmaz):
      // sayfa açılışında "Google ile devam et" diye fırlayan kart
      // istenmiyor. Yalnızca tıklanabilir GIS butonu çizilir
      // (FedCM dışı klasik buton akışı — FedCM konsol gürültüsü de çıkmaz).
      const initial = container.offsetWidth > 0 ? container.offsetWidth : width;
      setFluidWidth((prev) => (prev === Math.round(initial) ? prev : Math.round(initial)));
      observer = new ResizeObserver((entries) => {
        const next = Math.round(entries[0]?.contentRect.width ?? 0);
        if (next <= 0) return;
        setFluidWidth((prev) => (prev === next ? prev : next));
      });
      observer.observe(container);
    });

    return () => {
      cancelled = true;
      observer?.disconnect();
      gsiRef.current = null;
    };
  }, [clientId, oneTapEnabled, authenticated, handleCredential, width]);

  // Ölçülen genişlik değişince (kart/pencere resize) butonu aynı kapta
  // Keycloak w-full butonuyla birebir aynı ölçüde yeniden çiz.
  React.useEffect(() => {
    const gsi = gsiRef.current;
    const container = containerRef.current;
    if (gsi == null || container == null || fluidWidth == null || busy) return;
    renderGsiButton(gsi, container, fluidWidth);
  }, [fluidWidth, busy, renderGsiButton]);

  // Oturum var, env eksik ya da One Tap modu kapalı → ekran yerini kapma.
  if (authenticated || !clientId || !oneTapEnabled) return null;

  return (
    <div
      // [&>iframe]:block — GIS iframe'i inline elementtir; block yapılmazsa
      // satır baz çizgisi altında ~4px boşluk bırakır ve satır Keycloak
      // h-10 butonundan uzun görünür.
      className={`${className ?? "relative shrink-0"} min-h-10 [&>iframe]:block`}
      title={accessibleLabel}
      aria-label={accessibleLabel}
    >
      {/* Busy durumundayken GIS butonu geçici gizlenir, spinner gösterilir. */}
      <div ref={containerRef} className={busy ? "hidden" : undefined} />
      {busy ? (
        <div className="flex h-10 items-center px-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
        </div>
      ) : null}
      {failed && !busy ? (
        <p role="alert" className="mt-1 text-center text-xs text-destructive">
          {t("google_signin_failed")}
        </p>
      ) : null}
    </div>
  );
}
