"use client";

/**
 * Slim top-of-viewport progress bar shown while lazy route chunks load
 * after the initial boot. Suspense fallback — replaced by the page content.
 */
export function RouteTopBar() {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-50">
      <div className="h-0.5 overflow-hidden bg-transparent">
        <div className="h-full w-1/3 animate-indeterminate rounded-full bg-gradient-to-r from-primary to-orange-500" />
      </div>
    </div>
  )
}
