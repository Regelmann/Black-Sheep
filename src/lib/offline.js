/**
 * Offline de cartera del día + cola de acciones de terreno.
 * Snapshot post-carga + cola FIFO que se drena al volver online.
 */

const KEY = 'kf_offline_v1'
const QUEUE_KEY = 'kf_action_queue_v1'

function safeParse(s) {
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}

export function saveOfflineSnapshot(payload) {
  const data = {
    ...payload,
    savedAt: new Date().toISOString(),
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(data))
    return true
  } catch {
    return false
  }
}

export function loadOfflineSnapshot() {
  try {
    return safeParse(localStorage.getItem(KEY))
  } catch {
    return null
  }
}

export function isProbablyOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

export function offlineAgeMinutes(snap) {
  if (!snap?.savedAt) return null
  const t = new Date(snap.savedAt).getTime()
  if (isNaN(t)) return null
  return Math.round((Date.now() - t) / 60000)
}

/** Cola de acciones: checkin | pedido | nota | completar | no_venta */
export function enqueueAction(action) {
  const q = loadActionQueue()
  const item = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    enqueuedAt: new Date().toISOString(),
    ...action,
  }
  q.push(item)
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q))
  } catch {
    /* quota */
  }
  return item
}

export function loadActionQueue() {
  try {
    const q = safeParse(localStorage.getItem(QUEUE_KEY))
    return Array.isArray(q) ? q : []
  } catch {
    return []
  }
}

export function clearActionQueue() {
  try {
    localStorage.removeItem(QUEUE_KEY)
  } catch {
    /* */
  }
}

export function removeActionFromQueue(id) {
  const q = loadActionQueue().filter(x => x.id !== id)
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q))
  } catch {
    /* */
  }
  return q
}

/**
 * Intenta sincronizar la cola. `handlers` mapea tipo → async (item) => boolean (ok).
 * Devuelve { ok, fail, remaining }.
 */
export async function flushActionQueue(handlers = {}) {
  const q = loadActionQueue()
  if (!q.length) return { ok: 0, fail: 0, remaining: 0 }
  let ok = 0
  let fail = 0
  const remaining = []
  for (const item of q) {
    const fn = handlers[item.type]
    if (!fn) {
      remaining.push(item)
      continue
    }
    try {
      const success = await fn(item)
      if (success) ok++
      else {
        fail++
        remaining.push(item)
      }
    } catch {
      fail++
      remaining.push(item)
    }
  }
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(remaining))
  } catch {
    /* */
  }
  return { ok, fail, remaining: remaining.length }
}
