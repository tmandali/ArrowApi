"use client";

import type { ReactNode } from "react";
import { AppProviders } from "@/context/AppProviders";
import { ThemeProvider } from "@/context/theme-provider";
import { YulaChatProvider } from "@/hooks/yula-chat-provider";
import { PagePanelProvider } from "@/context/page-panel-provider";
import { DocLangSync } from "@/components/app/doc-lang-sync";

export function Providers({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <PagePanelProvider>
        <AppProviders>
          <YulaChatProvider>
            <DocLangSync />
            {children}
          </YulaChatProvider>
        </AppProviders>
      </PagePanelProvider>
    </ThemeProvider>
  );
}
