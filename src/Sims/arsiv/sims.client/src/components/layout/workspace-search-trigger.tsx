import * as React from "react"
import { Command as CommandPrimitive } from "cmdk"
import { SearchIcon } from "lucide-react"
import { useNavigate } from "react-router-dom"

import { useWorkspaceSearch } from "@/context/workspace-search-context"
import { useWorkspaceSearchMeta } from "@/components/layout/workspace-search-hooks"
import { WorkspaceSearchResults } from "@/components/layout/workspace-search-panel"
import { Command } from "@/components/ui/command"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { cn } from "@/utils/cn"

type WorkspaceSearchTriggerProps = {
  className?: string
  placeholder?: string
}

/**
 * Header search input. Results open directly under the box (no second input).
 */
export function WorkspaceSearchTrigger({
  className,
  placeholder,
}: WorkspaceSearchTriggerProps) {
  const { open, setOpen, registerTrigger } = useWorkspaceSearch()
  const { placeholder: workspacePlaceholder } = useWorkspaceSearchMeta()
  const navigate = useNavigate()
  const containerRef = React.useRef<HTMLDivElement>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [query, setQuery] = React.useState("")

  const resolvedPlaceholder = placeholder ?? workspacePlaceholder

  React.useEffect(() => {
    registerTrigger(true)
    return () => registerTrigger(false)
  }, [registerTrigger])

  React.useEffect(() => {
    if (open) {
      inputRef.current?.focus()
    } else {
      setQuery("")
    }
  }, [open])

  React.useEffect(() => {
    if (!open) return

    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener("mousedown", onPointerDown)
    return () => document.removeEventListener("mousedown", onPointerDown)
  }, [open, setOpen])

  const handleSelect = (url: string) => {
    setOpen(false)
    setQuery("")
    if (url && url !== "#") {
      navigate(url)
    }
  }

  return (
    <Command
      shouldFilter
      className={cn(
        "relative h-auto w-full max-w-64 overflow-visible rounded-none bg-transparent p-0 shadow-none sm:max-w-72",
        className
      )}
    >
      <div ref={containerRef} className="relative w-full">
        <label
          className={cn(
            "flex h-7 w-full cursor-text items-center gap-2 rounded-md border border-input bg-input/20 px-2 transition-colors",
            "focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30",
            "dark:bg-input/30"
          )}
        >
          <SearchIcon className="size-3.5 shrink-0 opacity-60" />
          <CommandPrimitive.Input
            ref={inputRef}
            value={query}
            onValueChange={(value) => {
              setQuery(value)
              if (!open) setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault()
                setOpen(false)
                setQuery("")
                inputRef.current?.blur()
              }
            }}
            placeholder={resolvedPlaceholder}
            className="min-w-0 flex-1 bg-transparent text-xs/relaxed outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Search workspace"
            aria-expanded={open}
            role="combobox"
          />
          {!query ? (
            <KbdGroup className="pointer-events-none hidden shrink-0 sm:inline-flex">
              <Kbd>⌘</Kbd>
              <Kbd>K</Kbd>
            </KbdGroup>
          ) : null}
        </label>

        {open ? (
          <div
            className={cn(
              "absolute top-full left-1/2 z-50 mt-1.5 w-[min(100vw-2rem,22rem)] -translate-x-1/2 overflow-hidden rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 md:w-80",
              "animate-in fade-in-0 zoom-in-95 slide-in-from-top-2 duration-100"
            )}
          >
            <WorkspaceSearchResults onSelect={handleSelect} />
          </div>
        ) : null}
      </div>
    </Command>
  )
}
