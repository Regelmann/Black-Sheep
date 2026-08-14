/**
 * useActionQueue — thin wrapper around consistent metrics for the Action Queue UI.
 * Tracks item dismissals and analytics-friendly callbacks.
 */
import { useCallback, useMemo, useState } from 'react'
import type { ActionItem, Client, MetaRow } from '../types/domain'
import {
  buildActionQueue,
  type ParseSkuFn,
  useConsistentMetrics,
} from './useConsistentMetrics'

export interface UseActionQueueOptions {
  cartera: Client[]
  meta?: MetaRow | null
  parseSku: ParseSkuFn
  /** Max items shown (default 8) */
  limit?: number
  /** Priority floor (default 40) */
  minPriority?: number
}

export interface UseActionQueueResult {
  items: ActionItem[]
  metrics: ReturnType<typeof useConsistentMetrics>
  dismissedIds: Set<string>
  dismiss: (id: string) => void
  restore: (id: string) => void
  clearDismissed: () => void
  onItemAction: (item: ActionItem, handler: (item: ActionItem) => void) => void
}

export function useActionQueue({
  cartera,
  meta,
  parseSku,
  limit = 8,
}: UseActionQueueOptions): UseActionQueueResult {
  const metrics = useConsistentMetrics(cartera, meta, parseSku)
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => new Set())

  const items = useMemo(() => {
    const base =
      metrics.actionQueue.length > 0
        ? metrics.actionQueue
        : buildActionQueue(cartera, parseSku, limit)
    return base.filter(i => !dismissedIds.has(i.id)).slice(0, limit)
  }, [metrics.actionQueue, cartera, parseSku, limit, dismissedIds])

  const dismiss = useCallback((id: string) => {
    setDismissedIds(prev => new Set(prev).add(id))
  }, [])

  const restore = useCallback((id: string) => {
    setDismissedIds(prev => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }, [])

  const clearDismissed = useCallback(() => setDismissedIds(new Set()), [])

  const onItemAction = useCallback(
    (item: ActionItem, handler: (item: ActionItem) => void) => {
      // Hook point for analytics (time-to-action, type, priority)
      try {
        handler(item)
      } finally {
        // optional: auto-dismiss after primary action
        // dismiss(item.id)
      }
    },
    []
  )

  return {
    items,
    metrics,
    dismissedIds,
    dismiss,
    restore,
    clearDismissed,
    onItemAction,
  }
}
