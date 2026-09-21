"use client"

import * as React from "react"
import {
  type SpreadsheetColumn,
  colIndexToLetter,
  letterToColIndex,
} from "../types"

export interface UseNameBoxNavigationParams<T> {
  selection: { startRow: number; startCol: number; endRow: number; endCol: number } | null
  activeCell: { row: number; col: number } | null
  cellLocator: boolean
  displayItemsRef: React.RefObject<readonly unknown[] | null> | React.MutableRefObject<readonly unknown[] | null | undefined>
  visibleColumns: readonly SpreadsheetColumn[]
  startSelection: (row: number, col: number) => void
  extendSelection: (row: number, col: number) => void
  clearSelection: () => void
  displayItems: readonly T[]
}

export function useNameBoxNavigation<T>({
  selection,
  activeCell,
  cellLocator,
  displayItemsRef,
  visibleColumns,
  startSelection,
  extendSelection,
  displayItems,
}: UseNameBoxNavigationParams<T>) {
  const selectionRefLabel = React.useMemo(() => {
    if (selection) {
      const r0 = Math.min(selection.startRow, selection.endRow)
      const r1 = Math.max(selection.startRow, selection.endRow)
      const c0 = Math.min(selection.startCol, selection.endCol)
      const c1 = Math.max(selection.startCol, selection.endCol)
      const start = `${colIndexToLetter(c0)}${r0 + 1}`
      if (r0 === r1 && c0 === c1) return start
      return `${start}:${colIndexToLetter(c1)}${r1 + 1}`
    }
    return activeCell ? `${colIndexToLetter(activeCell.col)}${activeCell.row + 1}` : null
  }, [selection, activeCell])

  const selectionSize = React.useMemo(() => {
    if (!selection) return null
    const rows = Math.abs(selection.endRow - selection.startRow) + 1
    const cols = Math.abs(selection.endCol - selection.startCol) + 1
    return { rows, cols, cells: rows * cols }
  }, [selection])

  const [nameBoxDraft, setNameBoxDraft] = React.useState<string | null>(null)
  const [prevLabel, setPrevLabel] = React.useState(selectionRefLabel)
  if (prevLabel !== selectionRefLabel) {
    setPrevLabel(selectionRefLabel)
    setNameBoxDraft(null)
  }

  const commitNameBox = React.useCallback(() => {
    const raw = nameBoxDraft?.trim()
    setNameBoxDraft(null)
    if (!raw || !cellLocator) return
    const match = raw.toUpperCase().match(/^([A-Z]+\d+)(?::([A-Z]+\d+))?$/)
    if (!match) return
    const parseRef = (s: string): { r: number; c: number } | null => {
      const refMatch = s.match(/^([A-Z]+)(\d+)$/)
      if (!refMatch) return null
      const r = Number(refMatch[2]) - 1
      const c = letterToColIndex(refMatch[1])
      if (r < 0 || c < 0) return null
      if (r >= (displayItemsRef.current?.length ?? 0) || c >= visibleColumns.length) return null
      return { r, c }
    }
    const from = parseRef(match[1])
    if (!from) return
    startSelection(from.r, from.c)
    if (match[2]) {
      const to = parseRef(match[2])
      if (to) extendSelection(to.r, to.c)
    }
  }, [nameBoxDraft, cellLocator, displayItemsRef, visibleColumns, startSelection, extendSelection])

  const buildSelectionTsv = React.useCallback((): string | null => {
    if (!selection) return null
    const r0 = Math.min(selection.startRow, selection.endRow)
    const r1 = Math.max(selection.startRow, selection.endRow)
    const c0 = Math.min(selection.startCol, selection.endCol)
    const c1 = Math.max(selection.startCol, selection.endCol)
    const rows = displayItems as readonly Record<string, unknown>[]
    const cols = visibleColumns.slice(c0, c1 + 1)
    const lines: string[] = []
    for (let r = r0; r <= r1 && r < rows.length; r += 1) {
      const item = rows[r]
      if (!item) continue
      lines.push(
        cols
          .map((col) => {
            const v = item[col.name]
            if (v == null) return ""
            if (typeof v === "object") return JSON.stringify(v)
            return String(v)
          })
          .join("\t")
      )
    }
    return lines.length ? lines.join("\n") : null
  }, [selection, displayItems, visibleColumns])

  const handleCopyTsv = React.useCallback(() => {
    const text = buildSelectionTsv()
    if (text) void navigator.clipboard?.writeText(text)
  }, [buildSelectionTsv])

  const handleCopy = React.useCallback(
    (event: React.ClipboardEvent) => {
      if (cellLocator && selection) {
        const text = buildSelectionTsv()
        if (text) {
          event.clipboardData.setData("text/plain", text)
          event.preventDefault()
        }
        return
      }
      const textSelection = window.getSelection()
      if (!textSelection || textSelection.isCollapsed) return
      const rawText = textSelection.toString()
      if (!rawText) return
      const lines = rawText.split(/\r?\n/)
      if (lines.length <= 1) {
        const clean = rawText.trim()
        if (clean) {
          event.clipboardData.setData("text/plain", clean)
          event.preventDefault()
        }
        return
      }
      const cleanLines = lines.map((l) => l.trim()).join("\n").trim()
      if (cleanLines) {
        event.clipboardData.setData("text/plain", cleanLines)
        event.preventDefault()
      }
    },
    [cellLocator, selection, buildSelectionTsv]
  )

  return {
    selectionRefLabel,
    selectionSize,
    nameBoxDraft,
    setNameBoxDraft,
    commitNameBox,
    buildSelectionTsv,
    handleCopyTsv,
    handleCopy,
  }
}
