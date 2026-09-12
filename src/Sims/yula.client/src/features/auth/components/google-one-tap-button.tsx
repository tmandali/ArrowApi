"use client";

/**
 * Google One Tap (Google Identity Services) — tıklanabilir GIS giriş butonu.
 *
 * Akış:
 *  1. `https://accounts.google.com/gsi/client` script'i dinamik yüklenir.
 *  2. `google.accounts.id.initialize({ client_id, callback })` + tıklanabilir
 *     GIS butonu (`renderButton`) çizilir. Otomatik sağ üst kartı
 *     (`prompt()`) bu buton değil, root layout'ta global olarak monte edilen
 *     `GoogleOneTapPrompt` (bkz. src/app/layout.tsx) tetkler; kart no_op /
 *     kapatılırsa bu buton fallback olarak kalır.
 *  3. Callback ID token döndürür → `signIn("google-onesig", { id_token })`
 *     (auth.ts'teki google-onesig credentials provider'ı; server'da
 *     JWT bearer ile doğrulanır — ortak yardımcı: google-onesig-signin.ts).
 *  4. Buton yalnızca oturum yokken render edilir; `NEXT_PUBLIC_GOOGLE_CLIENT_ID`
 *     (build'de AUTH_GOOGLE_ID'den türetilir, bkz. next.config.ts) yoksa null.
 *
 * Konum: sign-in kartındaki provider listesi (ProviderButtons, One Tap
 * modu `GOOGLE_ONE_TAP=1` iken OAuth redirect butonunun yerine geçer).
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { isGoogleOneTapEnabled } from "@/features/auth/lib/google-one-tap-flag";
import { initGsiClient, type GsiIdClient } from "@/features/auth/lib/gsi-client";
import { signInWithGoogleCredential } from "@/features/auth/lib/google-onesig-signin";


export type GsiButtonTheme = "outline" | "filled_blue" | "filled_black" | "outline_dark";

/**
 * Efektif GIS temasını çözer: explicit theme kazanır, verilmezse sistem
 * temasını izler (dark → outline_dark, light → outline).
 */
export function resolveGsiButtonTheme(
  theme: GsiButtonTheme | undefined,
  resolvedTheme: string | undefined,
): GsiButtonTheme {
  return theme ?? (resolvedTheme === "dark" ? "outline_dark" : "outline");
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
  /** GIS teması — verilmezse sistem temasını izler (dark → outline_dark). */
  theme?: GsiButtonTheme;
}

export function GoogleOneTapButton({
  size = "large",
  // Sign-in kartı (max-w-sm, içeriği ~336px) ile aynı hizada dursun diye.
  width = 336,
  label,
  className,
  theme,
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
  // Tema verilmezse sistem temasını izle: dark → outline_dark (resmi koyu
  // tema, Fill #131314), light → outline. resolvedTheme hydration öncesi
  // undefined'tır; yanlış temayla ilk çizimi önlemek için mount beklenir.
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    setMounted(true);
  }, []);
  const effectiveTheme = resolveGsiButtonTheme(theme, mounted ? resolvedTheme : undefined);
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
        const result = await signInWithGoogleCredential(credential, router);
        if (result?.error) {
          setFailed(true);
          return;
        }
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
          theme: effectiveTheme,
          size,
          width: String(Math.max(200, Math.round(pixelWidth))),
          shape: "rectangular",
          text: "signin",
        });
      } catch {
        // GIS API arızası → buton boş kalır, UI kırılmaz.
      }
    },
    [size, effectiveTheme],
  );

  React.useEffect(() => {
    // Mount öncesi resolvedTheme bilinmez (hydration); yanlış temayla ilk
    // çizimi önlemek için GIS init'i mount sonrasına bırakılır.
    if (!mounted || !clientId || !oneTapEnabled || authenticated) return;
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    let observer: ResizeObserver | null = null;

    void initGsiClient(clientId, (credential) => {
      if (cancelled) return;
      void handleCredential(credential);
    }).then((gsi) => {
      if (!gsi || cancelled) return;
      gsiRef.current = gsi;
      // Otomatik kart (prompt) bu butonda çağrılmaz — global olarak root
      // layout'taki GoogleOneTapPrompt üstlenir (sayfa başına tek seferlik).
      // Buradaki tek iş: tıklanabilir fallback butonu çizmek.
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
  }, [mounted, clientId, oneTapEnabled, authenticated, handleCredential, width]);

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
      // GIS kendi butonunu çizer — dışarıdan bg/padding/border/rounded
      // eklenmez, buton native haliyle bırakılır. GIS bir ara div + iframe
      // çizer; tüm katmanlar transparan bırakılır, iframe block yapılır
      // (inline baz çizgisi boşluğu kartın zeminini göstermesin).
      // color-scheme: light — koyu sayfada iframe canvas'ı opak beyaza
      // dönmesin diye (toplulukta kanıtlanmış GIS dark-mode düzeltmesi);
      // butonun kendi çizimine dokunmaz.
      className={`relative min-h-10 bg-transparent ${className ?? ""} [&_iframe]:block [&_iframe]:!bg-transparent [&>div]:bg-transparent`}
      style={{ colorScheme: "light" }}
      title={accessibleLabel}
      aria-label={accessibleLabel}
    >
      {/* Busy durumundayken GIS butonu geçici gizlenir, spinner gösterilir. */}
      <div ref={containerRef} className={`w-full bg-transparent ${busy ? "hidden" : ""}`} />
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
