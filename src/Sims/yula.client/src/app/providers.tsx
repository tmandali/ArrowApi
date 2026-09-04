"use client";

import type { ReactNode } from "react";
import { AppProviders } from "@/context/AppProviders";
import { ThemeProvider } from "@/context/theme-provider";
import { YulaChatProvider } from "@/hooks/yula-chat-provider";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <AppProviders>
        <YulaChatProvider>{children}</YulaChatProvider>
      </AppProviders>
    </ThemeProvider>
  );
}
