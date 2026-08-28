"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AppLayout } from "@/components/layout/app-layout";
import {
  workspaceIdFromPath,
  workspaceLabelFromPath,
  emptyWorkspaceHome,
} from "@/lib/workspace-paths";

export default function NotFound() {
  const pathname = usePathname();
  const wsId = workspaceIdFromPath(pathname || "/");
  const wsLabel = workspaceLabelFromPath(pathname || "/");
  const homeInfo = emptyWorkspaceHome[wsId] ?? { label: "Ana Sayfa", url: "/" };

  const buttonText =
    wsId === "system"
      ? "Ana Sayfaya Dön"
      : `${wsLabel} Workspace Ana Sayfasına Dön`;

  return (
    <AppLayout>
      <section className="flex h-full min-h-0 flex-1 items-center justify-center p-12 select-none">
        <div className="space-y-4 text-center max-w-sm">
          <p className="text-7xl font-extrabold tracking-tight text-primary/20">404</p>
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-foreground">Ekran Bulunamadı</h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Aradığınız sayfa kaldırılmış, adı değiştirilmiş veya henüz eklenmemiş olabilir.
            </p>
          </div>
          <div className="pt-2">
            <Link
              href={homeInfo.url}
              className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {buttonText}
            </Link>
          </div>
        </div>
      </section>
    </AppLayout>
  );
}
