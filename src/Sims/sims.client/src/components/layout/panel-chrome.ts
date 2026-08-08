/**
 * Shared workspace panel chrome — Executions, Detail, Query, Yula, result grids.
 * Primary titles + soft orange icons match the shell gradient language.
 *
 * Spacing rule: one gutter unit (`2` / 0.5rem) everywhere —
 * outer page inset, header↔body, Executions↔Detail, and stacked cards.
 */

/** Single gutter used for outer inset and between cards. */
export const pageGutter = "2" as const

export const panelCardClass =
  "flex min-h-0 flex-col overflow-hidden rounded-md border bg-card shadow-none"

export const panelHeaderClass =
  "flex h-11 shrink-0 items-center justify-between gap-2 border-b border-primary/15 px-3 dark:border-primary/25"

export const panelHeaderActionClass = "h-7 shrink-0 px-2.5 text-xs"

export const panelHeaderIconClass =
  "size-3.5 shrink-0 translate-y-px text-orange-600/80 dark:text-orange-400/80"

export const panelHeaderTitleClass =
  "truncate text-sm font-semibold leading-none tracking-tight text-primary dark:text-sidebar-primary"

export const panelHeaderSubtitleClass =
  "truncate text-xs leading-none text-muted-foreground"

/** Soft primary rule under side-dock headers (Query / Yula). */
export const panelHeaderAccentBorderClass =
  "border-primary/15 dark:border-primary/25"

/**
 * Docked side panel gutters — align with page cards under the header:
 * top 0 (same as pageContentGutterClass), bottom/right = page gutter.
 * Left gap comes from the shared resize handle (= page gutter).
 */
export const panelShellClass = "bg-transparent pt-0 pb-2 pr-2"

/** Transparent resize gutter — same width as page gutter. */
export const panelResizeHandleClass =
  "w-2 bg-transparent after:w-2 after:translate-x-0 after:bg-transparent"

/** Gap between stacked page cards (vertical). */
export const pageCardGapClass = "gap-2"

/** Outer padding for the floating page header (all four sides = page gutter). */
export const pageHeaderShellClass = "relative z-10 shrink-0 p-2"

/** Inset header bar — same card language as Executions / Yula. */
export const pageHeaderCardClass =
  "flex h-11 w-full min-w-0 flex-row items-center gap-2 overflow-hidden rounded-md border bg-card px-2.5 text-xs shadow-none"

/**
 * Body gutter under the floating header.
 * Top is 0 — header shell `pb-2` is the header↔body gap (= page gutter).
 */
export const pageContentGutterClass = "px-2 pb-2 pt-0"

/** Full inset when a panel fills the content area (no header above). */
export const pageInsetGutterClass = "p-2"
