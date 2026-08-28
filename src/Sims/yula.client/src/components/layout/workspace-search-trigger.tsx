"use client";

import * as React from "react"
import { SearchIcon, X } from "lucide-react"

import { useWorkspaceSearch } from "@/context/workspace-search-context"
import { useWorkspaceSearchMeta } from "@/components/layout/workspace-search-hooks"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { cn } from "@/utils/cn"

type WorkspaceSearchTriggerProps = {
  className?: string
  placeholder?: string
}

/**
 * Header search input component. Typing or clicking switches the main page content area
 * to the WorkspaceSearchMainView (matching Yula AI History layout).
 */
export function WorkspaceSearchTrigger({
  className,
  placeholder,
}: WorkspaceSearchTriggerProps) {
  const { open, setOpen, query, setQuery, registerTrigger } = useWorkspaceSearch()
  const { placeholder: workspacePlaceholder } = useWorkspaceSearchMeta()

  const inputRef = React.useRef<HTMLInputElement>(null)
  const resolvedPlaceholder = placeholder ?? workspacePlaceholder

  React.useEffect(() => {
    registerTrigger(true)
    return () => registerTrigger(false)
  }, [registerTrigger])

  React.useEffect(() => {
    if (open) {
      // Focus and select input when search opens (e.g. Cmd+K)
      const timer = setTimeout(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      }, 0)
      return () => clearTimeout(timer)
    } else {
      inputRef.current?.blur()
    }
  }, [open])

  return (
    <div
      className={cn(
        "relative flex h-7 w-full max-w-64 items-center gap-2 rounded-md border border-input bg-input/20 px-2 transition-colors sm:max-w-72 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30 dark:bg-input/30",
        className
      )}
    >
      <SearchIcon className="size-3.5 shrink-0 opacity-60 text-primary" />
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          if (!open) setOpen(true)
        }}
        onFocus={() => {
          if (!open) setOpen(true)
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false)
            setQuery("")
            inputRef.current?.blur()
          }
        }}
        placeholder={resolvedPlaceholder}
        className="min-w-0 flex-1 bg-transparent text-xs/relaxed outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
        aria-label="Search workspace"
      />
      {query || open ? (
        <button
          type="button"
          onClick={() => {
            setQuery("")
            setOpen(false)
            inputRef.current?.blur()
          }}
          className="text-muted-foreground/60 hover:text-foreground p-0.5 rounded transition-colors"
          title="Aramayı Kapat"
        >
          <X className="size-3.5" />
        </button>
      ) : (
        <KbdGroup className="pointer-events-none hidden shrink-0 sm:inline-flex">
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
        </KbdGroup>
      )}
    </div>
  )
}
