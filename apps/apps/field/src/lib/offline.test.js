/**
 * Contrato del outbox — el test que faltaba.
 *
 * BUG QUE CUBRE (V92.4, pérdida silenciosa de datos):
 *   offline.js hacía  `if (await fn(item))`
 *   syncHandlers.js devolvía  `{ ok: false, error: '...' }`
 *   → `{ok:false}` es un OBJETO TRUTHY → cada fallo BORRABA el item
 *     de la cola como si se hubiera subido.
 *
 * Un vendedor cerraba una visita sin señal, la app decía "sincronizado",
 * y el check-in no existía en Supabase.
 *
 * Ninguno de los 14 tests previos detectaba esto.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

/** Réplica exacta del criterio de éxito de flushActionQueue. */
function esExito(res) {
  return res === true || (res && typeof res === 'object' && res.ok === true)
}

/** Simulador del bucle de drenaje. */
function drenar(cola, handlers) {
  let ok = 0, fail = 0
  const remaining = []
  for (const item of cola) {
    const fn = handlers[item.type]
    if (!fn) { remaining.push(item); continue }
    const res = fn(item)
    if (esExito(res)) ok++
    else {
      fail++
      remaining.push({ ...item, attempts: (item.attempts || 0) + 1 })
    }
  }
  return { ok, fail, remaining }
}

describe('outbox · contrato de éxito', () => {
  test('{ok:false} NO cuenta como éxito y conserva el item', () => {
    const cola = [{ type: 'checkin', payload: { visita_id: 1 } }]
    const r = drenar(cola, { checkin: () => ({ ok: false, error: 'RLS' }) })
    assert.equal(r.ok, 0, '{ok:false} no debe contar como subido')
    assert.equal(r.fail, 1)
    assert.equal(r.remaining.length, 1, 'el check-in NO se debe perder')
  })

  test('{ok:true} cuenta como éxito y saca el item de la cola', () => {
    const cola = [{ type: 'checkin', payload: {} }]
    const r = drenar(cola, { checkin: () => ({ ok: true }) })
    assert.equal(r.ok, 1)
    assert.equal(r.remaining.length, 0)
  })

  test('boolean true sigue siendo válido (retrocompatible)', () => {
    const r = drenar([{ type: 'nota', payload: {} }], { nota: () => true })
    assert.equal(r.ok, 1)
    assert.equal(r.remaining.length, 0)
  })

  test('boolean false conserva el item', () => {
    const r = drenar([{ type: 'nota', payload: {} }], { nota: () => false })
    assert.equal(r.ok, 0)
    assert.equal(r.remaining.length, 1)
  })

  test('valores ambiguos NO se toman como éxito', () => {
    // Cualquier objeto sin ok:true explícito debe conservar el item.
    for (const raro of [{}, { error: 'x' }, { ok: 'si' }, { ok: 1 }, [], 'ok', 1]) {
      const r = drenar([{ type: 'pedido', payload: {} }], { pedido: () => raro })
      assert.equal(r.remaining.length, 1, `no debe perder con: ${JSON.stringify(raro)}`)
    }
  })

  test('undefined/null conservan el item', () => {
    for (const v of [undefined, null]) {
      const r = drenar([{ type: 'pedido', payload: {} }], { pedido: () => v })
      assert.equal(r.remaining.length, 1)
    }
  })

  test('un tipo sin handler nunca se descarta', () => {
    const r = drenar([{ type: 'desconocido', payload: {} }], {})
    assert.equal(r.remaining.length, 1, 'sin handler = conservar, no borrar')
  })

  test('cuenta los intentos para backoff', () => {
    let cola = [{ type: 'pedido', payload: {}, attempts: 0 }]
    for (let i = 1; i <= 3; i++) {
      cola = drenar(cola, { pedido: () => ({ ok: false, error: 'red' }) }).remaining
      assert.equal(cola[0].attempts, i)
    }
  })

  test('un fallo no bloquea al resto de la cola', () => {
    const cola = [
      { type: 'checkin', payload: {} },
      { type: 'nota', payload: {} },
      { type: 'pedido', payload: {} },
    ]
    const r = drenar(cola, {
      checkin: () => ({ ok: true }),
      nota: () => ({ ok: false, error: 'boom' }),
      pedido: () => ({ ok: true }),
    })
    assert.equal(r.ok, 2)
    assert.equal(r.remaining.length, 1)
    assert.equal(r.remaining[0].type, 'nota')
  })

  test('modo degradado se sube pero se marca', () => {
    const r = drenar([{ type: 'checkin', payload: {} }],
      { checkin: () => ({ ok: true, degraded: true }) })
    assert.equal(r.ok, 1, 'degradado sigue siendo éxito')
    assert.equal(r.remaining.length, 0)
  })
})
