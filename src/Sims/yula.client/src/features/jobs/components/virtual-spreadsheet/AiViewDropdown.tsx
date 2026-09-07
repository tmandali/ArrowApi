"use client"

import * as React from "react"
import {
  BookmarkPlus,
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
  currentQuerySql?: string | null
  currentQueryTitle?: string | null
  onSelectAiView?: (viewId: string | null) => void
  onSaveCurrentAiView?: (title: string) => void
  onRenameAiView?: (viewId: string, nextTitle: string) => void
  onDeleteAiView?: (viewId: string) => void
  className?: string
}

export function AiViewDropdown({
  aiViews = [],
  activeAiViewId = null,
  currentQuerySql = null,
  currentQueryTitle = null,
  onSelectAiView,
  onSaveCurrentAiView,
  onRenameAiView,
  onDeleteAiView,
  className,
}: AiViewDropdownProps) {
  const hasViews = aiViews.length > 0
  const isCurrentQueryActive = Boolean(currentQuerySql)

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
    : "Tüm Kayıtlar"

  // Kaydetme diyalog state'i
  const [isSavingCurrent, setIsSavingCurrent] = React.useState(false)
  const [saveTitleInput, setSaveTitleInput] = React.useState("")

  // Yeniden adlandırma diyalog state'i
  const [renamingView, setRenamingView] = React.useState<AiSqlView | null>(null)
  const [renameInput, setRenameInput] = React.useState("")

  // SQL inceleme diyalog state'i
  const [inspectingSql, setInspectingSql] = React.useState<{ title: string; sql: string } | null>(null)
  const [copied, setCopied] = React.useState(false)

  const handleOpenSaveCurrent = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    setSaveTitleInput(currentQueryTitle || "AI Analitik Görünümü")
    setIsSavingCurrent(true)
  }

  const handleConfirmSaveCurrent = () => {
    if (saveTitleInput.trim()) {
      onSaveCurrentAiView?.(saveTitleInput.trim())
    }
    setIsSavingCurrent(false)
  }

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

  if (!hasViews && !isCurrentQueryActive) {
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
                "group inline-flex h-6 max-w-64 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors outline-none",
                "border focus-visible:ring-1 focus-visible:ring-primary/50",
                isCurrentQueryActive
                  ? "bg-amber-500/10 text-amber-900 border-amber-500/30 hover:bg-amber-500/15 dark:bg-amber-400/10 dark:text-amber-200 dark:border-amber-400/25"
                  : "bg-muted/50 text-foreground border-border/80 hover:bg-muted/80"
              )}
              title={
                isCurrentQueryActive
                  ? isCurrentQuerySaved
                    ? `Aktif Kayıtlı Görünüm: ${activeTitle}`
                    : `Aktif Geçici AI Görünümü (Kaydedilmedi): ${activeTitle}`
                  : "Aktif Görünüm: Tüm Kayıtlar"
              }
            >
              {isCurrentQueryActive ? (
                <Sparkles className="size-3 text-amber-700 shrink-0 dark:text-amber-400" />
              ) : (
                <Table2 className="size-3 text-muted-foreground shrink-0" />
              )}
              <span className="truncate">{activeTitle}</span>
              {isCurrentQueryActive && !isCurrentQuerySaved ? (
                <span
                  className="size-1.5 rounded-full bg-amber-500 shrink-0"
                  title="Kaydedilmedi"
                />
              ) : null}
              <ChevronDown className="size-3 text-muted-foreground/60 shrink-0 group-hover:text-foreground transition-colors" />
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
                        onClick={handleOpenSaveCurrent}
                      >
                        <BookmarkPlus className="size-3" />
                        Kaydet
                      </Button>
                    </div>
                  </div>
                </div>
              </>
            ) : null}

            {/* Tüm Kayıtlar (Ham Veri) */}
            <DropdownMenuItem
              onClick={() => onSelectAiView?.(null)}
              className={cn(
                "cursor-pointer flex items-center justify-between py-1.5",
                !isCurrentQueryActive && "font-semibold text-primary bg-primary/5"
              )}
            >
              <div className="flex items-center gap-2 min-w-0">
                <Table2 className="size-3.5 text-muted-foreground shrink-0" />
                <span className="truncate">Tüm Kayıtlar</span>
              </div>
              {!isCurrentQueryActive ? <Check className="size-3.5 text-primary shrink-0" /> : null}
            </DropdownMenuItem>

            {/* Görünümler Listesi */}
            {aiViews.map((view) => {
              const isSelected = isCurrentQueryActive && savedMatch?.id === view.id
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

      {/* Görünümü Kaydet Diyaloğu */}
      <Dialog open={isSavingCurrent} onOpenChange={setIsSavingCurrent}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold flex items-center gap-2">
              <BookmarkPlus className="size-4 text-amber-600 dark:text-amber-400" />
              AI Görünümünü Kaydet
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Bu analitik görünümü daha sonra tek tıkla açabilmek için listenize kaydedin.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Input
              value={saveTitleInput}
              onChange={(e) => setSaveTitleInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  handleConfirmSaveCurrent()
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
              onClick={() => setIsSavingCurrent(false)}
              className="text-xs"
            >
              İptal
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleConfirmSaveCurrent}
              disabled={!saveTitleInput.trim()}
              className="text-xs bg-amber-600 hover:bg-amber-700 text-white dark:bg-amber-500 dark:hover:bg-amber-600"
            >
              Kaydet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
