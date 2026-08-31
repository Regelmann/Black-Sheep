/**
 * Ciclo completo de la outbox — el test que el ROADMAP pedía (Fase 1.1).
 *
 * QUÉ CUBRE QUE NINGÚN OTRO TEST CUBRÍA
 * offline.test.js valida el criterio de éxito con una RÉPLICA del bucle.
 * syncHandlers.test.js valida los handlers aislados. Nadie ejercitaba el
 * recorrido real de un dato de terreno:
 *
 *   encolar sin señal → falla → sigue en cola → backoff → vuelve la red →
 *   drena → duplicado (23505) → agotado → bandeja → reintento manual
 *
 * El ROADMAP decía "probarlo con un teléfono real en un sótano". Eso sigue
 * siendo necesario una vez, pero no puede ser la ÚNICA verificación de la
 * pieza que decide si el trabajo de un día llega al servidor.
 *
 * Corre sobre fake-indexeddb: mismo motor que en el teléfono, sin navegador.
 */
import { test, describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import 'fake-indexeddb/auto'

/* ── doble de localStorage (Node no lo trae) ──────────────────────────── */
const store = new Map()
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
  clear: () => store.clear(),
}
// Node 22 ya define navigator (sólo getter): se parchean las props sueltas.
if (!('onLine' in globalThis.navigator)) {
  Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true })
}

const outboxDb = await import('./outboxDb.js')
const offline = await import('./offline.js')

const {
  enqueueAction,
  loadActionQueue,
  flushActionQueue,
  clearActionQueue,
  itemsAgotados,
  revivirItem,
  calcularEspera,
  MAX_INTENTOS,
} = offline

beforeEach(async () => {
  store.clear()
  await outboxDb._resetParaTests()
  // Base limpia entre casos.
  await new Promise(res => {
    const req = indexedDB.deleteDatabase('blacksheep-field')
    req.onsuccess = req.onerror = req.onblocked = () => res()
  })
  await outboxDb.initOutbox()
})

afterEach(async () => {
  await outboxDb._resetParaTests()
})

/* ── helpers ──────────────────────────────────────────────────────────── */

/** Handler que falla siempre, como un servidor caído. */
const fallaSiempre = () => Promise.resolve({ ok: false, error: 'sin red' })
/** Handler que responde ok. */
const exito = () => Promise.resolve({ ok: true })

/** Fuerza a que todos los items estén listos (saltea la espera del backoff). */
function adelantarBackoff() {
  const q = loadActionQueue().map(x => ({ ...x, nextAttemptAt: 0 }))
  outboxDb.escribirCola(q)
}

describe('outbox · durabilidad en IndexedDB', () => {
  test('un item encolado sobrevive al cierre de la app', async () => {
    enqueueAction({ type: 'checkin', payload: { visita_id: 'v-1' } })
    assert.equal(loadActionQueue().length, 1)

    // Simula cerrar y reabrir: se pierde la memoria, no el disco.
    await outboxDb._resetParaTests()
    const r = await outboxDb.initOutbox()

    assert.equal(r.durable, true, 'debe usar IndexedDB, no el modo degradado')
    assert.equal(loadActionQueue().length, 1, 'el check-in tiene que seguir ahí')
    assert.equal(loadActionQueue()[0].payload.visita_id, 'v-1')
  })

  test('sobrevive aunque localStorage se vacíe (purga del navegador)', async () => {
    enqueueAction({ type: 'pedido', payload: { total: 50000 } })
    // Esperar a que la escritura confirme en disco.
    await outboxDb.escriturasPendientes()

    // Esto es exactamente lo que hace el navegador bajo presión de disco.
    store.clear()

    await outboxDb._resetParaTests()
    await outboxDb.initOutbox()

    assert.equal(loadActionQueue().length, 1, 'IndexedDB debe conservar el pedido')
    assert.equal(loadActionQueue()[0].payload.total, 50000)
  })

  test('migra la cola de la versión anterior sin duplicar', async () => {
    // Estado previo: items en localStorage, IndexedDB vacío.
    await outboxDb._resetParaTests()
    store.set(
      'kf_action_queue_v1',
      JSON.stringify([
        { id: 'a', client_op_id: 'a', type: 'checkin', enqueuedAt: '2026-01-01T10:00:00Z' },
        { id: 'b', client_op_id: 'b', type: 'nota', enqueuedAt: '2026-01-01T11:00:00Z' },
      ])
    )

    const r1 = await outboxDb.initOutbox()
    assert.equal(r1.migrados, 2)
    assert.equal(loadActionQueue().length, 2)

    // Reabrir la app NO debe volver a migrar los mismos items.
    await outboxDb._resetParaTests()
    const r2 = await outboxDb.initOutbox()
    assert.equal(r2.migrados, 0, 'ya estaban en IndexedDB')
    assert.equal(loadActionQueue().length, 2, 'no se duplicaron')
  })

  test('cada item lleva su llave de idempotencia', () => {
    const it = enqueueAction({ type: 'checkin', payload: {} })
    assert.ok(it.client_op_id, 'sin client_op_id un reintento duplica el dato')
    assert.equal(it.id, it.client_op_id)
  })

  test('reutiliza el client_op_id del caller — un id nuevo duplicaría', () => {
    const it = enqueueAction({
      type: 'nota',
      payload: { texto: 'x' },
      client_op_id: 'op-fijo-1',
    })
    assert.equal(it.id, 'op-fijo-1')
    assert.equal(it.client_op_id, 'op-fijo-1')
  })
})


describe('outbox · ciclo de vida de un dato de terreno', () => {
  test('recorrido completo: sin señal → falla → vuelve la red → sube', async () => {
    enqueueAction({ type: 'checkin', payload: { visita_id: 'v-9' } })

    // 1 · Sin señal: el handler falla.
    const r1 = await flushActionQueue({ checkin: fallaSiempre })
    assert.equal(r1.ok, 0)
    assert.equal(r1.remaining, 1, 'un fallo NO puede borrar el item')
    assert.equal(loadActionQueue()[0].attempts, 1)

    // 2 · Vuelve la red.
    adelantarBackoff()
    const r2 = await flushActionQueue({ checkin: exito })
    assert.equal(r2.ok, 1)
    assert.equal(loadActionQueue().length, 0, 'la cola tiene que quedar vacía')
  })

  test('el fallo persiste en disco: reintenta tras reabrir la app', async () => {
    enqueueAction({ type: 'pedido', payload: { total: 1000 } })
    await flushActionQueue({ pedido: fallaSiempre })

    await outboxDb._resetParaTests()
    await outboxDb.initOutbox()

    const q = loadActionQueue()
    assert.equal(q.length, 1)
    assert.equal(q[0].attempts, 1, 'el contador de intentos también persiste')

    adelantarBackoff()
    const r = await flushActionQueue({ pedido: exito })
    assert.equal(r.ok, 1)
  })

  test('50 acciones en cola drenan completas', async () => {
    for (let i = 0; i < 50; i++) {
      enqueueAction({ type: 'checkin', payload: { visita_id: `v-${i}` } })
    }
    assert.equal(loadActionQueue().length, 50)

    const r = await flushActionQueue({ checkin: exito })
    assert.equal(r.ok, 50)
    assert.equal(loadActionQueue().length, 0)
  })

  test('un tipo sin handler no se pierde ni bloquea a los demás', async () => {
    enqueueAction({ type: 'desconocido', payload: {} })
    enqueueAction({ type: 'nota', payload: { texto: 'x' } })

    const r = await flushActionQueue({ nota: exito })
    assert.equal(r.ok, 1)
    assert.equal(loadActionQueue().length, 1)
    assert.equal(loadActionQueue()[0].type, 'desconocido')
  })
})

describe('outbox · backoff exponencial', () => {
  test('la espera crece y tiene tope de 30 min', () => {
    const e1 = calcularEspera(1)
    const e5 = calcularEspera(5)
    const e99 = calcularEspera(99)
    assert.ok(e5 > e1, 'debe crecer con los intentos')
    assert.ok(e99 <= 30 * 60 * 1000 * 1.25, 'con tope, para no esperar días')
  })

  test('tiene jitter: dos cálculos no dan lo mismo', () => {
    const vals = new Set(Array.from({ length: 20 }, () => calcularEspera(5)))
    assert.ok(vals.size > 1, 'sin jitter, todos los teléfonos reintentan a la vez')
  })

  test('un item en backoff se pospone, no se reintenta', async () => {
    enqueueAction({ type: 'checkin', payload: {} })
    await flushActionQueue({ checkin: fallaSiempre })

    // Sin adelantar el reloj: todavía no le toca.
    let llamadas = 0
    const r = await flushActionQueue({
      checkin: () => {
        llamadas++
        return Promise.resolve({ ok: true })
      },
    })
    assert.equal(llamadas, 0, 'no debe golpear al servidor antes de tiempo')
    assert.equal(r.pospuestos, 1)
    assert.equal(loadActionQueue().length, 1)
  })
})

describe('outbox · idempotencia y descartes', () => {
  test('duplicado (23505) se trata como éxito y sale de la cola', async () => {
    enqueueAction({ type: 'checkin', payload: {} })
    // El handler real devuelve ok:true ante 23505: el dato YA está en la base.
    const r = await flushActionQueue({
      checkin: () => Promise.resolve({ ok: true, yaExistia: true }),
    })
    assert.equal(r.ok, 1)
    assert.equal(loadActionQueue().length, 0)
  })

  test('item corrupto se descarta en vez de bloquear la cola', async () => {
    enqueueAction({ type: 'pedido', payload: {} })
    enqueueAction({ type: 'nota', payload: { texto: 'válida' } })

    const r = await flushActionQueue({
      pedido: () => Promise.resolve({ ok: false, error: 'payload vacío', descartar: true }),
      nota: exito,
    })
    assert.equal(r.ok, 1)
    assert.equal(loadActionQueue().length, 0, 'el corrupto no queda trabando la fila')
  })

  test('un handler que lanza excepción no pierde el dato', async () => {
    // Esto es exactamente lo que hacía handleCompletar con su ReferenceError.
    enqueueAction({ type: 'completar', payload: { visita_id: 'v-1' } })
    const r = await flushActionQueue({
      completar: () => {
        throw new ReferenceError('data is not defined')
      },
    })
    assert.equal(r.fail, 1)
    assert.equal(loadActionQueue().length, 1, 'el cierre de visita NO se puede perder')
    assert.match(loadActionQueue()[0].lastError, /data is not defined/)
  })
})

describe('outbox · bandeja de agotados', () => {
  test('tras MAX_INTENTOS el item se marca agotado y deja de reintentarse', async () => {
    enqueueAction({ type: 'pedido', payload: { total: 99000 } })

    for (let i = 0; i < MAX_INTENTOS; i++) {
      adelantarBackoff()
      await flushActionQueue({ pedido: fallaSiempre })
    }

    const agotados = itemsAgotados()
    assert.equal(agotados.length, 1, 'debe quedar visible para el usuario')
    assert.equal(agotados[0].payload.total, 99000, 'el dato sigue intacto: es plata real')

    // Ya agotado: no se vuelve a llamar solo.
    let llamadas = 0
    adelantarBackoff()
    await flushActionQueue({
      pedido: () => {
        llamadas++
        return Promise.resolve({ ok: true })
      },
    })
    assert.equal(llamadas, 0, 'un agotado espera decisión del usuario')
  })

  test('reintento manual revive el item y lo sube', async () => {
    enqueueAction({ type: 'pedido', payload: { total: 1 } })
    for (let i = 0; i < MAX_INTENTOS; i++) {
      adelantarBackoff()
      await flushActionQueue({ pedido: fallaSiempre })
    }
    assert.equal(itemsAgotados().length, 1)

    revivirItem(itemsAgotados()[0].id)
    assert.equal(itemsAgotados().length, 0)

    const r = await flushActionQueue({ pedido: exito })
    assert.equal(r.ok, 1)
    assert.equal(loadActionQueue().length, 0)
  })

  test('un agotado no impide que el resto de la cola drene', async () => {
    enqueueAction({ type: 'pedido', payload: { malo: true } })
    for (let i = 0; i < MAX_INTENTOS; i++) {
      adelantarBackoff()
      await flushActionQueue({ pedido: fallaSiempre })
    }

    enqueueAction({ type: 'nota', payload: { texto: 'nueva' } })
    const r = await flushActionQueue({ pedido: fallaSiempre, nota: exito })

    assert.equal(r.ok, 1, 'la nota nueva debe subir igual')
    assert.equal(loadActionQueue().length, 1)
    assert.equal(loadActionQueue()[0].agotado, true)
  })
})

describe('outbox · descarte explícito', () => {
  test('clearActionQueue vacía memoria y disco', async () => {
    enqueueAction({ type: 'checkin', payload: {} })
    enqueueAction({ type: 'nota', payload: {} })
    clearActionQueue()
    assert.equal(loadActionQueue().length, 0)

    await outboxDb._resetParaTests()
    await outboxDb.initOutbox()
    assert.equal(loadActionQueue().length, 0, 'no puede resucitar al reabrir')
  })
})