"use client"

import * as React from "react"
import {
  ChevronDown,
  ChevronRight,
  Code2,
  Copy,
  Check,
  Pencil,
  Sparkles,
  Table2,
  Trash2,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/utils/cn"
import type { AiSqlView } from "./types"

export interface AiViewDropdownProps {
  aiViews?: readonly AiSqlView[]
  activeAiViewId?: string | null
  onSelectAiView?: (viewId: string | null) => void
  onRenameAiView?: (viewId: string, nextTitle: string) => void
  onDeleteAiView?: (viewId: string) => void
  className?: string
}

export function AiViewDropdown({
  aiViews = [],
  activeAiViewId = null,
  onSelectAiView,
  onRenameAiView,
  onDeleteAiView,
  className,
}: AiViewDropdownProps) {
  // Eğer hiç AI görünümü yoksa ve ham veri modundaysak render etme
  const hasViews = aiViews.length > 0
  const activeView = activeAiViewId
    ? aiViews.find((v) => v.id === activeAiViewId)
    : null

  // Yeniden adlandırma diyalog state'i
  const [renamingView, setRenamingView] = React.useState<AiSqlView | null>(null)
  const [renameInput, setRenameInput] = React.useState("")

  // SQL inceleme diyalog state'i
  const [inspectingView, setInspectingView] = React.useState<AiSqlView | null>(null)
  const [copied, setCopied] = React.useState(false)

  const handleOpenRename = (view: AiSqlView, e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    setRenamingView(view)
    setRenameInput(view.title)
  }

  const handleConfirmRename = () => {
    if (renamingView && renameInput.trim()) {
      onRenameAiView?.(renamingView.id, renameInput.trim())
    }
    setRenamingView(null)
  }

  const handleOpenInspectSql = (view: AiSqlView, e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    setInspectingView(view)
    setCopied(false)
  }

  const handleCopySql = async () => {
    if (!inspectingView) return
    try {
      await navigator.clipboard.writeText(inspectingView.sql)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // ignore
    }
  }

  const handleDelete = (viewId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    onDeleteAiView?.(viewId)
  }

  if (!hasViews && !activeView) {
    return null
  }

  return (
    <>
      <div className={cn("inline-flex items-center gap-1.5 min-w-0 select-none", className)}>
        <ChevronRight className="size-3.5 text-muted-foreground/40 shrink-0" aria-hidden />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                "group inline-flex h-6 max-w-56 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors outline-none",
                "border focus-visible:ring-1 focus-visible:ring-primary/50",
                activeView
                  ? "bg-amber-500/10 text-amber-900 border-amber-500/30 hover:bg-amber-500/15 dark:bg-amber-400/10 dark:text-amber-200 dark:border-amber-400/25"
                  : "bg-muted/50 text-foreground border-border/80 hover:bg-muted/80"
              )}
              title={activeView ? `Aktif Görünüm: ${activeView.title}` : "Aktif Görünüm: Ham Veri"}
            >
              {activeView ? (
                <Sparkles className="size-3 text-amber-700 shrink-0 dark:text-amber-400" />
              ) : (
                <Table2 className="size-3 text-muted-foreground shrink-0" />
              )}
              <span className="truncate">{activeView ? activeView.title : "Ham Veri"}</span>
              <ChevronDown className="size-3 text-muted-foreground/60 shrink-0 group-hover:text-foreground transition-colors" />
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="start" className="w-64 text-xs">
            <div className="px-2 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
              <span>Görünümler</span>
              <span className="text-[10px] lowercase font-normal">{aiViews.length} AI analizi</span>
            </div>

            {/* Ham Veri (Orijinal Tablo) */}
            <DropdownMenuItem
              onClick={() => onSelectAiView?.(null)}
              className={cn(
                "cursor-pointer flex items-center justify-between py-1.5",
                activeAiViewId == null && "font-semibold text-primary bg-primary/5"
              )}
            >
              <div className="flex items-center gap-2 min-w-0">
                <Table2 className="size-3.5 text-muted-foreground shrink-0" />
                <span className="truncate">Ham Veri (Tüm Kayıtlar)</span>
              </div>
              {activeAiViewId == null ? <Check className="size-3.5 text-primary shrink-0" /> : null}
            </DropdownMenuItem>

            {aiViews.length > 0 ? <DropdownMenuSeparator /> : null}

            {aiViews.length > 0 ? (
              <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                AI SQL Görünümleri
              </div>
            ) : null}

            {/* AI SQL Görünümleri Listesi */}
            {aiViews.map((view) => {
              const isSelected = activeAiViewId === view.id
              return (
                <DropdownMenuItem
                  key={view.id}
                  onClick={() => onSelectAiView?.(view.id)}
                  className={cn(
                    "group cursor-pointer flex items-center justify-between py-1.5 gap-2",
                    isSelected && "font-semibold text-amber-700 bg-amber-500/10 dark:text-amber-300 dark:bg-amber-400/10"
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <Sparkles className="size-3.5 text-amber-700 shrink-0 dark:text-amber-400" />
                    <span className="truncate">{view.title}</span>
                  </div>

                  {/* Eylem butonları */}
                  <div className="flex items-center gap-0.5 shrink-0 opacity-70 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={(e) => handleOpenInspectSql(view, e)}
                      className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      title="SQL Sorgusunu İncele"
                      aria-label="SQL Sorgusunu İncele"
                    >
                      <Code2 className="size-3" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleOpenRename(view, e)}
                      className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      title="Yeniden Adlandır"
                      aria-label="Yeniden Adlandır"
                    >
                      <Pencil className="size-3" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleDelete(view.id, e)}
                      className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                      title="Görünümü Sil"
                      aria-label="Görünümü Sil"
                    >
                      <Trash2 className="size-3" />
                    </button>
                    {isSelected ? <Check className="size-3.5 text-amber-700 shrink-0 ml-1 dark:text-amber-400" /> : null}
                  </div>
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Yeniden Adlandırma Diyaloğu */}
      <Dialog open={Boolean(renamingView)} onOpenChange={(open) => !open && setRenamingView(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold flex items-center gap-2">
              <Pencil className="size-4 text-primary" />
              Görünümü Yeniden Adlandır
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Bu AI analitik görünümüne kolay hatırlayabileceğiniz yeni bir ad verin.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Input
              value={renameInput}
              onChange={(e) => setRenameInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  handleConfirmRename()
                }
              }}
              placeholder="Görünüm adı..."
              className="text-xs"
              autoFocus
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setRenamingView(null)}
              className="text-xs"
            >
              İptal
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleConfirmRename}
              disabled={!renameInput.trim()}
              className="text-xs"
            >
              Kaydet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* SQL İnceleme Diyaloğu */}
      <Dialog open={Boolean(inspectingView)} onOpenChange={(open) => !open && setInspectingView(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold flex items-center gap-2">
              <Code2 className="size-4 text-amber-700 dark:text-amber-400" />
              {inspectingView?.title} — SQL Sorgusu
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Bu görünüm DuckDB WASM üzerinde aşağıdaki salt-okunur SQL ile üretilmiştir.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <pre className="p-3 bg-muted/60 border border-border/80 rounded-md text-xs font-mono overflow-x-auto max-h-72 select-text whitespace-pre-wrap break-all">
              {inspectingView?.sql}
            </pre>
          </div>
          <DialogFooter className="flex items-center justify-between sm:justify-between w-full">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCopySql}
              className="text-xs gap-1.5"
            >
              {copied ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
              {copied ? "Kopyalandı!" : "Sorguyu Kopyala"}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => setInspectingView(null)}
              className="text-xs"
            >
              Kapat
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
