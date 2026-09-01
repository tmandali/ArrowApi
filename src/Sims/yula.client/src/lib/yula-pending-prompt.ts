let queuedPrompt: string | null = null
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) listener()
}

export function subscribeQueuedYulaPrompt(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function queueYulaPrompt(text: string): void {
  queuedPrompt = text.trim() || null
  emit()
}

export function takeQueuedYulaPrompt(): string | null {
  const next = queuedPrompt
  queuedPrompt = null
  if (next) emit()
  return next
}

export function peekQueuedYulaPrompt(): string | null {
  return queuedPrompt
}
