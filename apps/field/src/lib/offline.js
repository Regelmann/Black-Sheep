/**
 * Offline de cartera del día + cola de acciones de terreno.
 * Snapshot post-carga + cola FIFO que se drena al volver online.
 * + registro local de resultados del día (visitado / pedido / no_venta).
 */

import { leerCola, escribirCola, agregarItem, LEGACY_KEY } from './outboxDb.js'
import { saveSnapshot, loadSnapshot, SNAPSHOT_LEGACY_KEY } from './snapshotDb.js'

export const QUEUE_KEY = LEGACY_KEY
export const SNAPSHOT_KEY = SNAPSHOT_LEGACY_KEY

/**
 * BACKOFF EXPONENCIAL CON JITTER
 *
 * Antes: 25 reintentos seguidos. Al volver la señal, 50 items disparaban
 * 50 requests simultáneos contra Supabase — justo cuando la red recién
 * se recupera y es más frágil.
 *
 * El jitter importa tanto como el backoff: sin él, TODOS los teléfonos
 * de la flota reintentan en el mismo instante y se pisan entre sí.
 *
 * Tope de 30 min: más allá, la espera deja de tener sentido y conviene
 * mandar el item a la bandeja de agotados para que decida una persona.
 */
export const MAX_INTENTOS = 8
const ESPERA_BASE = 2000
const ESPERA_TOPE = 30 * 60 * 1000

/**
 * @param {number} intentos
 * @returns {number} milisegundos de espera
 */
export function calcularEspera(intentos) {
  const n = Math.max(1, Number(intentos) || 1)
  const base = Math.min(ESPERA_TOPE, ESPERA_BASE * Math.pow(2, n - 1))
  // ±25% de jitter para desincronizar la flota
  return Math.round(base * (0.75 + Math.random() * 0.5))
}

/** ¿A este item ya le toca reintentar? */
/**
 * @param {any} item
 * @param {number} [ahora]
 * @returns {boolean}
 */
function leToca(item, ahora = Date.now()) {
  if (!item.nextAttemptAt) return true
  return ahora >= item.nextAttemptAt
}

/**
 * Items que agotaron los reintentos. NO se borran: un pedido agotado es
 * plata real. Quedan visibles para que el vendedor decida.
 */
export function itemsAgotados() {
  return leerCola().filter(i => i?.agotado)
}

/** Reintento manual: revive un item agotado. */
/**
 * @param {string} id
 * @returns {any|null}
 */
export function revivirItem(id) {
  const q = leerCola().map(i =>
    i?.id === id ? { ...i, agotado: false, attempts: 0, nextAttemptAt: 0 } : i
  )
  escribirCola(q)
  return q.find(i => i?.id === id) || null
}
const HOY_KEY = 'kf_hoy_resultados_v1'

/**
 * JSON.parse tolerante. Guarda explícita contra null/undefined: los
 * getItem() de localStorage devuelven null cuando la clave no existe,
 * y JSON.parse(null) devuelve null en vez de lanzar — un comportamiento
 * que enmascara el caso "no hay dato".
 *
 * @param {string|null|undefined} s
 * @returns {any}
 */
function safeParse(s) {
  if (s === null || s === undefined) return null
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}

/** @param {any} payload */
export function saveOfflineSnapshot(payload) {
  // IndexedDB (durable) + localStorage (respaldo), con lectura síncrona.
  return saveSnapshot({
    ...payload,
    savedAt: new Date().toISOString(),
  })
}

export function loadOfflineSnapshot() {
  return loadSnapshot()
}

export function isProbablyOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

/** @param {any} snap @returns {number|null} */
export function offlineAgeMinutes(snap) {
  if (!snap?.savedAt) return null
  const t = new Date(snap.savedAt).getTime()
  if (isNaN(t)) return null
  return Math.round((Date.now() - t) / 60000)
}

/** Cola de acciones: checkin | pedido | nota | completar | no_venta */
/**
 * ID de operación estable y único.
 *
 * POR QUÉ IMPORTA (idempotencia)
 * Si el insert LLEGA al servidor pero la respuesta se pierde en el
 * camino — túnel, señal que cae a mitad del request — el item se queda
 * en la cola, reintenta, y crea un DUPLICADO.
 *
 * Con un client_op_id estable, el reintento manda el MISMO id y la base
 * lo rechaza por índice único: el reintento es inofensivo.
 *
 * crypto.randomUUID() en vez de Date.now()+Math.random(): dos acciones
 * en el mismo milisegundo podían colisionar.
 */
function nuevoOpId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  // Respaldo para WebView viejos sin randomUUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

/**
 * @param {{type:string, payload?:any}} action
 * @returns {any}
 */
export function enqueueAction(action) {
  const opId = nuevoOpId()
  const item = {
    id: opId,
    // Viaja al servidor: es la llave de idempotencia.
    client_op_id: opId,
    enqueuedAt: new Date().toISOString(),
    attempts: 0,
    ...action,
  }
  // Escritura durable: IndexedDB + respaldo en localStorage.
  agregarItem(item)
  return item
}

export function loadActionQueue() {
  return leerCola()
}

export function clearActionQueue() {
  escribirCola([])
}

/**
 * @param {string} id
 */
export function removeActionFromQueue(id) {
  escribirCola(leerCola().filter(i => i?.id !== id))
}

/**
 * @param {Record<string, (item:any)=>Promise<any>|any>} [handlers]
 * @returns {Promise<{ok:number,fail:number,remaining:number,pospuestos:number}>}
 */
export async function flushActionQueue(handlers = {}) {
  const q = leerCola()
  if (!q.length) return { ok: 0, fail: 0, remaining: 0, pospuestos: 0 }

  let ok = 0, fail = 0, pospuestos = 0
  const remaining = []
  const ahora = Date.now()

  for (const item of q) {
    // Agotado: espera decisión de una persona, no se reintenta solo.
    if (item?.agotado) { remaining.push(item); continue }

    // Todavía en backoff: se pospone sin gastar red.
    if (!leToca(item, ahora)) { remaining.push(item); pospuestos++; continue }

    const type = item?.type
    if (!type) {
      remaining.push(item)
      continue
    }

    const fn = handlers[type]
    if (!fn) { remaining.push(item); continue }

    try {
      const res = await fn(item)
      // CONTRATO: boolean o { ok }. `{ok:false}` es un objeto TRUTHY:
      // evaluar `if (res)` borraba de la cola los items que fallaron.
      const exito = res === true || (res && typeof res === 'object' && res.ok === true)

      if (exito) {
        ok++
        if (res && res.degraded) console.warn('[outbox] subido en modo degradado', item.type)
      } else if (res && res.descartar) {
        // Item corrupto: reintentarlo mil veces no lo arregla y bloquea
        // la cola detrás suyo.
        fail++
        console.error('[outbox] descartado por corrupto:', item.type, res.error)
      } else {
        fail++
        remaining.push(marcarFallo(item, (res && res.error) || 'handler devolvió falso'))
      }
    } catch (e) {
      fail++
      remaining.push(marcarFallo(item, String(/** @type {any} */ (e)?.message || e)))
    }
  }

  escribirCola(remaining)
  return { ok, fail, remaining: remaining.length, pospuestos }
}

/** Registra el fallo, programa el próximo intento y agota si corresponde. */
/**
 * @param {any} item
 * @param {string} motivo
 * @returns {any}
 */
function marcarFallo(item, motivo) {
  const attempts = (item.attempts || 0) + 1
  const agotado = attempts >= MAX_INTENTOS
  if (agotado) {
    console.error(`[outbox] agotado tras ${attempts} intentos:`, item.type, motivo)
  }
  return {
    ...item,
    attempts,
    lastError: motivo,
    agotado,
    nextAttemptAt: agotado ? 0 : Date.now() + calcularEspera(attempts),
  }
}

/** Clave del día: los resultados de "Hoy" se guardan por fecha local. */
function hoyBucketKey() {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `kf_hoy_resultados_${d.getFullYear()}-${mm}-${dd}`
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
/** @param {string} clienteKey @param {string} resultado @param {any} [extra] */
export function markHoyResultado(clienteKey, resultado, extra = {}) {
  if (!clienteKey) return
  try {
    const all = safeParse(localStorage.getItem(HOY_KEY)) || {}
    const day = hoyBucketKey()
    const bucket = all[day] || {}
    const prev = bucket[clienteKey] || {}
    // pedido gana sobre visitado; no_venta también es cierre
    /** @type {Record<string, number>} */
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
      const k = keys.shift()
      if (k) delete all[k]
    }
    localStorage.setItem(HOY_KEY, JSON.stringify(all))
  } catch { void 0 }
}

/** @param {string} clienteKey */
export function getHoyResultado(clienteKey) {
  if (!clienteKey) return null
  return loadHoyResultados()[clienteKey] || null
}
