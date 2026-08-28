"use client";

import { cn } from "@/utils/cn"

type YulaMarkIconProps = {
  className?: string
  /** Soft glow ring — use on empty / hero moments. */
  glow?: boolean
}

/**
 * AI sparkles mark — primary core + soft orange accents
 * (same primary / orange language as the workspace shell).
 */
export function YulaMarkIcon({ className, glow = false }: YulaMarkIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("block size-full shrink-0 text-primary", className)}
      aria-hidden
    >
      {glow ? (
        <circle
          cx="12"
          cy="12"
          r="12"
          className="fill-current opacity-[0.12]"
        />
      ) : null}

      {/* Primary spark — inherits text-* / currentColor */}
      <path
        d="M12 0 15.4 8.6 24 12 15.4 15.4 12 24 8.6 15.4 0 12 8.6 8.6Z"
        className="fill-current"
      />
      {/* Soft orange accents — solid enough to read as “filled” color */}
      <path
        d="M19.2 0.4 20.7 4 24 5.5 20.7 7 19.2 10.6 17.7 7 14.1 5.5 17.7 4Z"
        className="fill-orange-500 dark:fill-orange-400"
      />
      <path
        d="M4.8 13.4 5.9 16.1 8.6 17.2 5.9 18.3 4.8 21 3.7 18.3 1 17.2 3.7 16.1Z"
        className="fill-orange-500/85 dark:fill-orange-400/80"
      />
    </svg>
  )
}
