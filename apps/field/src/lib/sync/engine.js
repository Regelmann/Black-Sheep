/**
 * Sync engine — único lugar que drena la outbox con handlers reales.
 *
 * Principio field-sales:
 *  - La UI nunca llama flushActionQueue a ciegas.
 *  - Siempre pasan los handlers del dominio (checkin, completar, nota…).
 *  - Resultado estructurado para SyncBanner / telemetría.
 */

import {
  flushActionQueue,
  loadActionQueue,
  isProbablyOffline,
  clearActionQueue,
} from '../offline.js'

/**
 * @typedef {Object} SyncHandlers
 * @property {(payload: object) => Promise<void>} [checkin]
 * @property {(payload: object) => Promise<void>} [completar]
 * @property {(payload: object) => Promise<void>} [nota]
 * @property {(payload: object) => Promise<void>} [pedido]
 * @property {(payload: object) => Promise<void>} [skip]
 */

/**
 * @param {SyncHandlers} handlers
 * @param {{ force?: boolean }} [opts]
 * @returns {Promise<{ status: 'offline'|'success'|'partial'|'empty'|'error', pending: number, flushed?: number }>}
 */
export async function runSyncFlush(handlers = {}, opts = {}) {
  // El gate por navigator.onLine evita martillar una red muerta en los flush
  // AUTOMÁTICOS (event 'online' / visibilitychange). Pero navigator.onLine
  // miente en WebView y portales cautivos: un `false` falso deja la cola
  // atascada sin que nadie pueda drenarla. El Reintentar manual pasa
  // `force:true` y salta el gate: si la red está realmente muerta cada
  // handler devuelve {ok:false} y el item entra en backoff — no se pierde,
  // sólo no se confirma.
  if (!opts.force && isProbablyOffline()) {
    return { status: 'offline', pending: loadActionQueue().length }
  }

  const before = loadActionQueue().length
  if (before === 0) {
    return { status: 'empty', pending: 0 }
  }

  try {
    await flushActionQueue(handlers)
    const pending = loadActionQueue().length
    const flushed = Math.max(0, before - pending)
    if (pending === 0) return { status: 'success', pending: 0, flushed }
    if (flushed > 0) return { status: 'partial', pending, flushed }
    return { status: 'error', pending, flushed: 0 }
  } catch {
    return { status: 'error', pending: loadActionQueue().length }
  }
}

export function discardSyncQueue() {
  clearActionQueue()
}

export function peekSyncQueue() {
  return loadActionQueue()
}
