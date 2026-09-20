import { useEffect, useState, useCallback, useRef } from "react"
import { skillEventHub } from "../services/skill-event-hub"
import type {
  SkillExecutionSnapshot,
  SkillHubEventDetail,
  SkillRunOptions,
} from "../types"

export function useSkillExecution(initialExecutionId?: string | null) {
  const [executionId, setExecutionId] = useState<string | null>(
    initialExecutionId || null
  )
  const [snapshot, setSnapshot] = useState<SkillExecutionSnapshot | null>(() =>
    initialExecutionId ? skillEventHub.getSnapshot(initialExecutionId) || null : null
  )
  const [logs, setLogs] = useState<string[]>(() =>
    initialExecutionId ? skillEventHub.getLogs(initialExecutionId) : []
  )

  const executionIdRef = useRef<string | null>(executionId)

  useEffect(() => {
    executionIdRef.current = executionId
  }, [executionId])

  useEffect(() => {
    if (!executionId) return

    // Subscribe to EventHub for this execution
    const handleEvent = (event: Event) => {
      const customEvent = event as CustomEvent<SkillHubEventDetail>
      const detail = customEvent.detail
      if (!detail || detail.executionId !== executionId) return

      setSnapshot({ ...detail.snapshot })
      setLogs([...detail.snapshot.logs])
    }

    const eventName = `skill:${executionId}`
    skillEventHub.addEventListener(eventName, handleEvent)

    return () => {
      skillEventHub.removeEventListener(eventName, handleEvent)
    }
  }, [executionId])

  const run = useCallback(
    (skillName: string, code: string, options?: SkillRunOptions): string => {
      const id = skillEventHub.dispatchRun(skillName, code, options)
      setExecutionId(id)
      setLogs([])
      setSnapshot(skillEventHub.getSnapshot(id) || null)
      return id
    },
    []
  )

  const abort = useCallback(() => {
    if (executionIdRef.current) {
      skillEventHub.abort(executionIdRef.current)
    }
  }, [])

  return {
    executionId,
    snapshot,
    logs,
    status: snapshot?.status || "queued",
    progress: snapshot?.progress ?? 0,
    result: snapshot?.result,
    error: snapshot?.error,
    isRunning: snapshot?.status === "running" || snapshot?.status === "queued",
    run,
    abort,
    setExecutionId,
  }
}
