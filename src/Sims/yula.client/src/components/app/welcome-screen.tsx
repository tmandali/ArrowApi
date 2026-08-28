"use client";

import * as React from "react";
import Link from "next/link";
import {
  ChevronRightIcon,
  DatabaseIcon,
  PackageIcon,
  SparklesIcon,
} from "lucide-react";
import { YulaMarkIcon } from "@/components/layout/yula-brand";
import { useWorkspaceAiChat } from "@/context/workspace-ai-chat-context";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function greetingFor(date: Date) {
  const h = date.getHours();
  if (h < 6) return "İyi geceler";
  if (h < 12) return "Günaydın";
  if (h < 18) return "İyi günler";
  return "İyi akşamlar";
}

export function formatDate(date: Date) {
  return new Intl.DateTimeFormat("tr-TR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
}

const emptySubscribe = () => () => {};

/** Saat/selamlama + persist edilmiş sohbetler yalnızca client'ta bilinir. */
export function useMounted() {
  return React.useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}



export function WelcomeShortcutCards({
  onYulaClick,
}: {
  onYulaClick?: () => void;
}) {
  const { setOpen } = useWorkspaceAiChat();
  const handleYula = React.useCallback(() => {
    if (onYulaClick) {
      onYulaClick();
    } else {
      setOpen(true);
    }
  }, [onYulaClick, setOpen]);

  return (
    <div className="grid w-full gap-2.5 sm:grid-cols-3">
      <Card
        size="sm"
        className="group cursor-pointer transition-all hover:ring-primary/40 dark:hover:ring-primary/50"
        onClick={handleYula}
      >
        <CardHeader className="flex flex-row items-center justify-between gap-2 p-3 pb-1">
          <div className="flex items-center gap-2 min-w-0">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary dark:text-sidebar-primary">
              <SparklesIcon className="size-4" />
            </span>
            <CardTitle className="truncate text-sm font-semibold text-primary dark:text-sidebar-primary">
              Yula Sohbeti
            </CardTitle>
          </div>
          <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
        </CardHeader>
        <CardContent className="px-3 pb-3 pt-0">
          <CardDescription className="text-xs text-muted-foreground">
            Sohbet alanına odaklan ve asistanla konuş
          </CardDescription>
        </CardContent>
      </Card>

      <Link href="/stock/stock-balance" className="block">
        <Card
          size="sm"
          className="group h-full transition-all hover:ring-primary/40 dark:hover:ring-primary/50"
        >
          <CardHeader className="flex flex-row items-center justify-between gap-2 p-3 pb-1">
            <div className="flex items-center gap-2 min-w-0">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-orange-500/10 text-orange-600 dark:text-orange-400">
                <PackageIcon className="size-4" />
              </span>
              <CardTitle className="truncate text-sm font-semibold text-primary dark:text-sidebar-primary">
                Stok Bakiye Raporu
              </CardTitle>
            </div>
            <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
          </CardHeader>
          <CardContent className="px-3 pb-3 pt-0">
            <CardDescription className="text-xs text-muted-foreground">
              Bakiye kriterlerini hazırla ve sorgula
            </CardDescription>
          </CardContent>
        </Card>
      </Link>

      <Link href="/spike/duckdb" className="block">
        <Card
          size="sm"
          className="group h-full transition-all hover:ring-primary/40 dark:hover:ring-primary/50"
        >
          <CardHeader className="flex flex-row items-center justify-between gap-2 p-3 pb-1">
            <div className="flex items-center gap-2 min-w-0">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary dark:text-sidebar-primary">
                <DatabaseIcon className="size-4" />
              </span>
              <CardTitle className="truncate text-sm font-semibold text-primary dark:text-sidebar-primary">
                DuckDB Spike
              </CardTitle>
            </div>
            <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
          </CardHeader>
          <CardContent className="px-3 pb-3 pt-0">
            <CardDescription className="text-xs text-muted-foreground">
              Yerel motor + OPFS önbellek testi
            </CardDescription>
          </CardContent>
        </Card>
      </Link>
    </div>
  );
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
            Yula, yerel Ollama üzerinde akan yapay zekâ asistanın.
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
