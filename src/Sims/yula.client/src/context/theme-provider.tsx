"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";
import type { ThemeProviderProps } from "next-themes";

// React 19 + Next.js 16 ile next-themes'in FOUC önleme script tag'i için fırlattığı
// bilinen geliştirme uyarısını sustur (işlevselliği etkilemez).
// Ayrıca GIS'in (Google One Tap) FedCM get() gösterilemediğinde bastığı zararsız
// `[GSI_LOGGER]: FedCM get() rejects…` satırını sustur: FedCM Ağustos 2025'ten
// beri zorunlu, bayrakla kapatılamıyor; oturum yok / FedCM engelliyse GIS bu
// reddi konsola basar ama akış fallback butonla sürer (bkz. google-one-tap-button).
if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
  const origError = console.error;
  console.error = (...args: unknown[]) => {
    if (
      typeof args[0] === "string" &&
      (args[0].includes("Encountered a script tag while rendering React component") ||
        (args[0].includes("[GSI_LOGGER]") && args[0].includes("FedCM get() rejects")))
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
