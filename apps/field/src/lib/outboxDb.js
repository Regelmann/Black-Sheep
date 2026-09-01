/**
 * outboxDb — persistencia durable de la cola de terreno.
 *
 * POR QUÉ NO ALCANZA localStorage
 * La cola guarda el trabajo de un día entero de un vendedor: check-ins,
 * pedidos y notas tomados sin señal. localStorage tiene cuatro problemas
 * serios para ese uso:
 *
 *   1. Es SÍNCRONO: cada escritura bloquea el hilo de UI. Con 50 pedidos en
 *      cola, serializar el arreglo completo en cada `enqueue` se siente.
 *   2. Tope de ~5 MB por origen, compartido con el snapshot de cartera.
 *   3. El navegador lo PURGA bajo presión de disco. En un teléfono de
 *      trabajo con la memoria llena, el día se puede evaporar.
 *   4. Guarda strings: se parsea y re-serializa la cola entera en cada
 *      operación, O(n) donde debería ser O(1).
 *
 * IndexedDB no tiene ninguno de los cuatro: es asíncrono, transaccional,
 * con cuota de cientos de MB, y con `navigator.storage.persist()` se puede
 * pedir que el navegador NO lo purgue.
 *
 * ESTRATEGIA: ESCRITURA DOBLE, LECTURA SÍNCRONA
 * Seis módulos consumen la cola con una API síncrona (`loadActionQueue()`
 * devuelve un arreglo, no una promesa). Convertirlos a async de golpe sería
 * un refactor grande y arriesgado sobre el código más crítico del producto.
 *
 * En cambio, este módulo mantiene un espejo en memoria que se hidrata al
 * arrancar y se escribe a IndexedDB en segundo plano:
 *
 *   · Lecturas  → del espejo en memoria, síncronas (API intacta).
 *   · Escrituras → al espejo + IndexedDB (durable) + localStorage (respaldo).
 *
 * Si IndexedDB no existe o falla, todo sigue funcionando contra
 * localStorage: la app degrada, no se cae.
 */

const DB_NAME = 'blacksheep-field'
const DB_VERSION = 1
const STORE = 'outbox'
export const LEGACY_KEY = 'kf_action_queue_v1'

/**
 * Item persistido en la cola offline.
 *
 * El outbox acepta payloads heterogéneos según el tipo de operación
 * (check-in, pedido, nota, etc.), por lo que los campos adicionales son
 * intencionalmente abiertos.
 *
 * @typedef {{
 *   id?: string,
 *   client_op_id?: string,
 *   enqueuedAt?: string,
 *   type?: string,
 *   [key: string]: unknown
 * }} OutboxItem
 */

/** @type {IDBDatabase | null} */
let db = null

/** @type {boolean | null} */
let disponible = null // null = sin evaluar, false = no usable

/** @type {OutboxItem[]} */
let espejo = []

let hidratado = false
let cerrado = false // tras cerrarOutbox() no se vuelve a abrir sola

/** @type {Set<(items: OutboxItem[]) => void>} */
const suscriptores = new Set()

/**
 * Cadena de escrituras en vuelo.
 *
 * Las escrituras a IndexedDB no se esperan (la UI no debe bloquearse por el
 * disco), pero eso abre una ventana: si la app muere justo después de un
 * enqueue, la transacción puede no haber confirmado.
 *
 * Encadenarlas acá permite que quien necesite garantía —un test, o el
 * cierre de la app— haga `await escriturasPendientes()`. Serializarlas
 * además evita que dos `clear()+put()` simultáneos se pisen.
 */
let cadena = Promise.resolve()

/**
 * @param {() => Promise<unknown>} fn
 * @returns {Promise<void>}
 */
function encolarEscritura(fn) {
  cadena = cadena.then(() => fn()).then(() => undefined).catch(() => undefined)
  return cadena
}

/**
 * Resuelve cuando todas las escrituras pendientes confirmaron.
 * Útil antes de cerrar la app o para tests deterministas.
 */
export function escriturasPendientes() {
  return cadena
}

/* ── utilidades ───────────────────────────────────────────────────────── */

function hayIndexedDB() {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null
  } catch {
    return false
  }
}

function leerLocalStorage() {
  try {
    const raw = localStorage.getItem(LEGACY_KEY)
    const q = raw ? JSON.parse(raw) : []
    return Array.isArray(q) ? q : []
  } catch {
    return []
  }
}

/** @param {OutboxItem[]} items */
function escribirLocalStorage(items) {
  // Respaldo secundario: si IndexedDB falla o el navegador no lo soporta,
  // la cola sigue sobreviviendo a un cierre de app.
  try {
    localStorage.setItem(LEGACY_KEY, JSON.stringify(items))
    return true
  } catch {
    // QuotaExceededError: IndexedDB es la fuente durable de todos modos.
    return false
  }
}

function notificar() {
  for (const fn of suscriptores) {
    try {
      fn(espejo)
    } catch {
      /* un suscriptor roto no puede frenar a los demás */
    }
  }
}

/** Suscribe a cambios de la cola. Devuelve la función para desuscribirse. */
/**
 * @param {(items: OutboxItem[]) => void} fn
 * @returns {() => boolean}
 */
export function onOutboxChange(fn) {
  suscriptores.add(fn)
  return () => suscriptores.delete(fn)
}

/* ── conexión ─────────────────────────────────────────────────────────── */

function abrir() {
  if (db) return Promise.resolve(db)
  // Sin esto, una escritura en vuelo reabre la conexión justo después de
  // cerrarla y deja bloqueado cualquier deleteDatabase/upgrade posterior.
  if (cerrado) return Promise.resolve(null)
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
        // keyPath 'id' = el client_op_id, que ya es único e idempotente.
        const store = d.createObjectStore(STORE, { keyPath: 'id' })
        store.createIndex('enqueuedAt', 'enqueuedAt')
      }
    }
    req.onsuccess = () => {
      const conexion = req.result
      db = conexion
      // Si otra pestaña pide una versión nueva, hay que soltar la conexión.
      conexion.onversionchange = () => {
        try {
          conexion.close()
        } catch {
          /* ya cerrada */
        }
        db = null
      }
      resolve(conexion)
    }
    req.onerror = () => resolve(null)
    // Modo privado de Safari: open() se queda colgado sin error.
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
    d =>
      new Promise(resolve => {
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

/* ── arranque ─────────────────────────────────────────────────────────── */

/**
 * Hidrata el espejo desde IndexedDB y migra lo que hubiera en localStorage.
 * Idempotente: llamarla varias veces no duplica items.
 *
 * @returns {Promise<{ durable: boolean, items: number, migrados: number, rescatados: number }>}
 */
export async function initOutbox() {
  if (hidratado) return { durable: !!disponible, items: espejo.length, migrados: 0, rescatados: 0 }
  hidratado = true
  cerrado = false

  const legado = leerLocalStorage()
  const d = await abrir()

  if (!d) {
    // Sin IndexedDB: modo degradado sobre localStorage. La app funciona.
    disponible = false
    espejo = legado
    console.warn('[outbox] IndexedDB no disponible — se usa localStorage (menos durable)')
    notificar()
    return { durable: false, items: espejo.length, migrados: 0, rescatados: 0 }
  }

  disponible = true

  const guardados = await tx('readonly', store => {
    const req = store.getAll()
    return new Promise(res => {
      req.onsuccess = () => res(req.result || [])
      req.onerror = () => res([])
    })
  })

  /** @type {OutboxItem[]} */
  const desdeDb = Array.isArray(guardados) ? guardados : []


  // MIGRACIÓN: los items que quedaron en localStorage de la versión anterior
  // se copian a IndexedDB. Se deduplica por id para que reabrir la app no
  // multiplique la cola.
  const porId = new Map()
  for (const it of desdeDb) if (it?.id) porId.set(it.id, it)

  let migrados = 0
  let rescatados = 0
  for (const it of legado) {
    if (!it || typeof it !== 'object') continue      // basura real: no es un item

    // Un item SIN id no se puede descartar en silencio: es trabajo de
    // terreno —un check-in, un pedido— que el vendedor ya dio por hecho.
    // El object store usa keyPath 'id', así que sin esa propiedad ni
    // siquiera se puede guardar. Se le asigna uno y se reporta.
    let item = it
    if (!item.id) {
      const nuevo = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : `rescatado_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      item = { ...item, id: nuevo, client_op_id: item.client_op_id || nuevo, rescatado: true }
      rescatados++
      console.warn('[outbox] item sin id rescatado en la migración:', item.type)
    }

    if (!porId.has(item.id)) {
      porId.set(item.id, item)
      migrados++
    }
  }
  if (rescatados) console.warn(`[outbox] ${rescatados} item(s) rescatados sin id`)

  espejo = [...porId.values()].sort((a, b) =>
    String(a.enqueuedAt || '').localeCompare(String(b.enqueuedAt || ''))
  )

  if (migrados > 0) {
    await tx('readwrite', store => {
      for (const it of espejo) store.put(it)
    })
    console.info(`[outbox] ${migrados} acción(es) migradas de localStorage a IndexedDB`)
  }

  // Mantener el respaldo alineado con la fuente durable.
  escribirLocalStorage(espejo)

  // Pedirle al navegador que NO purgue estos datos bajo presión de disco.
  // Sin esto, IndexedDB es "best-effort" y se puede borrar igual.
  try {
    if (navigator?.storage?.persist && !(await navigator.storage.persisted())) {
      const ok = await navigator.storage.persist()
      console.info(`[outbox] almacenamiento persistente: ${ok ? 'concedido' : 'denegado'}`)
    }
  } catch {
    /* la API no está en todos los navegadores */
  }

  notificar()
  return { durable: true, items: espejo.length, migrados, rescatados }
}

/* ── API síncrona (espejo en memoria) ─────────────────────────────────── */

/** Lectura síncrona: mantiene intacta la API que ya usan 6 módulos. */
export function leerCola() {
  if (!hidratado) {
    // Antes de initOutbox() se lee de localStorage para no devolver [] y
    // hacer creer a la UI que no hay nada pendiente.
    espejo = leerLocalStorage()
  }
  return espejo
}

/** Reemplaza la cola completa (usado por el flush al terminar). */
/**
 * @param {OutboxItem[]} items
 * @returns {OutboxItem[]}
 */
export function escribirCola(items) {
  espejo = Array.isArray(items) ? items : []
  escribirLocalStorage(espejo)

  // IndexedDB se sincroniza en segundo plano: la UI no espera al disco.
  if (disponible !== false) {
    const snapshot = espejo
    encolarEscritura(() =>
      tx('readwrite', store => {
        store.clear()
        for (const it of snapshot) store.put(it)
      })
    )
  }
  notificar()
  return espejo
}

/** Agrega un item. */
/**
 * @param {OutboxItem} item
 * @returns {OutboxItem}
 */
export function agregarItem(item) {
  espejo = [...espejo, item]
  escribirLocalStorage(espejo)
  if (disponible !== false) {
    encolarEscritura(() => tx('readwrite', store => store.put(item)))
  }
  notificar()
  return item
}

/** Quita un item por id. */
/**
 * @param {string} id
 * @returns {OutboxItem[]}
 */
export function quitarItem(id) {
  espejo = espejo.filter(x => x.id !== id)
  escribirLocalStorage(espejo)
  if (disponible !== false) {
    encolarEscritura(() => tx('readwrite', store => store.delete(id)))
  }
  notificar()
  return espejo
}

/** Vacía la cola. Destructivo: sólo desde una acción explícita del usuario. */
export function vaciarCola() {
  espejo = []
  escribirLocalStorage([])
  if (disponible !== false) {
    encolarEscritura(() => tx('readwrite', store => store.clear()))
  }
  notificar()
}

/** Diagnóstico para la UI y los tests. */
export function estadoAlmacenamiento() {
  return {
    durable: disponible === true,
    motor: disponible === true ? 'IndexedDB' : 'localStorage',
    hidratado,
    items: espejo.length,
  }
}

/**
 * Cierra la conexión de forma ordenada: espera las escrituras en vuelo y
 * recién ahí suelta la base. Sin esto quedaba una conexión colgada que
 * bloqueaba cualquier upgrade posterior de esquema.
 */
export async function cerrarOutbox() {
  cerrado = true
  try {
    await cadena
  } catch {
    /* una escritura fallida no impide cerrar */
  }
  try {
    db?.close()
  } catch {
    /* ya cerrada */
  }
  db = null
}

/** Sólo para tests: reinicia el módulo entre casos. */
export async function _resetParaTests() {
  await cerrarOutbox()
  disponible = null
  espejo = []
  hidratado = false
  cerrado = false
  cadena = Promise.resolve()
  suscriptores.clear()
}