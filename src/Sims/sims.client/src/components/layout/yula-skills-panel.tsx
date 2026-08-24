import * as React from "react"
import { ChevronDown, Folder, FolderOpen, Puzzle } from "lucide-react"

import { useAgentBridgeStore } from "@/hooks/useAgentBridge"
import type { SkillInfo } from "@/hooks/yula/types"
import { cn } from "@/utils/cn"

/**
 * Yula Yetenek Klasörleri — sidecar'dan gelen skills/<ad>/SKILL.md + *.py
 * klasörlerini ağaç olarak gösterir.
 *
 * - "Session" rozetli fonksiyonlar bridged'dir: aktif rapor verisiyle frontend
 *   üzerinden çalışır (örn. report_export_xlsx).
 * - Rozetsizler internal'dir: agent grafik içinde çalıştırır (sidecar'daki
 *   needs_session_data=false fonksiyonlar).
 */
export function YulaSkillsPanel({ className }: { className?: string }) {
  const skills = useAgentBridgeStore((s) => s.skills)
  const [openFolders, setOpenFolders] = React.useState<Set<string>>(new Set())

  const toggle = (folder: string) => {
    setOpenFolders((prev) => {
      const next = new Set(prev)
      if (next.has(folder)) next.delete(folder)
      else next.add(folder)
      return next
    })
  }

  if (!skills.length) return null

  return (
    <div className={cn("rounded-xl border bg-card/60 text-card-foreground shadow-xs", className)}>
      <div className="flex items-center gap-1.5 px-3 py-2 text-[11px] font-medium text-muted-foreground">
        <Puzzle className="size-3.5 text-orange-500/80 dark:text-orange-400/80" />
        Yetenek Klasörleri
        <span className="ml-auto rounded-full bg-muted px-1.5 py-0.5 text-[10px]">{skills.length}</span>
      </div>
      <div className="space-y-0.5 px-1.5 pb-1.5">
        {skills.map((skill) => {
          const open = openFolders.has(skill.folder)
          return (
            <div key={skill.folder}>
              <button
                type="button"
                onClick={() => toggle(skill.folder)}
                className={cn(
                  "flex w-full cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-xs transition-colors",
                  "hover:bg-muted/70"
                )}
              >
                {open ? (
                  <FolderOpen className="size-3.5 shrink-0 text-orange-500/80 dark:text-orange-400/80" />
                ) : (
                  <Folder className="size-3.5 shrink-0 text-muted-foreground" />
                )}
                <span className="truncate font-mono text-[11px]">{skill.folder}</span>
                <ChevronDown className={cn("ml-auto size-3 shrink-0 text-muted-foreground transition-transform", !open && "-rotate-90")} />
              </button>
              {open ? (
                <div className="mb-1 ml-4 space-y-0.5 border-l pl-2">
                  {skill.functions.map((fn: SkillInfo["functions"][number]) => (
                    <div key={fn.name} className="flex items-start gap-1.5 rounded-md px-1.5 py-1">
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-mono text-[11px] text-foreground/90">{fn.name}</div>
                        <div className="line-clamp-2 text-[10px] leading-snug text-muted-foreground">
                          {fn.description || "—"}
                        </div>
                      </div>
                      {fn.needs_session_data ? (
                        <span className="mt-0.5 shrink-0 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-medium text-emerald-600 dark:text-emerald-400">
                          Session
                        </span>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}
