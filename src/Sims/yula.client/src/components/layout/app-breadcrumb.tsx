"use client";

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import {
  deriveShellBreadcrumb,
  type ShellBreadcrumbSegment,
} from "@/lib/workspace-breadcrumb"
import { cn } from "@/utils/cn"

const itemHideClass: Record<
  NonNullable<ShellBreadcrumbSegment["hideBelow"]>,
  string
> = {
  sm: "hidden sm:inline-flex",
  md: "hidden md:inline-flex",
}

const separatorHideClass: Record<
  NonNullable<ShellBreadcrumbSegment["hideBelow"]>,
  string
> = {
  sm: "hidden sm:block",
  md: "hidden md:block",
}

/**
 * AppHeader sol bölgesindeki shell breadcrumb'ı: pathname'den
 * workspace > module > sayfa türetir. Ana ekranlarda hiçbir şey çizmez.
 */
export function AppBreadcrumb() {
  const pathname = usePathname()
  const segments = deriveShellBreadcrumb(pathname)

  if (!segments || segments.length === 0) return null

  return (
    <Breadcrumb className="min-w-0 overflow-hidden">
      <BreadcrumbList className="flex-nowrap text-xs">
        {segments.map((segment, index) => {
          const isLast = index === segments.length - 1
          // En derin segment küçük ekranda da görünür kalmalı
          const hide = isLast ? undefined : segment.hideBelow
          return (
            <React.Fragment key={`${segment.label}-${index}`}>
              <BreadcrumbItem
                className={cn(
                  hide ? itemHideClass[hide] : undefined,
                  isLast && "min-w-0"
                )}
              >
                {segment.href && !isLast ? (
                  <BreadcrumbLink asChild>
                    <Link href={segment.href}>{segment.label}</Link>
                  </BreadcrumbLink>
                ) : (
                  <BreadcrumbPage className="block truncate font-semibold text-foreground">
                    {segment.label}
                  </BreadcrumbPage>
                )}
              </BreadcrumbItem>
              {isLast ? null : (
                <BreadcrumbSeparator
                  className={hide ? separatorHideClass[hide] : undefined}
                />
              )}
            </React.Fragment>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
