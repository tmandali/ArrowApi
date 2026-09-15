"use client";

import * as React from "react"
import {
  CELL_SELECTION_STYLE,
  CELL_SELECTION_RANGE_ATTR,
  CELL_SELECTION_EDGE_ATTR,
  cellSelectionActiveClass,
  type SpreadsheetColumn,
} from "../types"

export type CellSelection = {
  startRow: number
  startCol: number
  endRow: number
  endCol: number
}

export interface CellSelectionParams {
  cellLocator: boolean
  visibleColumns: readonly SpreadsheetColumn[]
  /** Aktif (sıralama/filtre sonrası) satırlar — klavye nav aralığı için */
  displayItemsRef: React.MutableRefObject<readonly unknown[]>
  bodyTableRef: React.RefObject<HTMLTableElement | null>
  /**
   * Veri kaynağının kimliği (örn. resetKey: jobId:sql:filterKey). Değişince
   * index tabanlı eski seçim/sürükleme geçersiz sayılır ve sıfırlanır.
   */
  dataIdentity?: unknown
}

export interface CellSelectionReturn {
  activeCell: { row: number; col: number } | null
  selection: CellSelection | null
  startSelection: (row: number, col: number, additive?: boolean) => void
  extendSelection: (row: number, col: number) => void
  inSelection: (row: number, col: number) => boolean
  handleBodyCellClick: (event: React.MouseEvent<HTMLTableElement>) => void
  handleBodyMouseDown: (event: React.MouseEvent<HTMLTableElement>) => void
  handleBodyKeyDown: (event: React.KeyboardEvent<HTMLTableElement>) => void
  /** Seçimi (aralık + aktif hücre) temizler — Esc ile de tetiklenir */
  clearSelection: () => void
  /** Render edilen satır `<tr>` elementine data-vsp-cell attribute'larını enjekte eder */
  applyCellLocatorAttributes: (trElement: HTMLTableRowElement, rowIndex: number) => void
  /**
   * Render edilen satır `<tr>` elementine seçim aralığı attribute'larını (fill +
   * edge maskesi) enjekte eder. Virtual grid'de satırlar scroll'da mount/unmount
   * olduğundan görsel seçim, seçim state'i değiştiğinde değil, her satır mount'ta
   * da yeniden uygulanmalıdır.
   */
  applyRowSelectionAttributes: (trElement: HTMLTableRowElement, rowIndex: number) => void
}

/**
 * Excel benzeri çoklu hücre seçimi + klavye navigasyonu state'ini ve
 * `data-vsp-cell` konum attribute'larının DOM'a enjeksiyonunu kapsüller.
 */
export function useCellSelection({
  cellLocator,
  visibleColumns,
  displayItemsRef,
  bodyTableRef,
  dataIdentity,
}: CellSelectionParams): CellSelectionReturn {
  const [activeCell, setActiveCell] = React.useState<{ row: number; col: number } | null>(null)
  const [selection, setSelection] = React.useState<CellSelection | null>(null)
  const isSelectingRef = React.useRef(false)
  const suppressNextClickSelectRef = React.useRef(false)

  // Veri kaynağı değişince (yeni job / query / filtre) index tabanlı eski seçim
  // artık yanlış veriye işaret eder; state'i sıfırla. DOM attribute'ları
  // markSelectionCells/applyRowSelectionAttributes selection=null'da temizler.
  React.useEffect(() => {
    setSelection(null)
    setActiveCell(null)
  }, [dataIdentity])

  const inSelection = React.useCallback(
    (row: number, col: number) => {
      if (!selection) return false
      const r0 = Math.min(selection.startRow, selection.endRow)
      const r1 = Math.max(selection.startRow, selection.endRow)
      const c0 = Math.min(selection.startCol, selection.endCol)
      const c1 = Math.max(selection.startCol, selection.endCol)
      return row >= r0 && row <= r1 && col >= c0 && col <= c1
    },
    [selection]
  )

  const startSelection = React.useCallback(
    (row: number, col: number, additive = false) => {
      setActiveCell({ row, col })
      if (additive) {
        setSelection((prev) =>
          prev
            ? { startRow: row, startCol: col, endRow: row, endCol: col }
            : null
        )
      } else {
        setSelection({ startRow: row, startCol: col, endRow: row, endCol: col })
      }
    },
    []
  )

  const extendSelection = React.useCallback(
    (row: number, col: number) => {
      setSelection((prev) => {
        if (!prev) return null
        return { ...prev, endRow: row, endCol: col }
      })
    },
    []
  )

  const markSelectionCells = React.useCallback(() => {
    const table = bodyTableRef.current
    if (!table) return
    table
      .querySelectorAll(`td[data-vsp-cell][${CELL_SELECTION_EDGE_ATTR}]`)
      .forEach((el) => {
        el.removeAttribute(CELL_SELECTION_RANGE_ATTR)
        el.removeAttribute(CELL_SELECTION_EDGE_ATTR)
      })
    if (!selection || !inSelection) return
    const r0 = Math.min(selection.startRow, selection.endRow)
    const r1 = Math.max(selection.startRow, selection.endRow)
    const c0 = Math.min(selection.startCol, selection.endCol)
    const c1 = Math.max(selection.startCol, selection.endCol)
    // Tek hücrede kenar çizgileri seçimi zaten belli ediyor; iç boyama sadece
    // çoklu aralıkta uygulanır (Excel'deki dolu-bant hissi).
    const isSingleCell = r0 === r1 && c0 === c1
    for (let r = r0; r <= r1; r += 1) {
      for (let c = c0; c <= c1; c += 1) {
        const colName = visibleColumns[c]?.name
        if (!colName) continue
        const cell = table.querySelector<HTMLElement>(`td[data-vsp-cell="${r}-${colName}"]`)
        if (!cell) continue
        if (!isSingleCell) cell.setAttribute(CELL_SELECTION_RANGE_ATTR, "true")
        // Hücre, aralığın hangi kenarlarında? → CSS box-shadow maskesi (içte çizgi yok)
        let edgeMask = ""
        if (r === r0) edgeMask += "t"
        if (r === r1) edgeMask += "b"
        if (c === c0) edgeMask += "l"
        if (c === c1) edgeMask += "r"
        cell.setAttribute(CELL_SELECTION_EDGE_ATTR, edgeMask)
      }
    }
  }, [selection, inSelection, visibleColumns, bodyTableRef])

  // Seçim değiştiğinde DOM işaretlerini güncelle
  React.useEffect(() => {
    markSelectionCells()
  }, [markSelectionCells])

  const handleBodyCellClick = React.useCallback(
    (event: React.MouseEvent<HTMLTableElement>) => {
      if (suppressNextClickSelectRef.current) {
        suppressNextClickSelectRef.current = false
        return
      }
      const cell = (event.target as HTMLElement).closest<HTMLElement>("td[data-vsp-cell]")
      if (!cell || !bodyTableRef.current) return
      const parsed = (cell.dataset.vspCell ?? "").split("-")
      const row = Number(parsed[0])
      const colIndex = visibleColumns.findIndex((c) => c.name === parsed.slice(1).join("-"))
      if (Number.isNaN(row) || colIndex < 0) return
      const additive = event.shiftKey || event.metaKey || event.ctrlKey
      if (additive && activeCell && selection && event.shiftKey) {
        extendSelection(row, colIndex)
      } else {
        startSelection(row, colIndex, additive && !event.shiftKey)
      }
    },
    [activeCell, selection, visibleColumns, startSelection, extendSelection, bodyTableRef]
  )

  const handleBodyMouseDown = React.useCallback(
    (event: React.MouseEvent<HTMLTableElement>) => {
      if (!event.shiftKey) return
      isSelectingRef.current = true
    },
    []
  )

  const activeCellRef = React.useRef(activeCell)
  React.useEffect(() => {
    activeCellRef.current = activeCell
  }, [activeCell])

  const clearSelection = React.useCallback(() => {
    setSelection(null)
    setActiveCell(null)
  }, [])

  const handleBodyKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLTableElement>) => {
      const currentActive = activeCellRef.current
      if (!currentActive) return
      // Esc: seçim aralığını ve aktif hücreyi temizle
      if (event.key === "Escape") {
        event.stopPropagation()
        clearSelection()
        return
      }
      const currentItems = displayItemsRef.current
      const maxRow = Math.max(0, currentItems.length - 1)
      const maxCol = Math.max(0, visibleColumns.length - 1)
      let nextRow = currentActive.row
      let nextCol = currentActive.col
      let handled = true
      switch (event.key) {
        case "ArrowUp":
          nextRow = Math.max(0, currentActive.row - 1)
          break
        case "ArrowDown":
          nextRow = Math.min(maxRow, currentActive.row + 1)
          break
        case "ArrowLeft":
          nextCol = Math.max(0, currentActive.col - 1)
          break
        case "ArrowRight":
          nextCol = Math.min(maxCol, currentActive.col + 1)
          break
        case "Home":
          nextCol = 0
          break
        case "End":
          nextCol = maxCol
          break
        case "PageUp":
          nextRow = Math.max(0, currentActive.row - 10)
          break
        case "PageDown":
          nextRow = Math.min(maxRow, currentActive.row + 10)
          break
        case "Enter":
          nextRow = Math.min(maxRow, currentActive.row + 1)
          break
        case "Tab":
          nextCol = event.shiftKey
            ? Math.max(0, currentActive.col - 1)
            : Math.min(maxCol, currentActive.col + 1)
          break
        default:
          handled = false
      }
      if (!handled) return
      event.preventDefault()
      const rangeMode = event.shiftKey || event.ctrlKey || event.metaKey
      const targetCell = bodyTableRef.current?.querySelector<HTMLElement>(
        `td[data-vsp-cell="${nextRow}-${visibleColumns[nextCol]?.name}"]`
      )
      if (rangeMode && selection) {
        setActiveCell({ row: nextRow, col: nextCol })
        setSelection((prev) => (prev ? { ...prev, endRow: nextRow, endCol: nextCol } : prev))
      } else {
        startSelection(nextRow, nextCol, false)
      }
      if (targetCell) {
        targetCell.scrollIntoView({ block: "nearest", inline: "nearest" })
      }
    },
    [displayItemsRef, visibleColumns, selection, startSelection, bodyTableRef, clearSelection]
  )

  // Fare ile çoklu hücre seçimi sürüklemesi
  React.useEffect(() => {
    if (!isSelectingRef.current) return
    const handleMouseMove = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      const cell =
        target?.querySelector?.<HTMLElement>("td[data-vsp-cell]") ??
        target?.closest?.<HTMLElement>("td[data-vsp-cell]")
      if (!cell || !cell.dataset.vspCell) return
      const parsed = cell.dataset.vspCell.split("-")
      const row = Number(parsed[0])
      const colIndex = visibleColumns.findIndex((c) => c.name === parsed.slice(1).join("-"))
      if (Number.isNaN(row) || colIndex < 0) return
      extendSelection(row, colIndex)
    }
    const handleMouseUp = () => {
      isSelectingRef.current = false
    }
    window.addEventListener("mousemove", handleMouseMove)
    window.addEventListener("mouseup", handleMouseUp)
    return () => {
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseup", handleMouseUp)
    }
  }, [extendSelection, visibleColumns])

  // Hücre konumlanabilirliği: tıklanan hücreyi kriter grid'indeki hücre
  // seçimi stiliyle (şeffaf border → focus'ta 1px border-border + bg-background)
  // konumlandırır. Yula ekran-bazlı "hücreye git / odaklan" emirleri aynı
  // attribute'u okuyarak hücreyi bulabilir (kriter girdisindeki data-grid-cell deseni).
  React.useEffect(() => {
    if (!cellLocator) return
    const styleId = "vsp-cell-locator-style"
    if (document.getElementById(styleId)) return
    const styleEl = document.createElement("style")
    styleEl.id = styleId
    styleEl.textContent = CELL_SELECTION_STYLE
    document.head.appendChild(styleEl)
    return () => {
      document.getElementById(styleId)?.remove()
    }
  }, [cellLocator])

  const applyCellLocatorAttributes = React.useCallback(
    (trElement: HTMLTableRowElement, rowIndex: number) => {
      if (!cellLocator) return
      const tds = Array.from(trElement.children) as HTMLElement[]
      tds.forEach((td, colIndex) => {
        const colName = visibleColumns[colIndex]?.name
        if (!colName || td.dataset.vspCell != null) return
        td.dataset.vspCell = `${rowIndex}-${colName}`
      })
    },
    [cellLocator, visibleColumns]
  )

  /**
   * Satır bazında seçim aralığı attribute'larını yazar (fill + edge maskesi).
   * Virtual grid'de satırlar scroll ile mount/unmount olur; görsel seçimin
   * kaybolmaması için her satır mount'unda ref üzerinden uygulanır.
   * Maskesi markSelectionCells ile aynı sırayla (t,b,l,r) üretilir.
   */
  const applyRowSelectionAttributes = React.useCallback(
    (trElement: HTMLTableRowElement, rowIndex: number) => {
      if (!cellLocator) return
      const tds = Array.from(trElement.children) as HTMLElement[]
      if (!selection) {
        tds.forEach((td) => {
          td.removeAttribute(CELL_SELECTION_RANGE_ATTR)
          td.removeAttribute(CELL_SELECTION_EDGE_ATTR)
        })
        return
      }
      const r0 = Math.min(selection.startRow, selection.endRow)
      const r1 = Math.max(selection.startRow, selection.endRow)
      const c0 = Math.min(selection.startCol, selection.endCol)
      const c1 = Math.max(selection.startCol, selection.endCol)
      if (rowIndex < r0 || rowIndex > r1) {
        tds.forEach((td) => {
          td.removeAttribute(CELL_SELECTION_RANGE_ATTR)
          td.removeAttribute(CELL_SELECTION_EDGE_ATTR)
        })
        return
      }
      const isSingleCell = r0 === r1 && c0 === c1
      const vEdge = (rowIndex === r0 ? "t" : "") + (rowIndex === r1 ? "b" : "")
      tds.forEach((td, colIndex) => {
        const colName = visibleColumns[colIndex]?.name
        if (!colName) return
        if (colIndex < c0 || colIndex > c1) return
        if (!isSingleCell) td.setAttribute(CELL_SELECTION_RANGE_ATTR, "true")
        const hEdge = (colIndex === c0 ? "l" : "") + (colIndex === c1 ? "r" : "")
        td.setAttribute(CELL_SELECTION_EDGE_ATTR, vEdge + hEdge)
      })
    },
    [cellLocator, selection, visibleColumns]
  )

  // Aktif hücre sınıfını DOM'a uygula (state değişince)
  React.useEffect(() => {
    const table = bodyTableRef.current
    if (!table) return
    table
      .querySelectorAll(`td.${cellSelectionActiveClass}`)
      .forEach((el) => el.classList.remove(cellSelectionActiveClass))
    if (!activeCell) return
    // Çoklu seçimde aralık kenarı görsel ipucunu zaten veriyor; aktif hücrenin 2px
    // imleci dış kenarla çift çizgi oluşturmasın diye yalnızca tek hücre seçiminde çiz.
    const isSingleCell =
      !selection ||
      (selection.startRow === selection.endRow && selection.startCol === selection.endCol)
    if (!isSingleCell) return
    const colName = visibleColumns[activeCell.col]?.name
    if (!colName) return
    const target = table.querySelector<HTMLElement>(
      `td[data-vsp-cell="${activeCell.row}-${colName}"]`
    )
    target?.classList.add(cellSelectionActiveClass)
  }, [activeCell, visibleColumns, bodyTableRef, selection])

  return {
    activeCell,
    selection,
    startSelection,
    extendSelection,
    inSelection,
    handleBodyCellClick,
    handleBodyMouseDown,
    handleBodyKeyDown,
    clearSelection,
    applyCellLocatorAttributes,
    applyRowSelectionAttributes,
  }
}
