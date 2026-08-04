import * as React from "react"
import { ItemForm } from "./ItemForm"
import type { StockAnalyticsTreeAction } from "./StockAnalyticsReportTab"

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
  const actionIdRef = React.useRef(0)

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

  return (
    <ItemForm
      mode="stock-analytics"
      tabs={["report", "tax"]}
      defaultTab="report"
      tabLabels={{
        tax: "Data Prepare",
        report: "Report",
      }}
      filtersOpen={filtersOpen}
      onFiltersOpenChange={setFiltersOpen}
      onRunReport={() => setRunReportToken((token) => token + 1)}
      runReportToken={runReportToken}
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
    />
  )
}
