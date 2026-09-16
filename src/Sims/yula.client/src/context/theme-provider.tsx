"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";
import type { ThemeProviderProps } from "next-themes";

// React 19 + Next.js 16 ile next-themes'in FOUC önleme script tag'i için fırlattığı
// bilinen geliştirme uyarısını sustur (işlevselliği etkilemez).
// Ayrıca GIS'in (Google One Tap) zararsız konsol satırlarını sustur:
//  - FedCM get() gösterilemediğinde bastığı `[GSI_LOGGER]: FedCM get() rejects…`
//    (FedCM Ağustos 2025'ten beri zorunlu, bayrakla kapatılamıyor; oturum yok /
//     FedCM engelliyse GIS bu reddi konsola basar ama akış fallback butonla sürer).
//  - Otomatik One Tap kartının popup olarak açılıp tarayıcı popup-engelleyiciye
//    takılması: `[GSI_LOGGER]: Failed to open popup window…` (sign-in ekranındaki
//     tıklanabilir GIS butonu fallback olarak kalır; bkz. google-one-tap-button).
// İkiside yalnızca development'te susturulur; üretim konsolu olduğu gibi kalır.
if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
  const origError = console.error;
  const isKnownGsiNoise = (msg: string) =>
    msg.includes("[GSI_LOGGER]") &&
    (msg.includes("FedCM get() rejects") ||
      msg.includes("Failed to open popup window"));
  console.error = (...args: unknown[]) => {
    if (
      typeof args[0] === "string" &&
      (args[0].includes("Encountered a script tag while rendering React component") ||
        isKnownGsiNoise(args[0]))
    ) {
      return;
    }
    origError.apply(console, args);
  };
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
}

function ThemeHotkey() {
  const { resolvedTheme, setTheme } = useTheme();

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.repeat) {
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      if (event.key?.toLowerCase() !== "d") {
        return;
      }

      if (isTypingTarget(event.target)) {
        return;
      }

      event.preventDefault();
      setTheme(resolvedTheme === "dark" ? "light" : "dark");
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [resolvedTheme, setTheme]);

  return null;
}

export function ThemeProvider({
  children,
  ...props
}: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      {...props}
    >
      <ThemeHotkey />
      {children}
    </NextThemesProvider>
  );
}
