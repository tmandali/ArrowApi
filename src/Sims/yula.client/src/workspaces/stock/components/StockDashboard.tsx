"use client";

import Link from "next/link"
import {
  BarChart2Icon,
  ChevronRight,
  MoreHorizontal,
  Package,
  Settings2Icon,
  WrenchIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { WorkspacePinnedItemsGrid } from "@/components/layout/workspace-pinned-items-grid"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item"
import { cn } from "@/utils/cn"
import { useTranslations } from "next-intl"
import {
  kpiCards,
  kpiToneClassName,
  badgeToneClassName,
  shortcuts,
  featureSections,
  type FeatureSection,
} from "./stock-dashboard-data"

function CardMenu() {
  const t = useTranslations("Stock")
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={t("card_more_options")}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuItem>{t("card_refresh")}</DropdownMenuItem>
          <DropdownMenuItem>{t("card_edit")}</DropdownMenuItem>
          <DropdownMenuItem>{t("card_delete")}</DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function FeatureVisual({ kind }: { kind: FeatureSection["visual"] }) {
  switch (kind) {
    case "catalogue":
      return <Package className="size-3.5 shrink-0 text-primary" />
    case "setup":
      return <Settings2Icon className="size-3.5 shrink-0 text-orange-600" />
    case "tools":
      return <WrenchIcon className="size-3.5 shrink-0 text-primary" />
    case "reports":
      return <BarChart2Icon className="size-3.5 shrink-0 text-orange-600" />
    default: {
      const _exhaustive: never = kind
      return _exhaustive
    }
  }
}

function FeaturePanel({ section }: { section: FeatureSection }) {
  const t = useTranslations("Stock")
  return (
    <Card size="sm" className="gap-0 py-0">
      <CardHeader className="flex h-8 flex-row items-center gap-1.5 px-2.5 py-0">
        <FeatureVisual kind={section.visual} />
        <CardTitle className="text-xs font-medium tracking-tight">
          <span className="text-primary dark:text-sidebar-primary">
            {t(section.titleLeadKey)}
          </span>{" "}
          <span className="text-orange-600 dark:text-orange-400">
            {t(section.titleTrailKey)}
          </span>
        </CardTitle>
      </CardHeader>

      <CardContent className="p-1">
        <ItemGroup className="gap-0" data-size="xs">
          {section.links.map((link) => (
            <Item
              key={link.titleKey}
              size="xs"
              className="gap-1 rounded-sm px-1.5 py-0.5"
              asChild
            >
              <Link href={link.url}>
                <ItemContent className="gap-0">
                  <ItemTitle className="text-[0.6875rem] font-normal">
                    {t(link.titleKey)}
                  </ItemTitle>
                </ItemContent>
                <ItemActions>
                  <ChevronRight className="size-3 text-muted-foreground" />
                </ItemActions>
              </Link>
            </Item>
          ))}
        </ItemGroup>
      </CardContent>
    </Card>
  )
}

export function StockDashboard() {
  const t = useTranslations("Stock")
  return (
    <div className="flex flex-1 flex-col gap-3 p-3">
      <WorkspacePinnedItemsGrid workspace="stock" className="max-w-full px-0 pt-0" />

      <div className="grid gap-2 md:grid-cols-3">
        {kpiCards.map((kpi) => {
          const tone = kpiToneClassName[kpi.tone]
          return (
            <Card key={kpi.titleKey} size="sm">
              <CardHeader className="gap-0.5">
                <CardDescription
                  className={cn(
                    "text-[0.625rem] uppercase tracking-wide",
                    tone.title
                  )}
                >
                  {t(kpi.titleKey)}
                </CardDescription>
                <CardAction>
                  <CardMenu />
                </CardAction>
                <CardTitle
                  className={cn(
                    "text-lg font-semibold tracking-tight",
                    tone.value
                  )}
                >
                  {kpi.value}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {kpi.trend === "up" ? (
                  <Badge
                    variant="secondary"
                    className={badgeToneClassName.success}
                  >
                    ↑ {t(kpi.changeKey)}
                  </Badge>
                ) : (
                  <p className="text-[0.625rem] text-muted-foreground">
                    {t(kpi.changeKey)}
                  </p>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {shortcuts.map((item) => {
          const Icon = item.icon
          return (
            <Button
              key={item.titleKey}
              variant="outline"
              size="sm"
              className="h-8 justify-between gap-2 px-2.5"
              asChild
            >
              <Link href={item.url}>
                <span className="flex min-w-0 flex-1 items-center gap-1.5">
                  <Icon data-icon="inline-start" />
                  <span className="truncate">{t(item.titleKey)}</span>
                  {item.badge ? (
                    <Badge
                      variant="secondary"
                      className={badgeToneClassName[item.badge.tone]}
                    >
                      {item.badge.tone === "warning" ? t("badge_draft_2") : item.badge.label}
                    </Badge>
                  ) : null}
                </span>
                <ChevronRight data-icon="inline-end" />
              </Link>
            </Button>
          )
        })}
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {featureSections.map((section) => (
          <FeaturePanel
            key={`${section.titleLeadKey}-${section.titleTrailKey}`}
            section={section}
          />
        ))}
      </div>
    </div>
  )
}
