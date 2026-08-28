"use client";

import * as React from "react";
import { Search, X } from "lucide-react";
import { useChatsStore } from "@/lib/stores/chats";
import { cn } from "@/utils/cn";

export function YulaHeaderSearch({
  className,
  placeholder = "Sohbet geçmişinde ara...",
}: {
  className?: string;
  placeholder?: string;
}) {
  const searchQuery = useChatsStore((s) => s.searchQuery);
  const setSearchQuery = useChatsStore((s) => s.setSearchQuery);
  const isSearchingHistory = useChatsStore((s) => s.isSearchingHistory);
  const setSearchingHistory = useChatsStore((s) => s.setSearchingHistory);

  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setSearchingHistory(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setSearchingHistory]);

  return (
    <div className={cn("relative flex items-center w-56 sm:w-72 md:w-80", className)}>
      <Search className="absolute left-2.5 size-3.5 text-muted-foreground/60 pointer-events-none" />
      <input
        ref={inputRef}
        type="text"
        value={searchQuery}
        onChange={(e) => {
          setSearchQuery(e.target.value);
          if (!isSearchingHistory) setSearchingHistory(true);
        }}
        onFocus={() => {
          setSearchingHistory(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setSearchingHistory(false);
            inputRef.current?.blur();
          }
        }}
        placeholder={placeholder}
        className="w-full rounded-lg border border-input/60 bg-muted/30 py-1 pl-8 pr-7 text-xs outline-none focus:border-primary/40 focus:bg-background focus:ring-2 focus:ring-primary/20 transition-all dark:bg-muted/20"
      />
      {isSearchingHistory || searchQuery ? (
        <button
          type="button"
          onClick={() => {
            setSearchQuery("");
            setSearchingHistory(false);
            inputRef.current?.blur();
          }}
          className="absolute right-2 text-muted-foreground/60 hover:text-foreground p-0.5 rounded transition-colors"
          title="Aramayı Kapat"
        >
          <X className="size-3.5" />
        </button>
      ) : (
        <kbd className="absolute right-2 hidden pointer-events-none sm:inline-flex h-4 items-center gap-0.5 rounded border bg-muted px-1 font-mono text-[9px] font-medium text-muted-foreground opacity-60">
          ⌘K
        </kbd>
      )}
    </div>
  );
}
