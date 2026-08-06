import * as React from "react"
import { Trash2Icon } from "lucide-react"
import { ItemForm } from "./ItemForm"
import type { StockAnalyticsTreeAction } from "./StockAnalyticsReportTab"
import { useStockAnalyticsReport } from "@/context/stock-analytics-report"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

export type { StockAnalyticsTreeAction }

type StockAnalyticsFormProps = {
  filtersOpen?: boolean
  onFiltersOpenChange?: (open: boolean) => void
}

export function StockAnalyticsForm({
  filtersOpen: filtersOpenProp,
  onFiltersOpenChange,
}: StockAnalyticsFormProps = {}) {
  const [internalFiltersOpen, setInternalFiltersOpen] = React.useState(true)
  const [runReportToken, setRunReportToken] = React.useState(0)
  const [treeAction, setTreeAction] =
    React.useState<StockAnalyticsTreeAction | null>(null)
  const [treeLevel, setTreeLevel] = React.useState("2")
  const [showFilterRow, setShowFilterRow] = React.useState(true)
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false)
  const actionIdRef = React.useRef(0)
  const {
    reportReady,
    startNewReport,
    deleteActiveReport,
    deletingReport,
    activeJobId,
    running,
  } = useStockAnalyticsReport()

  const filtersOpen = filtersOpenProp ?? internalFiltersOpen
  const setFiltersOpen = onFiltersOpenChange ?? setInternalFiltersOpen

  const dispatchTreeAction = (
    action: Omit<StockAnalyticsTreeAction, "id"> & { level?: number }
  ) => {
    actionIdRef.current += 1
    if (action.type === "set-level") {
      setTreeAction({
        id: actionIdRef.current,
        type: "set-level",
        level: action.level ?? 2,
      })
      return
    }
    setTreeAction({ id: actionIdRef.current, type: action.type })
  }

  const handleConfirmDelete = React.useCallback(
    async (event: React.MouseEvent<HTMLButtonElement>) => {
      // Async silme bitene kadar dialog açık kalsın.
      event.preventDefault()
      try {
        await deleteActiveReport()
        setDeleteDialogOpen(false)
      } catch {
        // Hata context'te runEvents'e yazılır; dialog açık kalır.
      }
    },
    [deleteActiveReport]
  )

  return (
    <>
      <ItemForm
        mode="stock-analytics"
        filtersOpen={filtersOpen}
        onFiltersOpenChange={setFiltersOpen}
        onRunReport={() => setRunReportToken((token) => token + 1)}
        runReportToken={runReportToken}
        reportReady={reportReady}
        showFilterRow={showFilterRow}
        onShowFilterRowChange={setShowFilterRow}
        treeLevel={treeLevel}
        onTreeLevelChange={setTreeLevel}
        onExpandAll={() => dispatchTreeAction({ type: "expand-all" })}
        onCollapseAll={() => dispatchTreeAction({ type: "collapse-all" })}
        onSetTreeLevel={() =>
          dispatchTreeAction({
            type: "set-level",
            level: Number(treeLevel) || 1,
          })
        }
        treeAction={treeAction}
        onStartNewReport={startNewReport}
        onDeleteActiveReport={() => setDeleteDialogOpen(true)}
        deletingReport={deletingReport}
        activeJobId={activeJobId}
        reportRunning={running}
      />

      <AlertDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          if (deletingReport) return
          setDeleteDialogOpen(open)
        }}
      >
        <AlertDialogContent className="data-[size=default]:max-w-md data-[size=default]:sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-destructive/10 text-destructive dark:bg-destructive/20 dark:text-destructive">
              <Trash2Icon />
            </AlertDialogMedia>
            <AlertDialogTitle>Delete this execution?</AlertDialogTitle>
            <AlertDialogDescription>
              {activeJobId ? (
                <>
                  Execution{" "}
                  <span className="break-all font-mono text-foreground">
                    {activeJobId}
                  </span>{" "}
                  will be permanently removed from history. Your filters and
                  report definition stay — only this run is deleted.
                </>
              ) : (
                <>
                  This execution will be permanently removed from history. This
                  action cannot be undone.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="outline" disabled={deletingReport}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deletingReport}
              onClick={(event) => void handleConfirmDelete(event)}
            >
              {deletingReport ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
