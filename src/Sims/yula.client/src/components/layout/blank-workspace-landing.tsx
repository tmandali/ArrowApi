"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Pin,
  PinOff,
  Clock,
  UserCheck,
  TrendingUp,
  TrendingDown,
  Minus,
  Sparkles,
  ArrowUpRight,
  type LucideIcon,
} from "lucide-react";
import { WorkspacePageShell } from "@/components/layout/workspace-page-shell";
import { YulaChartCard } from "@/components/layout/yula-chart-card";
import { usePinnedWorkspaceItems } from "@/hooks/use-pinned-workspace-items";
import {
  getPinnedChartViewId,
  pinnedChartToOutput,
  requestAiView,
  savePinnedChartAsAiView,
  usePinnedCharts,
} from "@/hooks/use-pinned-charts";
import { getWorkspaceForPath, getWorkspace } from "@/lib/workspace-registry";
import {
  type WorkspaceLandingData,
  type SoftTone,
  getWorkspaceLandingData,
} from "@/lib/workspace-landing-data";
import type { WorkspaceId } from "@/types";
import { cn } from "@/utils/cn";

export interface WorkspaceLandingTemplateProps {
  workspaceId?: WorkspaceId;
  customData?: Partial<WorkspaceLandingData>;
  withoutShell?: boolean;
  /** Nav menü header / kapatma butonunun görünürlüğü (workspace ana sayfalarında varsayılan: true). */
  navMenuHeaderVisible?: boolean;
  /** Menü kapalıyken sol üstte açma butonunun görünürlüğü (varsayılan: true). */
  floatingOpenButton?: boolean;
}

// Gözü yormayan yumuşak pastel renk tonları (soft & muted)
const softToneClasses: Record<SoftTone, { text: string; badge: string; dot: string }> = {
  emerald: {
    text: "text-emerald-600 dark:text-emerald-400",
    badge: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    dot: "bg-emerald-500",
  },
  blue: {
    text: "text-blue-600 dark:text-blue-400",
    badge: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
    dot: "bg-blue-500",
  },
  amber: {
    text: "text-amber-600 dark:text-amber-400",
    badge: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
    dot: "bg-amber-500",
  },
  violet: {
    text: "text-violet-600 dark:text-violet-400",
    badge: "bg-violet-500/10 text-violet-700 dark:text-violet-400",
    dot: "bg-violet-500",
  },
  rose: {
    text: "text-rose-600 dark:text-rose-400",
    badge: "bg-rose-500/10 text-rose-700 dark:text-rose-400",
    dot: "bg-rose-500",
  },
  slate: {
    text: "text-slate-600 dark:text-slate-300",
    badge: "bg-slate-500/10 text-slate-700 dark:text-slate-300",
    dot: "bg-slate-500",
  },
};

const statusStyles = {
  urgent: "text-rose-600 dark:text-rose-400 bg-rose-500/10",
  pending: "text-amber-600 dark:text-amber-400 bg-amber-500/10",
  review: "text-blue-600 dark:text-blue-400 bg-blue-500/10",
};

const priorityStyles = {
  high: "text-rose-600 dark:text-rose-400 bg-rose-500/10",
  medium: "text-amber-600 dark:text-amber-400 bg-amber-500/10",
  low: "text-muted-foreground bg-muted",
};

export function WorkspaceLandingTemplate({
  workspaceId: propWorkspaceId,
  customData,
  withoutShell = false,
  navMenuHeaderVisible = true,
  floatingOpenButton,
}: WorkspaceLandingTemplateProps) {
  const pathname = usePathname();

  const detectedDef = React.useMemo(() => {
    if (propWorkspaceId) return getWorkspace(propWorkspaceId);
    return getWorkspaceForPath(pathname);
  }, [propWorkspaceId, pathname]);

  const activeId: WorkspaceId = detectedDef.id;
  const { pinnedItems, unpinItem } = usePinnedWorkspaceItems(activeId);
  const { pinnedCharts, unpinChart } = usePinnedCharts(activeId);

  const rawData = React.useMemo(() => {
    return getWorkspaceLandingData(activeId);
  }, [activeId]);

  const data: WorkspaceLandingData = React.useMemo(() => {
    return {
      ...rawData,
      ...customData,
    };
  }, [rawData, customData]);

  const content = (
    <div className="flex-1 w-full overflow-y-auto">
      <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 space-y-7 transition-all duration-300 ease-in-out">

        {/* 1. Sade & Sakin Karşılama Başlığı (AppHeader'da arama ve profil zaten mevcut) */}
        <div className="space-y-1">
          <h1 className="text-base font-semibold tracking-tight text-foreground">
            {data.greetingTitle}
          </h1>
          <p className="text-xs text-muted-foreground/75 leading-relaxed max-w-2xl">
            {data.greetingDescription}
          </p>
        </div>

        {/* 2. Sabitlenen Menüler (Pinned Items) - Sade pill & hafif chip görünümü */}
        {pinnedItems.length > 0 ? (
          <section className="space-y-2">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground/80">
              <Pin className="size-3 text-amber-500/80" />
              <span>Sabitlenen Menüler</span>
              <span className="text-[10px] text-muted-foreground/60">({pinnedItems.length})</span>
            </div>

            <div className="flex flex-wrap gap-2">
              {pinnedItems.map((item) => (
                <div
                  key={item.id}
                  className="group flex items-center gap-2 rounded-lg bg-muted/40 hover:bg-muted/70 px-3 py-1.5 transition-colors"
                >
                  <Link
                    href={item.url}
                    className="flex items-center gap-2 min-w-0"
                  >
                    <Sparkles className="size-3 text-muted-foreground/60 group-hover:text-primary transition-colors" />
                    <span className="text-xs font-medium text-foreground/90 group-hover:text-primary transition-colors">
                      {item.title}
                    </span>
                    {item.titleTr && item.titleTr !== item.title && (
                      <span className="text-[10px] text-muted-foreground/60">
                        {item.titleTr}
                      </span>
                    )}
                  </Link>

                  <button
                    type="button"
                    title="İğneyi Kaldır"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      unpinItem(item.id);
                    }}
                    className="text-muted-foreground/40 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100 cursor-pointer pl-1"
                  >
                    <PinOff className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {/* 2b. Sabitlenen Grafikler — Yula chart pin’leri; tıklayınca kaynak rapora gider */}
        {pinnedCharts.length > 0 ? (
          <section className="space-y-2">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground/80">
              <Pin className="size-3 text-amber-500/80" />
              <span>Sabitlenen Grafikler</span>
              <span className="text-[10px] text-muted-foreground/60">
                ({pinnedCharts.length})
              </span>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {pinnedCharts.map((chart) => (
                <div key={chart.id} className="group relative">
                  <Link
                    href={chart.sourceHref}
                    className="block rounded-xl outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-primary/40"
                    title="Kaynak raporu grafik sorgusuyla aç"
                    onClick={() => {
                      savePinnedChartAsAiView(chart);
                      requestAiView(
                        getPinnedChartViewId(chart),
                        chart.reportScope,
                      );
                    }}
                  >
                    <YulaChartCard
                      output={pinnedChartToOutput(chart)}
                      compact
                      pinEnabled={false}
                      showGridAction={false}
                      borderless
                      className="transition-colors group-hover:bg-muted/40"
                    />
                  </Link>
                  <button
                    type="button"
                    title="İğneyi Kaldır"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      unpinChart(chart.id);
                    }}
                    className="absolute right-2 top-1.5 z-10 rounded p-0.5 text-muted-foreground/50 opacity-0 transition-opacity hover:text-rose-500 group-hover:opacity-100 cursor-pointer"
                  >
                    <PinOff className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {/* 3. Soft KPI Alanı - Bordersız, sade, nefes alan metrikler */}
        <section className="space-y-2">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {data.kpis.map((kpi) => {
              const tone = softToneClasses[kpi.tone] ?? softToneClasses.slate;
              const KpiIcon = kpi.icon;
              return (
                <div
                  key={kpi.id}
                  className="rounded-xl bg-muted/25 hover:bg-muted/40 p-3.5 transition-colors space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-1 text-xs text-muted-foreground/75">
                    <span className="line-clamp-1">{kpi.title}</span>
                    {KpiIcon && <KpiIcon className="size-3.5 opacity-60 shrink-0" />}
                  </div>

                  <div className="text-lg font-semibold tracking-tight text-foreground">
                    {kpi.value}
                  </div>

                  <div className="flex items-center gap-1.5 text-[11px]">
                    {kpi.change && (
                      <span className={cn("inline-flex items-center gap-0.5 rounded px-1.5 py-0.2 text-[10px] font-medium", tone.badge)}>
                        {kpi.trend === "up" && <TrendingUp className="size-2.5" />}
                        {kpi.trend === "down" && <TrendingDown className="size-2.5" />}
                        {kpi.trend === "flat" && <Minus className="size-2.5" />}
                        <span>{kpi.change}</span>
                      </span>
                    )}
                    {kpi.subtext && (
                      <span className="text-[10px] text-muted-foreground/60 truncate">
                        {kpi.subtext}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* 4. İşlem Bekleyenler ve Bana Atananlar - Sade, temiz, havadar liste yapısı */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-1">

          {/* Sol Kolon: İşlem Bekleyenler */}
          <section className="lg:col-span-7 space-y-2.5">
            <div className="flex items-center justify-between pb-1">
              <div className="flex items-center gap-2">
                <h2 className="text-xs font-semibold text-foreground/90">
                  İşlem Bekleyenler
                </h2>
                <span className="text-[10px] text-muted-foreground/60">
                  ({data.pendingActions.length})
                </span>
              </div>
            </div>

            <div className="divide-y divide-border/25 rounded-xl bg-muted/15 px-3 py-1">
              {data.pendingActions.map((action) => (
                <Link
                  key={action.id}
                  href={action.actionUrl}
                  className="group flex items-center justify-between gap-3 py-2.5 hover:bg-muted/30 -mx-3 px-3 rounded-lg transition-colors text-left"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[10px] text-muted-foreground/60">
                        {action.code}
                      </span>
                      <span className={cn("rounded px-1.5 py-0.2 text-[9px] font-medium", statusStyles[action.status])}>
                        {action.statusLabel}
                      </span>
                      {action.amountOrCount && (
                        <span className="text-[11px] font-medium text-foreground/85">
                          {action.amountOrCount}
                        </span>
                      )}
                    </div>

                    <h3 className="text-xs font-medium text-foreground/90 group-hover:text-primary transition-colors line-clamp-1">
                      {action.title}
                    </h3>

                    <p className="text-[11px] text-muted-foreground/70 line-clamp-1">
                      {action.description}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {action.dueDate && (
                      <span className="hidden sm:flex items-center gap-1 text-[10px] text-muted-foreground/60">
                        <Clock className="size-2.5" />
                        {action.dueDate}
                      </span>
                    )}
                    <div className="flex size-6 items-center justify-center rounded-md text-muted-foreground/40 group-hover:text-primary group-hover:bg-primary/10 transition-colors">
                      <ArrowUpRight className="size-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>

          {/* Sağ Kolon: Bana Atananlar */}
          <section className="lg:col-span-5 space-y-2.5">
            <div className="flex items-center justify-between pb-1">
              <div className="flex items-center gap-2">
                <h2 className="text-xs font-semibold text-foreground/90">
                  Bana Atananlar
                </h2>
                <span className="text-[10px] text-muted-foreground/60">
                  ({data.assignedTasks.length})
                </span>
              </div>
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground/60">
                <UserCheck className="size-3 text-emerald-600 dark:text-emerald-400" />
                <span>Sorumlu</span>
              </div>
            </div>

            <div className="divide-y divide-border/25 rounded-xl bg-muted/15 px-3 py-1">
              {data.assignedTasks.map((task) => (
                <Link
                  key={task.id}
                  href={task.targetUrl}
                  className="group flex items-center justify-between gap-3 py-2.5 hover:bg-muted/30 -mx-3 px-3 rounded-lg transition-colors text-left"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center justify-between gap-2 pr-2">
                      <span className="text-xs font-medium text-foreground/90 group-hover:text-primary transition-colors line-clamp-1">
                        {task.title}
                      </span>
                      <span className={cn("shrink-0 rounded px-1.5 py-0.2 text-[9px] font-medium", priorityStyles[task.priority])}>
                        {task.priorityLabel}
                      </span>
                    </div>

                    <p className="text-[11px] text-muted-foreground/70 line-clamp-1">
                      {task.subtitle}
                    </p>

                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground/50">
                      <span>Termin: {task.deadline}</span>
                      {task.assignedBy && <span>· Atayan: {task.assignedBy}</span>}
                    </div>
                  </div>

                  <div className="flex size-6 items-center justify-center rounded-md text-muted-foreground/40 group-hover:text-primary group-hover:bg-primary/10 transition-colors shrink-0">
                    <ArrowUpRight className="size-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                  </div>
                </Link>
              ))}
            </div>
          </section>

        </div>

        {/* 5. Sık Kullanılan İşlemler - Sade ve narin link satırları */}
        {data.quickShortcuts && data.quickShortcuts.length > 0 && (
          <section className="space-y-2 pt-1">
            <h2 className="text-xs font-medium text-muted-foreground/75">
              Hızlı Erişim
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {data.quickShortcuts.map((sc) => {
                const ShortcutIcon = sc.icon;
                return (
                  <Link
                    key={sc.id}
                    href={sc.url}
                    className="group flex items-center gap-2.5 rounded-lg bg-muted/20 hover:bg-muted/40 p-2.5 transition-colors"
                  >
                    <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted/60 text-muted-foreground group-hover:text-primary transition-colors">
                      <ShortcutIcon className="size-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="block text-xs font-medium text-foreground/90 group-hover:text-primary transition-colors truncate">
                        {sc.title}
                      </span>
                      <span className="block text-[10px] text-muted-foreground/60 truncate">
                        {sc.description}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

      </div>
    </div>
  );

  if (withoutShell) {
    return content;
  }

  return (
    <WorkspacePageShell
      hideHeader
      navMenuHeaderVisible={navMenuHeaderVisible}
      floatingOpenButton={floatingOpenButton}
    >
      {content}
    </WorkspacePageShell>
  );
}

export interface BlankWorkspaceLandingProps {
  title?: string;
  description?: string;
  icon?: LucideIcon;
  withoutShell?: boolean;
  /** Nav menü header / kapatma butonunun görünürlüğü (workspace ana sayfalarında varsayılan: true). */
  navMenuHeaderVisible?: boolean;
  /** Menü kapalıyken sol üstte açma butonunun görünürlüğü (varsayılan: true). */
  floatingOpenButton?: boolean;
}

export function BlankWorkspaceLanding({
  title,
  description,
  withoutShell = false,
  navMenuHeaderVisible = true,
  floatingOpenButton,
}: BlankWorkspaceLandingProps) {
  return (
    <WorkspaceLandingTemplate
      withoutShell={withoutShell}
      navMenuHeaderVisible={navMenuHeaderVisible}
      floatingOpenButton={floatingOpenButton}
      customData={{
        ...(title ? { greetingTitle: title } : {}),
        ...(description ? { greetingDescription: description } : {}),
      }}
    />
  );
}

export default BlankWorkspaceLanding;
