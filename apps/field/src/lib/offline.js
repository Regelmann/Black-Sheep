/**
 * Offline de cartera del día + cola de acciones de terreno.
 * Snapshot post-carga + cola FIFO que se drena al volver online.
 * + registro local de resultados del día (visitado / pedido / no_venta).
 */

const KEY = 'kf_offline_v1'
export const QUEUE_KEY = 'kf_action_queue_v1'
const HOY_KEY = 'kf_hoy_resultados_v1'

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
      const res = await fn(item)
      // CONTRATO: un handler puede devolver boolean o { ok, error }.
      // Antes se evaluaba `if (res)` y `{ ok:false }` es un OBJETO TRUTHY:
      // cada fallo BORRABA el item de la cola como si se hubiera subido.
      // Eso perdia check-ins y pedidos en silencio.
      const success =
        res === true ||
        (res && typeof res === 'object' && res.ok === true)
      if (success) {
        ok++
        if (res && res.degraded) {
          console.warn('[outbox] item subido en modo degradado', item.type)
        }
      } else {
        fail++
        item.lastError = (res && res.error) || 'handler devolvio falso'
        item.attempts = (item.attempts || 0) + 1
        remaining.push(item)
      }
    } catch (e) {
      fail++
      item.lastError = String(e?.message || e)
      item.attempts = (item.attempts || 0) + 1
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

/** Resultados del día por cliente_key — sobrevive offline */
function hoyBucketKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function loadHoyResultados() {
  try {
    const all = safeParse(localStorage.getItem(HOY_KEY)) || {}
    const bucket = all[hoyBucketKey()] || {}
    return bucket
  } catch {
    return {}
  }
}

/**
 * @param {string} clienteKey
 * @param {'visitado'|'pedido'|'no_venta'|'checkin'} resultado
 * @param {object} [extra]
 */
export function markHoyResultado(clienteKey, resultado, extra = {}) {
  if (!clienteKey) return
  try {
    const all = safeParse(localStorage.getItem(HOY_KEY)) || {}
    const day = hoyBucketKey()
    const bucket = all[day] || {}
    const prev = bucket[clienteKey] || {}
    // pedido gana sobre visitado; no_venta también es cierre
    const rank = { checkin: 1, visitado: 2, no_venta: 3, pedido: 4 }
    const nextRank = rank[resultado] || 1
    const prevRank = rank[prev.resultado] || 0
    if (nextRank >= prevRank) {
      bucket[clienteKey] = {
        ...prev,
        ...extra,
        resultado,
        at: new Date().toISOString(),
      }
    }
    all[day] = bucket
    // limpiar días viejos (dejar solo hoy + ayer)
    const keys = Object.keys(all).sort()
    while (keys.length > 3) {
      delete all[keys.shift()]
    }
    localStorage.setItem(HOY_KEY, JSON.stringify(all))
  } catch {
    /* quota */
  }
}

export function getHoyResultado(clienteKey) {
  if (!clienteKey) return null
  return loadHoyResultados()[clienteKey] || null
}
