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
} from '../offline'

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
 * @returns {Promise<{ status: 'offline'|'success'|'partial'|'empty'|'error', pending: number, flushed?: number }>}
 */
export async function runSyncFlush(handlers = {}) {
  if (isProbablyOffline()) {
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
