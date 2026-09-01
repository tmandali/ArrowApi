export type TurnTraceStep = {
  id: string
  label: string
  subLabel?: string
  detailText?: string
  isError?: boolean
  isLive?: boolean
  toolName?: string
  input?: unknown
  output?: unknown
}

const tracesByConversation = new Map<string, TurnTraceStep[]>()
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) listener()
}

export function subscribeTurnTrace(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getTurnTrace(conversationId: string): TurnTraceStep[] {
  return tracesByConversation.get(conversationId) ?? []
}

export function clearTurnTrace(conversationId: string): void {
  tracesByConversation.set(conversationId, [])
  emit()
}

export function upsertTurnTrace(
  conversationId: string,
  step: TurnTraceStep,
): void {
  const prev = tracesByConversation.get(conversationId) ?? []
  const next = prev.filter((item) => item.id !== step.id)
  next.push(step)
  tracesByConversation.set(conversationId, next)
  emit()
}
