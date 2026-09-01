/**
 * snapshotDb — persistencia durable del snapshot de cartera.
 *
 * POR QUÉ NO ALCANZA localStorage
 * La cartera de un vendedor con `sku_detalle` puede acercarse a los 5 MB.
 * localStorage es SÍNCRONO (bloquea el hilo al guardar), lo purga el
 * navegador bajo presión de disco y guarda strings. IndexedDB es
 * asíncrono, transaccional y con cuota de cientos de MB.
 *
 * ESTRATEGIA: ESCRITURA DOBLE, LECTURA SÍNCRONA
 * La UI llama `loadOfflineSnapshot()` de forma síncrona. Este módulo
 * mantiene un espejo en memoria:
 *   · Lecturas  → espejo, síncronas (API intacta).
 *   · Escrituras → espejo + IndexedDB (durable) + localStorage (respaldo).
 *
 * Si IndexedDB no existe o falla, la app degrada a localStorage y no se
 * cae.
 */

const DB_NAME = 'blacksheep-field-snapshots'
const DB_VERSION = 1
const STORE = 'snapshots'
export const SNAPSHOT_LEGACY_KEY = 'kf_offline_v1'

/** @type {IDBDatabase | null} */
let db = null

/** @type {boolean | null} */
let disponible = null // null = sin evaluar, false = no usable

/** @type {any} */
let current = null

let hidratado = false
/** @type {Promise<{durable:boolean, migrados:number}> | null} */
let initPromise = null

let cadena = Promise.resolve()

/**
 * @param {() => Promise<unknown>} fn
 * @returns {Promise<unknown>}
 */
function encolarEscritura(fn) {
  cadena = cadena.then(() => fn()).then(() => undefined).catch(() => undefined)
  return cadena
}

export function escriturasSnapshotPendientes() {
  return cadena
}

function hayIndexedDB() {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null
  } catch {
    return false
  }
}

function leerLocalStorage() {
  try {
    const raw = localStorage.getItem(SNAPSHOT_LEGACY_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

/** @param {any} payload */
function escribirLocalStorage(payload) {
  try {
    localStorage.setItem(SNAPSHOT_LEGACY_KEY, JSON.stringify(payload))
    return true
  } catch {
    return false
  }
}

function abrir() {
  if (db) return Promise.resolve(db)
  if (!hayIndexedDB()) return Promise.resolve(null)

  return new Promise(resolve => {
    let req
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION)
    } catch {
      resolve(null)
      return
    }

    req.onupgradeneeded = () => {
      const d = req.result
      if (!d.objectStoreNames.contains(STORE)) {
        d.createObjectStore(STORE, { keyPath: 'snapKey' })
      }
    }
    req.onsuccess = () => {
      const conexion = req.result
      db = conexion
      conexion.onversionchange = () => {
        try { conexion.close() } catch { /* ya cerrada */ }
        db = null
      }
      resolve(conexion)
    }
    req.onerror = () => resolve(null)
    req.onblocked = () => resolve(null)
  })
}

/**
 * @param {IDBTransactionMode} modo
 * @param {(store: IDBObjectStore) => unknown} fn
 * @returns {Promise<unknown>}
 */
function tx(modo, fn) {
  return abrir().then(
    d => new Promise(resolve => {
      if (!d) {
        resolve(null)
        return
      }
      let t
      try {
        t = d.transaction(STORE, modo)
      } catch {
        resolve(null)
        return
      }
      const store = t.objectStore(STORE)
      let resultado = null
      try {
        resultado = fn(store)
      } catch {
        resolve(null)
        return
      }
      t.oncomplete = () => resolve(resultado ?? true)
      t.onerror = () => resolve(null)
      t.onabort = () => resolve(null)
    })
  )
}

/** @param {any} payload */
function put(payload) {
  const rec = {
    snapKey: payload?.snapKey || payload?.tipo || 'default',
    payload,
    savedAt: payload?.savedAt || payload?.updatedAt || new Date().toISOString(),
  }
  return tx('readwrite', store => store.put(rec))
}

/**
 * Hidrata el espejo desde IndexedDB y migra lo que hubiera en
 * localStorage. Idempotente.
 */
async function migrar() {
  const legado = leerLocalStorage()
  current = legado || current
  const d = await abrir()

  if (!d) {
    disponible = false
    if (legado) console.warn('[snapshot] IndexedDB no disponible — localStorage (menos durable)')
    return { durable: false, migrados: 0 }
  }

  disponible = true
  const guardados = await tx('readonly', store => {
    const req = store.getAll()
    return new Promise(res => {
      req.onsuccess = () => res(req.result || [])
      req.onerror = () => res([])
    })
  })
  const desdeDb = Array.isArray(guardados) ? guardados : []

  let migrados = 0
  if (desdeDb.length) {
    // Último snapshot ganador.
    const ultimo = desdeDb[desdeDb.length - 1]
    current = ultimo?.payload || current
  } else if (current) {
    await put(current)
    migrados = 1
  }

  escribirLocalStorage(current)
  try {
    if (navigator?.storage?.persist && !(await navigator.storage.persisted())) {
      await navigator.storage.persist()
    }
  } catch {
    /* API no disponible */
  }
  return { durable: true, migrados }
}

/**
 * Hidrata el espejo desde IndexedDB y migra lo que hubiera en
 * localStorage. Idempotente.
 */
export function initSnapshotStorage() {
  if (hidratado) return Promise.resolve({ durable: disponible === true, migrados: 0 })
  hidratado = true
  if (!initPromise) initPromise = migrar()
  return initPromise
}

/** Espera a que la primer inicialización termine (tests / cierre). */
export function initSnapshotReady() {
  return initPromise || Promise.resolve(null)
}

/** Lectura síncrona: mantiene la API que ya usa Cartera. */
export function loadSnapshot() {
  if (!hidratado) {
    current = leerLocalStorage() || current
    // La migración se dispara en segundo plano; la UI lee al instante.
    initSnapshotStorage().catch(() => {})
  }
  return current
}

/** Escritura durable en segundo plano; la API sigue siendo síncrona. */
/** @param {any} payload */
export function saveSnapshot(payload) {
  current = payload || null
  escribirLocalStorage(current)
  if (disponible !== false) {
    encolarEscritura(() => put(current))
  }
  return true
}

/** Diagnóstico para la UI y los tests. */
export function estadoSnapshotStorage() {
  return {
    durable: disponible === true,
    motor: disponible === true ? 'IndexedDB' : 'localStorage',
    hidratado,
    hasSnapshot: !!current,
  }
}

/** Cierra la conexión de forma ordenada. */
export function cerrarSnapshotStorage() {
  try {
    db?.close()
  } catch {
    /* ya cerrada */
  }
  db = null
}

/** Sólo para tests: reinicia el módulo entre casos. */
export async function _resetSnapshotParaTests() {
  cerrarSnapshotStorage()
  disponible = null
  current = null
  hidratado = false
  initPromise = null
  cadena = Promise.resolve()
}
