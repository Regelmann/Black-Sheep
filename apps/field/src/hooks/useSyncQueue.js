/**
 * useSyncQueue — estados de cola offline para SyncBanner.
 *
 * IMPORTANTE: pasar `handlers` reales (los mismos que Hoy/Visita)
 * para que "Reintentar" drene de verdad la outbox.
 *
 * @param {import('../lib/sync/engine').SyncHandlers} [handlers]
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { loadActionQueue, isProbablyOffline } from '../lib/offline'
import { runSyncFlush, discardSyncQueue } from '../lib/sync/engine'

export function useSyncQueue(handlers = {}) {
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  const [items, setItems] = useState(() => loadActionQueue())
  const [status, setStatus] = useState('idle')

  const refresh = useCallback(() => {
    setItems(loadActionQueue())
  }, [])

  useEffect(() => {
    refresh()
    const onOnline = () => {
      refresh()
      // Auto-flush al recuperar red
      void (async () => {
        setStatus('syncing')
        const res = await runSyncFlush(handlersRef.current)
        setItems(loadActionQueue())
        setStatus(
          res.status === 'success'
            ? 'success'
            : res.status === 'offline'
              ? 'offline'
              : res.status === 'empty'
                ? 'idle'
                : res.status === 'partial'
                  ? 'idle'
                  : 'error',
        )
        if (res.status === 'success') {
          setTimeout(() => setStatus('idle'), 2500)
        }
      })()
    }
    const onStorage = (e) => {
      if (e.key === 'kf_action_queue_v1') refresh()
    }
    window.addEventListener('online', onOnline)
    window.addEventListener('storage', onStorage)
    const t = setInterval(refresh, 8000)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('storage', onStorage)
      clearInterval(t)
    }
  }, [refresh])

  const retry = useCallback(async () => {
    if (isProbablyOffline()) {
      setStatus('offline')
      return
    }
    setStatus('syncing')
    const res = await runSyncFlush(handlersRef.current)
    setItems(loadActionQueue())
    if (res.status === 'success') {
      setStatus('success')
      setTimeout(() => setStatus('idle'), 2500)
    } else if (res.status === 'offline') {
      setStatus('offline')
    } else if (res.status === 'empty') {
      setStatus('idle')
    } else {
      setStatus(res.pending > 0 && res.flushed > 0 ? 'idle' : 'error')
    }
  }, [])

  const discard = useCallback(() => {
    discardSyncQueue()
    setItems([])
    setStatus('idle')
  }, [])

  const offline = isProbablyOffline()
  const pendingCount = items.length
  const resolvedStatus =
    offline && pendingCount > 0
      ? 'offline'
      : status === 'idle' && pendingCount > 0
        ? 'idle'
        : status

  return {
    pendingCount,
    status: resolvedStatus,
    items,
    retry,
    discard,
    refresh,
  }
}

export default useSyncQueue
