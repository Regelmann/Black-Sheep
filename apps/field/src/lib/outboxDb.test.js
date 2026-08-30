/**
 * outboxDb — la capa que guarda el trabajo del día antes de que llegue al
 * servidor. 380 líneas sin un solo test hasta acá.
 *
 * QUÉ SE JUEGA
 * El vendedor pasa la mañana sin señal: check-ins, pedidos, notas. Todo
 * eso vive en esta cola hasta que vuelve la red. Si este módulo pierde
 * un item, se perdió trabajo real que nadie puede reconstruir — y el
 * vendedor ni se entera hasta que el pedido no llega.
 *
 * QUÉ CUBRE ESTE ARCHIVO, que outbox.integracion.test.js no cubría
 * Ese test ejercita el ciclo de reintentos (encolar → fallar → backoff →
 * drenar) por encima de la API síncrona. Nadie probaba la persistencia
 * de abajo:
 *
 *   · la migración de localStorage a IndexedDB al actualizar la app
 *   · que el espejo en memoria y el disco no se desincronicen
 *   · el modo degradado cuando IndexedDB no existe
 *   · que los datos sobrevivan a cerrar y reabrir la app
 *
 * Corre sobre fake-indexeddb: el mismo motor que en el teléfono.
 */
import { test, describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import 'fake-indexeddb/auto'

/* ── doble de localStorage ────────────────────────────────────────────── */
const store = new Map()
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
  clear: () => store.clear(),
}

const outboxDb = await import('./outboxDb.js')
const {
  initOutbox, leerCola, escribirCola, agregarItem, quitarItem, vaciarCola,
  estadoAlmacenamiento, escriturasPendientes, onOutboxChange, cerrarOutbox,
  LEGACY_KEY, _resetParaTests,
} = outboxDb

/** Borra la base física entre casos: si no, un test contamina al siguiente. */
async function baseLimpia() {
  await new Promise(res => {
    const req = indexedDB.deleteDatabase('blacksheep-field')
    req.onsuccess = req.onerror = req.onblocked = () => res()
  })
}

const item = (id, extra = {}) => ({
  id,
  client_op_id: id,
  type: 'pedido',
  payload: { nombreCliente: 'Almacén ' + id },
  enqueuedAt: extra.enqueuedAt || new Date().toISOString(),
  ...extra,
})

beforeEach(async () => {
  store.clear()
  await _resetParaTests()
  await baseLimpia()
})

afterEach(async () => {
  await escriturasPendientes()
  await cerrarOutbox()
})

describe('migración de localStorage a IndexedDB', () => {
  test('la cola vieja se conserva al actualizar la app', async () => {
    // El vendedor tenía 3 acciones pendientes con la versión anterior,
    // que sólo usaba localStorage. Actualiza la app: no se puede perder
    // ni una.
    store.set(LEGACY_KEY, JSON.stringify([item('a'), item('b'), item('c')]))

    const r = await initOutbox()

    assert.equal(r.migrados, 3, 'las 3 acciones tienen que migrar')
    assert.equal(leerCola().length, 3)
    assert.deepEqual(leerCola().map(i => i.id).sort(), ['a', 'b', 'c'])
  })

  test('reabrir la app no multiplica la cola', async () => {
    // El respaldo en localStorage se mantiene alineado a propósito. Si la
    // migración no dedujera por id, cada arranque duplicaría todo.
    store.set(LEGACY_KEY, JSON.stringify([item('a'), item('b')]))
    await initOutbox()
    await escriturasPendientes()
    await cerrarOutbox()
    await _resetParaTests()

    const r2 = await initOutbox()

    assert.equal(leerCola().length, 2, 'la cola se duplicó al reabrir')
    assert.equal(r2.migrados, 0, 'no había nada nuevo que migrar')
  })

  test('un item sin id se rescata en vez de descartarse', async () => {
    // DEFENSA PREVENTIVA, no un bug que estuviera pasando: enqueueAction()
    // siempre asignó id, así que hoy nadie escribe items sin él. Pero el
    // filtro `if (it?.id)` los tiraba en silencio, y el object store usa
    // keyPath 'id' — un item sin esa propiedad ni siquiera se puede
    // guardar. Ante un localStorage escrito a medias o una versión futura
    // que arme el item a mano, la cola perdería trabajo de terreno sin
    // que el vendedor se entere. Se le asigna un id y se reporta.
    store.set(LEGACY_KEY, JSON.stringify([item('a'), { type: 'nota', payload: { texto: 'sin id' } }]))

    const r = await initOutbox()
    const cola = leerCola()

    assert.equal(cola.length, 2,
      'se descartó el item sin id durante la migración: es trabajo de ' +
      'terreno que desaparece sin aviso')
    assert.equal(r.rescatados, 1, 'el rescate tiene que quedar reportado')
    const rescatado = cola.find(i => i.type === 'nota')
    assert.ok(rescatado.id, 'sin id no se puede guardar: keyPath del store')
    assert.equal(rescatado.client_op_id, rescatado.id,
      'necesita client_op_id para que el reintento no lo duplique')
  })

  test('localStorage corrupto no impide arrancar', async () => {
    // JSON roto por una escritura a medias. La app tiene que arrancar
    // igual, aunque sea con la cola vacía.
    store.set(LEGACY_KEY, '{esto no es json')
    const r = await initOutbox()
    assert.equal(r.durable, true)
    assert.deepEqual(leerCola(), [])
  })
})

describe('durabilidad: los datos sobreviven al cierre', () => {
  test('lo encolado se relee tras reabrir', async () => {
    await initOutbox()
    agregarItem(item('p1'))
    agregarItem(item('p2'))
    await escriturasPendientes()
    await cerrarOutbox()

    // Simula el arranque siguiente: memoria en cero, disco intacto.
    await _resetParaTests()
    store.clear() // sin respaldo de localStorage: sale de IndexedDB o no sale
    await initOutbox()

    assert.deepEqual(leerCola().map(i => i.id).sort(), ['p1', 'p2'],
      'los pedidos no sobrevivieron al cierre de la app')
  })

  test('quitarItem borra también del disco', async () => {
    await initOutbox()
    agregarItem(item('p1'))
    agregarItem(item('p2'))
    quitarItem('p1')
    await escriturasPendientes()
    await cerrarOutbox()

    await _resetParaTests()
    store.clear()
    await initOutbox()

    assert.deepEqual(leerCola().map(i => i.id), ['p2'],
      'un item borrado reapareció al reabrir: se subiría dos veces')
  })

  test('escribirCola deja el disco igual al espejo', async () => {
    // Es lo que hace flushActionQueue al terminar: reemplaza la cola por
    // los que quedaron pendientes. Si el disco no queda igual, los ya
    // enviados vuelven a la vida.
    await initOutbox()
    agregarItem(item('a'))
    agregarItem(item('b'))
    agregarItem(item('c'))
    escribirCola([item('b')]) // a y c se subieron bien
    await escriturasPendientes()
    await cerrarOutbox()

    await _resetParaTests()
    store.clear()
    await initOutbox()

    assert.deepEqual(leerCola().map(i => i.id), ['b'],
      'quedaron items ya enviados en el disco: se reenviarían')
  })

  test('vaciarCola limpia el disco', async () => {
    await initOutbox()
    agregarItem(item('a'))
    vaciarCola()
    await escriturasPendientes()
    await cerrarOutbox()

    await _resetParaTests()
    store.clear()
    await initOutbox()
    assert.deepEqual(leerCola(), [])
  })
})

describe('lectura síncrona antes de hidratar', () => {
  test('leerCola() no miente con [] si hay pendientes en localStorage', async () => {
    // Seis módulos leen esto de forma síncrona. Si antes de initOutbox()
    // devolviera [], la UI diría "todo sincronizado" con trabajo sin subir.
    store.set(LEGACY_KEY, JSON.stringify([item('a'), item('b')]))
    assert.equal(leerCola().length, 2,
      'antes de hidratar hay que leer el respaldo, no devolver vacío')
    await initOutbox()
  })
})

describe('modo degradado sin IndexedDB', () => {
  let indexedDBReal
  beforeEach(() => { indexedDBReal = globalThis.indexedDB })
  afterEach(() => {
    Object.defineProperty(globalThis, 'indexedDB', {
      value: indexedDBReal, configurable: true, writable: true,
    })
  })

  test('sin IndexedDB la app sigue guardando en localStorage', async () => {
    Object.defineProperty(globalThis, 'indexedDB', {
      value: undefined, configurable: true, writable: true,
    })
    await _resetParaTests()

    const r = await initOutbox()
    assert.equal(r.durable, false, 'debe reportar que NO es durable')

    agregarItem(item('a'))
    assert.equal(leerCola().length, 1, 'la cola tiene que funcionar igual')

    // Y el respaldo tiene que estar escrito, que es lo único que queda.
    const crudo = JSON.parse(store.get(LEGACY_KEY) || '[]')
    assert.equal(crudo.length, 1, 'sin IndexedDB, localStorage es la única red')
  })

  test('estadoAlmacenamiento informa el modo real', async () => {
    await initOutbox()
    const e = estadoAlmacenamiento()
    assert.equal(typeof e.durable, 'boolean')
    assert.equal(e.durable, true)
  })
})

describe('avisos a la UI', () => {
  test('cada cambio notifica a los suscriptores', async () => {
    // El banner de "N pendientes" se apoya en esto. Si no notifica, el
    // contador queda pegado y el vendedor no sabe si su trabajo subió.
    await initOutbox()
    let avisos = 0
    const baja = onOutboxChange(() => { avisos++ })

    agregarItem(item('a'))
    quitarItem('a')
    escribirCola([item('b')])
    vaciarCola()

    assert.equal(avisos, 4, 'las 4 operaciones tienen que avisar')
    baja()
    agregarItem(item('c'))
    assert.equal(avisos, 4, 'tras darse de baja no debería seguir recibiendo')
  })

  test('un suscriptor que lanza no rompe a los demás', async () => {
    await initOutbox()
    let sano = 0
    onOutboxChange(() => { throw new Error('componente roto') })
    onOutboxChange(() => { sano++ })
    agregarItem(item('a'))
    assert.equal(sano, 1, 'un listener con error no puede cortar la cadena')
  })
})