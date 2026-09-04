"use client";

import * as React from "react";
import { YulaMarkIcon } from "@/components/layout/yula-brand";
import { useMounted } from "@/hooks/use-mounted";
import { formatDate, greetingFor } from "@/lib/welcome-format";

export function WelcomeShortcutCards(
  _props: {
    onYulaClick?: () => void;
  },
) {
  return null;
}

/**
 * Home karşılama ekranı: Yula'yı açma, gerçek raporlara kısayollar.
 */
export function WelcomeScreen() {
  const mounted = useMounted();
  const now = React.useMemo(() => new Date(), []);
  const greeting = mounted ? greetingFor(now) : "Hoş geldiniz";
  const dateLabel = mounted ? formatDate(now) : null;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-8 py-14">
      <div className="flex flex-col items-center gap-5 text-center">
        <YulaMarkIcon className="size-14" />
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">{greeting}</h1>
                  <p className="text-sm text-muted-foreground">
            Yula, yol gösteren ışık veren anlanımına gelir. Size yardımcı olmak için burada
          </p>
          {dateLabel ? (
            <p className="text-xs text-muted-foreground/70">{dateLabel}</p>
          ) : null}
        </div>
      </div>

      <WelcomeShortcutCards />
    </div>
  );
}
