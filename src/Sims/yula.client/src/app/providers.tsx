"use client";

import type { ReactNode } from "react";
import { AppProviders } from "@/context/AppProviders";
import { ThemeProvider } from "@/context/theme-provider";
import { YulaChatProvider } from "@/hooks/yula-chat-provider";
import { PagePanelProvider } from "@/context/page-panel-provider";
import { DocLangSync } from "@/components/app/doc-lang-sync";
import { AuthHeaderSync } from "@/components/app/auth-header-sync";
import { AccountStatusGuard } from "@/components/app/account-status-guard";
import { SessionProvider } from "next-auth/react";

export function Providers({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <SessionProvider>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        <PagePanelProvider>
          <AppProviders>
            <YulaChatProvider>
              <AuthHeaderSync />
              <AccountStatusGuard />
              <DocLangSync />
              {children}
            </YulaChatProvider>
          </AppProviders>
        </PagePanelProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}
