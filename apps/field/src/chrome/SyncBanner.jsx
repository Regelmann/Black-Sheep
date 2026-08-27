/**
 * SyncBanner — feedback de outbox offline.
 * Estados: idle (pendientes) | syncing | error | success | offline
 *
 * Preferir: <SyncBanner handlers={syncHandlers} />
 * para que Reintentar ejecute el motor real.
 */
import { useSyncQueue } from '../hooks/useSyncQueue.js'

export function SyncBanner({
  pendingCount: pendingProp,
  status: statusProp,
  onRetry,
  onDiscard,
  handlers,
}) {
  // Modo controlado: si el padre pasa estado, el hook NO instala efectos.
  const controlled = pendingProp != null && statusProp != null
  const queue = useSyncQueue(handlers || {}, { enabled: !controlled })
  const pendingCount = pendingProp ?? queue.pendingCount
  const status = statusProp ?? queue.status
  const retry = onRetry || queue.retry
  const discard = onDiscard || queue.discard

  if (pendingCount === 0 && (status === 'idle' || status === 'success')) {
    if (status === 'success') {
      return (
        <div className="bs-sync-banner is-success" role="status" aria-live="polite">
          <span>Sincronizado correctamente</span>
        </div>
      )
    }
    return null
  }

  const messages = {
    idle: `${pendingCount} acción${pendingCount === 1 ? '' : 'es'} pendiente${pendingCount === 1 ? '' : 's'} de sincronizar`,
    syncing: 'Sincronizando…',
    error: 'Error al sincronizar. Reintentá.',
    success: 'Sincronizado correctamente',
    offline: `${pendingCount} acción${pendingCount === 1 ? '' : 'es'} en cola · sin conexión`,
  }

  return (
    <div className={`bs-sync-banner is-${status}`} role="status" aria-live="polite">
      <span className="bs-sync-msg">{messages[status] || messages.idle}</span>
      {status !== 'syncing' && status !== 'success' && (
        <div className="bs-sync-actions">
          <button type="button" className="bs-sync-btn" onClick={retry}>
            Reintentar
          </button>
          <button type="button" className="bs-sync-btn bs-sync-btn-ghost" onClick={discard}>
            Descartar
          </button>
        </div>
      )}
    </div>
  )
}

export default SyncBanner
