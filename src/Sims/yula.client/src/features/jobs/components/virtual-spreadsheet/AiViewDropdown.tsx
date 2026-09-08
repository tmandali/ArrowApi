"use client"

import * as React from "react"
import {
  BookmarkPlus,
  ChevronDown,
  Code2,
  Copy,
  Check,
  Loader2,
  Pencil,
  Sparkles,
  Table2,
  Trash2,
  X,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import { cn } from "@/utils/cn"
import type { AiSqlView } from "./types"

export interface AiViewDropdownProps {
  reportTitle?: string
  aiViews?: readonly AiSqlView[]
  activeAiViewId?: string | null
  currentQuerySql?: string | null
  currentQueryTitle?: string | null
  onSelectAiView?: (viewId: string | null) => void
  onSaveCurrentAiView?: (title: string) => void
  onRenameAiView?: (viewId: string, nextTitle: string) => void
  onDeleteAiView?: (viewId: string) => void
  /** Görünüm sorgusu yürütülüyor mu? (trigger'da dönen spinner gösterilir) */
  isViewLoading?: boolean
  className?: string
}

export function AiViewDropdown({
  reportTitle,
  aiViews = [],
  activeAiViewId = null,
  currentQuerySql = null,
  currentQueryTitle = null,
  onSelectAiView,
  onSaveCurrentAiView,
  onRenameAiView,
  onDeleteAiView,
  isViewLoading = false,
  className,
}: AiViewDropdownProps) {
  const isCurrentQueryActive = Boolean(currentQuerySql)
  const defaultLabel = reportTitle || "Tüm Kayıtlar"

  // Aktif sorgu kayıtlı mı kontrolü
  const savedMatch = isCurrentQueryActive
    ? aiViews.find(
        (v) => v.id === activeAiViewId || v.sql.trim() === currentQuerySql?.trim()
      )
    : activeAiViewId
    ? aiViews.find((v) => v.id === activeAiViewId)
    : null

  const isCurrentQuerySaved = Boolean(savedMatch)
  const activeTitle = savedMatch
    ? savedMatch.title
    : isCurrentQueryActive
    ? currentQueryTitle || "AI Analizi"
    : defaultLabel

  // Tek tıkla doğrudan kaydetme (modal olmadan)
  const handleQuickSave = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    const titleToSave = currentQueryTitle?.trim() || activeTitle || "AI Görünümü"
    onSaveCurrentAiView?.(titleToSave)
  }

  // Satır içi (inline) yeniden adlandırma state'i
  const [editingViewId, setEditingViewId] = React.useState<string | null>(null)
  const [renameInput, setRenameInput] = React.useState("")

  // SQL inceleme diyalog state'i
  const [inspectingSql, setInspectingSql] = React.useState<{ title: string; sql: string } | null>(null)
  const [copied, setCopied] = React.useState(false)

  const handleStartRename = (view: AiSqlView, e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    setEditingViewId(view.id)
    setRenameInput(view.title)
  }

  const handleConfirmRename = (viewId: string) => {
    if (renameInput.trim()) {
      onRenameAiView?.(viewId, renameInput.trim())
    }
    setEditingViewId(null)
  }

  const handleCancelRename = () => {
    setEditingViewId(null)
  }

  const handleOpenInspectSql = (title: string, sql: string, e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    setInspectingSql({ title, sql })
    setCopied(false)
  }

  const handleCopySql = async () => {
    if (!inspectingSql) return
    try {
      await navigator.clipboard.writeText(inspectingSql.sql)
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

  return (
    <>
      <div className={cn("inline-flex items-center gap-1 min-w-0 shrink select-none", className)}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-busy={isViewLoading || undefined}
              className={cn(
                "group inline-flex h-7 min-w-0 max-w-[240px] sm:max-w-[360px] md:max-w-[480px] items-center gap-1.5 rounded-md px-1.5 py-1 text-sm font-semibold tracking-tight transition-colors outline-none shrink",
                "focus-visible:ring-1 focus-visible:ring-primary/50",
                isCurrentQueryActive
                  ? "text-amber-900 hover:bg-amber-500/10 dark:text-amber-200 dark:hover:bg-amber-400/10"
                  : "text-primary hover:bg-muted/70 dark:text-sidebar-primary"
              )}
              title={
                isViewLoading
                  ? `Yükleniyor: ${activeTitle}`
                  : isCurrentQueryActive
                  ? isCurrentQuerySaved
                    ? `Aktif Kayıtlı Görünüm: ${activeTitle}`
                    : `Aktif Geçici AI Görünümü (Kaydedilmedi): ${activeTitle}`
                  : `Aktif Görünüm: ${defaultLabel}`
              }
            >
              {isViewLoading ? (
                <Loader2
                  className="size-3.5 shrink-0 animate-spin text-amber-600 dark:text-amber-400"
                  aria-hidden
                />
              ) : isCurrentQueryActive ? (
                <Sparkles className="size-3.5 text-amber-600 shrink-0 dark:text-amber-400" />
              ) : (
                <Table2 className="size-3.5 shrink-0 text-orange-600/80 dark:text-orange-400/80" />
              )}
              <span className={cn("min-w-0 flex-1 truncate", isViewLoading && "opacity-60")}>
                {activeTitle}
              </span>
              {isCurrentQueryActive && !isCurrentQuerySaved && !isViewLoading ? (
                <span
                  className="size-1.5 rounded-full bg-amber-500 shrink-0"
                  title="Kaydedilmedi"
                />
              ) : null}
              <ChevronDown className="size-3 text-muted-foreground/60 shrink-0 transition-transform group-data-[state=open]:rotate-180 group-hover:text-foreground" />
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="start" className="w-72 text-xs">
            {/* Kaydedilmemiş Geçici Görünüm Banner'ı */}
            {isCurrentQueryActive && !isCurrentQuerySaved ? (
              <>
                <div className="p-2 border-b border-border/80 bg-amber-500/5 dark:bg-amber-400/5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] font-semibold text-foreground truncate">
                        {activeTitle}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        Kaydedilmemiş geçici analiz
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {currentQuerySql ? (
                        <button
                          type="button"
                          onClick={(e) =>
                            handleOpenInspectSql(activeTitle, currentQuerySql, e)
                          }
                          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                          title="SQL Sorgusunu İncele"
                        >
                          <Code2 className="size-3.5" />
                        </button>
                      ) : null}
                      <Button
                        type="button"
                        size="sm"
                        className="h-6 px-2 text-[11px] gap-1 shrink-0 bg-amber-600 hover:bg-amber-700 text-white dark:bg-amber-500 dark:hover:bg-amber-600"
                        onClick={handleQuickSave}
                        title="Görünümü kaydet"
                      >
                        <BookmarkPlus className="size-3" />
                        Kaydet
                      </Button>
                    </div>
                  </div>
                </div>
              </>
            ) : null}

            {/* Raporun Kendi Başlığı (Ham Veri / Tüm Kayıtlar) */}
            <DropdownMenuItem
              onClick={() => onSelectAiView?.(null)}
              className={cn(
                "cursor-pointer flex items-center justify-between py-1.5",
                !isCurrentQueryActive && "font-semibold text-primary bg-primary/5"
              )}
            >
              <div className="flex items-center gap-2 min-w-0">
                <Table2 className="size-3.5 text-orange-600/80 dark:text-orange-400/80 shrink-0" />
                <span className="truncate">{defaultLabel}</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[10px] text-muted-foreground font-normal">Tüm Kayıtlar</span>
                {!isCurrentQueryActive ? <Check className="size-3.5 text-primary shrink-0" /> : null}
              </div>
            </DropdownMenuItem>

            {aiViews.length === 0 && !isCurrentQueryActive ? (
              <div className="px-2.5 py-2 text-[11px] text-muted-foreground flex items-center gap-1.5 border-t border-border/60">
                <Sparkles className="size-3 text-amber-500 shrink-0" />
                <span>Yula AI ile sorgu ürettiğinizde görünümler burada listelenir.</span>
              </div>
            ) : null}

            {/* Görünümler Listesi */}
            {aiViews.map((view) => {
              const isSelected = isCurrentQueryActive && savedMatch?.id === view.id
              const isEditing = editingViewId === view.id

              if (isEditing) {
                return (
                  <div
                    key={view.id}
                    className="flex items-center gap-1.5 py-1 px-2 w-full bg-muted/70 rounded-md my-0.5 border border-primary/40"
                    onClick={(e) => {
                      e.stopPropagation()
                      e.preventDefault()
                    }}
                    onKeyDown={(e) => {
                      e.stopPropagation()
                    }}
                  >
                    <Sparkles className="size-3 text-amber-700 shrink-0 dark:text-amber-400" />
                    <input
                      type="text"
                      value={renameInput}
                      onChange={(e) => setRenameInput(e.target.value)}
                      onKeyDown={(e) => {
                        e.stopPropagation()
                        if (e.key === "Enter") {
                          e.preventDefault()
                          handleConfirmRename(view.id)
                        } else if (e.key === "Escape") {
                          e.preventDefault()
                          handleCancelRename()
                        }
                      }}
                      autoFocus
                      onFocus={(e) => e.currentTarget.select()}
                      className="h-6 flex-1 min-w-0 px-1.5 text-xs bg-background border border-border/80 rounded outline-none focus:border-primary text-foreground"
                    />
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        e.preventDefault()
                        handleConfirmRename(view.id)
                      }}
                      className="p-1 rounded text-primary hover:bg-primary/10 transition-colors"
                      title="Kaydet (Enter)"
                      aria-label="Kaydet"
                    >
                      <Check className="size-3" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        e.preventDefault()
                        handleCancelRename()
                      }}
                      className="p-1 rounded text-muted-foreground hover:bg-muted transition-colors"
                      title="İptal (Esc)"
                      aria-label="İptal"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                )
              }

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
                      onClick={(e) => handleOpenInspectSql(view.title, view.sql, e)}
                      className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      title="SQL Sorgusunu İncele"
                      aria-label="SQL Sorgusunu İncele"
                    >
                      <Code2 className="size-3" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleStartRename(view, e)}
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

        {/* Geçici AI görünümü aktifse tek tıkla doğrudan kaydetme ikonu */}
        {isCurrentQueryActive && !isCurrentQuerySaved ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleQuickSave}
            className="size-6 text-amber-700 hover:bg-amber-500/15 hover:text-amber-900 dark:text-amber-300 dark:hover:bg-amber-400/15 shrink-0"
            title="Görünümü kaydet"
            aria-label="Görünümü kaydet"
          >
            <BookmarkPlus className="size-3.5" />
          </Button>
        ) : null}
      </div>

      {/* SQL İnceleme Diyaloğu */}
      <Dialog open={Boolean(inspectingSql)} onOpenChange={(open) => !open && setInspectingSql(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold flex items-center gap-2">
              <Code2 className="size-4 text-amber-700 dark:text-amber-400" />
              {inspectingSql?.title} — SQL Sorgusu
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Bu görünüm DuckDB WASM üzerinde aşağıdaki salt-okunur SQL ile üretilmiştir.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <pre className="p-3 bg-muted/60 border border-border/80 rounded-md text-xs font-mono overflow-x-auto max-h-72 select-text whitespace-pre-wrap break-all">
              {inspectingSql?.sql}
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
              onClick={() => setInspectingSql(null)}
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
