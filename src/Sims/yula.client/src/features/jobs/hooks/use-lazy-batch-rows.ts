import * as React from "react"

export type LazyBatchChunk<Columns, Row> = {
  columns: Columns[]
  rows: Row[]
  totalRows: number | null
}

export type UseLazyBatchRowsOptions<Columns, Row> = {
  /** Tamamlanmış job'ın Arrow URL'si; `null` iken akış başlatılmaz. */
  jobUrl: string | null
  /** Raporun Arrow akışını üreten jeneratör (ör. `streamStockBalanceRows`). */
  streamRows: (
    jobUrl: string,
    signal: AbortSignal
  ) => AsyncGenerator<LazyBatchChunk<Columns, Row>, void, void>
  signal?: AbortSignal
  /** İlk yüklemede çekilecek chunk (batch) sayısı. */
  initialChunks?: number
  onError?: (message: string) => void
}

/**
 * Tamamlanmış job'ın Arrow akışını C#'taki `async foreach` gibi **lazy** tüketir:
 * yalnızca `loadMore()` çağrıldıkça (grid scroll'a yaklaştıkça) sonraki batch çekilir.
 * Server değişmez; tek GET canlı kalır, tüketilen satırlar state'te birikir.
 * Rapor-agnostiktir: akış fonksiyonu `streamRows` ile enjekte edilir.
 */
export function useLazyBatchRows<Columns, Row>({
  jobUrl,
  streamRows,
  signal,
  initialChunks = 1,
  onError,
}: UseLazyBatchRowsOptions<Columns, Row>) {
  const [columns, setColumns] = React.useState<Columns[]>([])
  const [rows, setRows] = React.useState<Row[]>([])
  const [totalRows, setTotalRows] = React.useState<number | null>(null)
  const [loadingMore, setLoadingMore] = React.useState(false)
  const [hasMore, setHasMore] = React.useState(false)
  const [started, setStarted] = React.useState(false)

  // jobUrl değişince akış durumunu başa al — render sırasında state ayarlama.
  // (consume/loadMore zaten `await` sonrası setState yapar; effect yalnızca
  // iterator ömrünü yönetir.)
  const [syncedJobUrl, setSyncedJobUrl] = React.useState<string | null>(jobUrl)
  if (syncedJobUrl !== jobUrl) {
    setSyncedJobUrl(jobUrl)
    setColumns([])
    setRows([])
    setTotalRows(null)
    setLoadingMore(false)
    setHasMore(false)
    setStarted(false)
  }

  const iteratorRef = React.useRef<AsyncGenerator<
    LazyBatchChunk<Columns, Row>,
    void,
    void
  > | null>(null)
  const busyRef = React.useRef(false)
  const doneRef = React.useRef(true)
  const tokenRef = React.useRef<{ cancelled: boolean }>({ cancelled: true })
  const onErrorRef = React.useRef(onError)
  React.useEffect(() => {
    onErrorRef.current = onError
  })

  const consume = React.useCallback(
    async (token: { cancelled: boolean }) => {
      const iterator = iteratorRef.current
      if (!iterator || busyRef.current) return
      busyRef.current = true
      setLoadingMore(true)
      try {
        const result = await iterator.next()
        if (token.cancelled) return
        if (result.done) {
          doneRef.current = true
        } else {
          const chunk = result.value
          setColumns((prev) => (prev.length > 0 ? prev : chunk.columns))
          setRows((prev) => [...prev, ...chunk.rows])
          setTotalRows(chunk.totalRows)
        }
      } catch (err) {
        doneRef.current = true
        if (!token.cancelled && !signal?.aborted) {
          onErrorRef.current?.(
            err instanceof Error ? err.message : "Akış yüklenemedi"
          )
        }
      } finally {
        busyRef.current = false
        if (!token.cancelled) {
          setLoadingMore(false)
          setHasMore(!doneRef.current)
        }
      }
    },
    [signal]
  )

  React.useEffect(() => {
    const token = { cancelled: true }
    tokenRef.current = token
    iteratorRef.current = null
    doneRef.current = true
    busyRef.current = false

    if (!jobUrl) return

    const fallbackAbort = new AbortController()
    const iterator = streamRows(jobUrl, signal ?? fallbackAbort.signal)
    iteratorRef.current = iterator
    doneRef.current = false
    token.cancelled = false

    const run = async () => {
      for (let i = 0; i < initialChunks && !token.cancelled; i++) {
        await consume(token)
      }
      if (!token.cancelled) setStarted(true)
    }
    void run()

    return () => {
      token.cancelled = true
      if (!signal) fallbackAbort.abort()
    }
  }, [jobUrl, signal, initialChunks, consume, streamRows])

  const loadMore = React.useCallback(async () => {
    const token = tokenRef.current
    if (token.cancelled || doneRef.current || busyRef.current) return
    await consume(token)
  }, [consume])

  return { columns, rows, totalRows, loadingMore, hasMore, started, loadMore }
}
