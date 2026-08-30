/**
 * LA FIRMA DEL STORE — por qué la bandeja de agotados nunca aparecía.
 *
 * 🔴 EL BUG (mío, desde V9.2)
 *
 *   next.some((it, i) => it?.ts !== _items[i]?.ts || it?.type !== _items[i]?.type)
 *
 * Los items de la cola NO tienen campo `ts`. Usan `enqueuedAt`,
 * `attempts`, `agotado` y `lastError`. Así que `it?.ts` era siempre
 * `undefined` de los dos lados y esa comparación daba SIEMPRE false.
 *
 * Consecuencia: cuando un item fallaba y pasaba a `agotado` —misma
 * longitud del arreglo, mismo `type`— el store no detectaba el cambio,
 * React no re-renderizaba, y la BandejaAgotados NUNCA se mostraba.
 *
 * Es decir: la función que existe para que un pedido no se pierda en
 * silencio... fallaba en silencio.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

/** Réplica del criterio de cambio del store, tras el fix. */
const firma = (it) =>
  `${it?.id || ''}|${it?.type || ''}|${it?.attempts || 0}|${it?.agotado ? 1 : 0}|${it?.lastError || ''}`

function cambio(previo, siguiente) {
  return (
    siguiente !== previo ||
    siguiente.length !== previo.length ||
    siguiente.some((it, i) => firma(it) !== firma(previo[i]))
  )
}

const base = [{ id: 'a', type: 'checkin', attempts: 0 }]

describe('el store detecta los cambios que importan', () => {
  test('🔴 un item que pasa a AGOTADO se detecta', () => {
    // El caso que estaba roto: misma longitud, mismo type, mismo id.
    const despues = [{ id: 'a', type: 'checkin', attempts: 8, agotado: true }]
    assert.equal(cambio(base, despues), true,
      'sin esto la BandejaAgotados nunca se muestra')
  })

  test('un intento fallido más se detecta', () => {
    const despues = [{ id: 'a', type: 'checkin', attempts: 1, lastError: 'red' }]
    assert.equal(cambio(base, despues), true)
  })

  test('cambia el mensaje de error y se detecta', () => {
    const a = [{ id: 'a', type: 'checkin', attempts: 1, lastError: 'red' }]
    const b = [{ id: 'a', type: 'checkin', attempts: 1, lastError: 'RLS' }]
    assert.equal(cambio(a, b), true)
  })

  test('un item nuevo se detecta', () => {
    assert.equal(cambio(base, [...base, { id: 'b', type: 'nota' }]), true)
  })

  test('la cola se vacía y se detecta', () => {
    assert.equal(cambio(base, []), true)
  })
})

describe('no se re-renderiza de más', () => {
  test('el mismo arreglo, sin cambios, no dispara render', () => {
    assert.equal(cambio(base, base), false)
  })

  test('una copia con OTRA referencia sí dispara — y está bien', () => {
    // outboxDb reasigna el espejo en CADA escritura, así que una
    // referencia nueva significa que algo se guardó. Preferimos un
    // render de más que perdernos el paso a "agotado": ese fue
    // exactamente el bug.
    const copia = [{ id: 'a', type: 'checkin', attempts: 0 }]
    assert.equal(cambio(base, copia), true)
  })
})

describe('la comparación vieja era inútil', () => {
  test('demuestra por qué fallaba: `ts` no existe', () => {
    const viejo = (p, s) =>
      s.length !== p.length ||
      s.some((it, i) => it?.ts !== p[i]?.ts || it?.type !== p[i]?.type)

    const agotado = [{ id: 'a', type: 'checkin', attempts: 8, agotado: true }]
    assert.equal(viejo(base, agotado), false,
      'el criterio viejo NO veía el paso a agotado — ese era el bug')
    assert.equal(cambio(base, agotado), true,
      'el nuevo sí')
  })
})
