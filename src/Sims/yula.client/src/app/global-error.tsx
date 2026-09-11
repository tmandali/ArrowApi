"use client";

// App-level safety net: in hard errors (hydration/JS crash) it shows an error
// screen instead of a white screen. global-error does not inherit the root
// layout; it MUST set up its own <html>/<body> wrapper. Since hydration
// errors cannot be recovered with a soft reset, the reload performs a full
// reload.
//
// i18n note: this file renders OUTSIDE the root layout, so the next-intl
// client provider (and therefore `useTranslations`) is not available here.
// We statically import both locale catalogs (single source of truth:
// src/messages/*.json) and pick the active one from the NEXT_LOCALE cookie
// after mount. SSR always renders the source locale (tr) to avoid
// hydration mismatches; the switch happens in a post-mount effect.
import * as React from "react";
import { CircleAlert, RotateCw } from "lucide-react";
import trMessages from "@/messages/tr.json";
import enMessages from "@/messages/en.json";

type GlobalErrorMessages = (typeof trMessages)["GlobalError"];

const CATALOGS: Record<"tr" | "en", GlobalErrorMessages> = {
  tr: trMessages.GlobalError,
  en: enMessages.GlobalError,
};

function readLocaleCookie(): "tr" | "en" {
  if (typeof document === "undefined") return "tr";
  const match = document.cookie.match(/(?:^|;\s*)NEXT_LOCALE=([^;]+)/);
  return match?.[1] === "en" ? "en" : "tr";
}

export default function GlobalError(_props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [locale, setLocale] = React.useState<"tr" | "en">("tr");

  React.useEffect(() => {
    // NEXT_LOCALE çerezini mount sonrası oku (SSR'da document yok; ilk SSR
    // geçişi kaynak dilde basılır, hydration mismatchi önlenir).
    // eslint-disable-next-line react/set-state-in-effect -- cookie sync for SSR-safe locale switch
    setLocale(readLocaleCookie());
  }, []);

  const m = CATALOGS[locale];

  return (
    <html lang={locale} suppressHydrationWarning>
      <body className="min-h-full bg-background text-foreground antialiased">
        <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-sm">
          <div className="flex items-center gap-2 font-medium text-destructive">
            <CircleAlert className="size-4" aria-hidden />
            <span>{m.title}</span>
          </div>
          <p className="max-w-md text-center text-xs opacity-70">{m.description}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex h-8 items-center justify-center gap-2 rounded-md border px-3 text-xs font-medium hover:bg-accent"
          >
            <RotateCw className="size-3.5" aria-hidden />
            {m.reload_btn}
          </button>
        </div>
      </body>
    </html>
  );
}
