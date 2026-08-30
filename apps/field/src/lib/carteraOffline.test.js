/**
 * La cartera NUNCA queda vacía por falta de señal.
 *
 * EL BUG QUE CUBRE
 *   const { data } = await q
 *   setClientes(data || [])      // sin red → undefined → []
 *
 * El vendedor abría Clientes en la calle y veía "0 en zona · 0 con
 * venta este mes". Sus 263 clientes desaparecidos. El snapshot offline
 * SÍ se guardaba, pero sólo se leía para sacar la fecha del encabezado.
 *
 * Es el peor fallo posible en este producto: la app promete funcionar
 * sin señal y en el momento de la verdad no muestra nada.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

/** Réplica del criterio de Cartera.jsx tras el fix. */
function resolverCartera({ data, error, snapshot, offline }) {
  if (error || !data) {
    const guardados = Array.isArray(snapshot?.clientes) ? snapshot.clientes : []
    if (guardados.length) {
      return { clientes: guardados, desdeCache: true, error: null }
    }
    return {
      clientes: [],
      desdeCache: false,
      error: offline
        ? 'Sin conexión y sin copia guardada. Abrí la app una vez con señal.'
        : 'No se pudo cargar la cartera. Reintentá.',
    }
  }
  return { clientes: data, desdeCache: false, error: null }
}

const CLIENTES = [{ cliente_key: 'A' }, { cliente_key: 'B' }, { cliente_key: 'C' }]

describe('cartera · sin señal', () => {
  test('🔴 sin red usa la copia guardada, no una lista vacía', () => {
    const r = resolverCartera({
      data: undefined, error: null,
      snapshot: { clientes: CLIENTES }, offline: true,
    })
    assert.equal(r.clientes.length, 3, 'el vendedor NO puede perder su cartera')
    assert.equal(r.desdeCache, true, 'y tiene que saber que son datos guardados')
  })

  test('un error de consulta también cae a la copia', () => {
    const r = resolverCartera({
      data: null, error: { message: 'RLS' },
      snapshot: { clientes: CLIENTES }, offline: false,
    })
    assert.equal(r.clientes.length, 3)
  })

  test('sin red y sin copia: lo DICE, no finge cartera vacía', () => {
    const r = resolverCartera({ data: undefined, error: null, snapshot: null, offline: true })
    assert.equal(r.clientes.length, 0)
    assert.match(r.error, /Sin conexión/)
  })

  test('el mensaje distingue sin señal de consulta fallida', () => {
    const conRed = resolverCartera({ data: null, error: { message: 'x' }, snapshot: null, offline: false })
    assert.match(conRed.error, /No se pudo cargar/)
    assert.doesNotMatch(conRed.error, /Sin conexión/)
  })

  test('con red usa los datos frescos y NO marca caché', () => {
    const r = resolverCartera({ data: CLIENTES, error: null, snapshot: { clientes: [] }, offline: false })
    assert.equal(r.clientes.length, 3)
    assert.equal(r.desdeCache, false)
  })

  test('una lista vacía LEGÍTIMA del servidor se respeta', () => {
    // Un ejecutivo nuevo sin clientes asignados: 0 es la verdad.
    const r = resolverCartera({ data: [], error: null, snapshot: { clientes: CLIENTES }, offline: false })
    assert.equal(r.clientes.length, 0, 'no se debe pisar con caché vieja')
    assert.equal(r.error, null)
  })

  test('un snapshot corrupto no rompe la pantalla', () => {
    for (const malo of [{ clientes: 'no es lista' }, { clientes: null }, {}, null]) {
      const r = resolverCartera({ data: undefined, error: null, snapshot: malo, offline: true })
      assert.equal(r.clientes.length, 0)
      assert.ok(r.error, 'debe avisar en vez de explotar')
    }
  })
})
