/**
 * El techo de 1.000 filas de PostgREST.
 *
 * La app mostraba 917 / 462 / 1.000 prospectos con 2.389 / 3.870 / 3.627
 * en la base. El 1.000 redondo delataba la causa: PostgREST corta ahí por
 * defecto y `.limit(5000)` NO lo sube — el límite del cliente sólo puede
 * BAJAR el del servidor.
 *
 * Y no falla: 200 con menos filas. El vendedor ve una lista plausible a
 * la que le faltan dos tercios de su cartera.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { traerTodo, PAGINA, pareceTruncado } from './traerTodo.js'

/** Doble de Supabase que impone el mismo tope de 1.000 que el real. */
function servidor(totalFilas, { fallaEnPagina = -1 } = {}) {
  const todas = Array.from({ length: totalFilas }, (_, i) => ({ id: i }))
  let llamadas = 0
  const construir = (desde, hasta) => {
    const pagina = llamadas++
    if (pagina === fallaEnPagina) {
      return Promise.resolve({ data: null, error: { message: 'timeout', code: '500' } })
    }
    // El servidor NUNCA devuelve más de PAGINA, pida lo que pida el cliente.
    const tope = Math.min(hasta - desde + 1, PAGINA)
    return Promise.resolve({ data: todas.slice(desde, desde + tope), error: null })
  }
  return { construir, llamadas: () => llamadas }
}

describe('traerTodo · vence el techo del servidor', () => {
  test('3.627 filas se traen completas, no 1.000', async () => {
    const s = servidor(3627)
    const r = await traerTodo(s.construir, { label: 'test' })
    assert.equal(r.rows.length, 3627, 'faltaron filas: el vendedor pierde cartera')
    assert.equal(r.ok, true)
    assert.equal(r.truncado, false)
  })

  test('para en cuanto una página vuelve incompleta', async () => {
    const s = servidor(2389)
    const r = await traerTodo(s.construir, { label: 'test' })
    // 1000 + 1000 + 389 → 3 llamadas, ni una más.
    assert.equal(s.llamadas(), 3, 'no debe seguir pidiendo páginas vacías')
    assert.equal(r.paginas, 3)
  })

  test('un total EXACTO al tope no se confunde con el final', async () => {
    // Caso traicionero: 2.000 filas son dos páginas llenas. Sin una
    // tercera llamada no se puede saber si hay más.
    const s = servidor(2000)
    const r = await traerTodo(s.construir, { label: 'test' })
    assert.equal(r.rows.length, 2000)
    assert.equal(s.llamadas(), 3, 'hace falta una página más para confirmar el final')
  })

  test('menos de una página: una sola llamada', async () => {
    const s = servidor(42)
    const r = await traerTodo(s.construir, { label: 'test' })
    assert.equal(r.rows.length, 42)
    assert.equal(s.llamadas(), 1)
  })

  test('cero filas es un resultado válido, no un error', async () => {
    const s = servidor(0)
    const r = await traerTodo(s.construir, { label: 'test' })
    assert.equal(r.rows.length, 0)
    assert.equal(r.ok, true)
    assert.equal(r.error, null)
  })
})

describe('traerTodo · cuando algo falla', () => {
  test('si falla la PRIMERA página, no hay datos y se dice', async () => {
    const s = servidor(3000, { fallaEnPagina: 0 })
    const r = await traerTodo(s.construir, { label: 'test' })
    assert.equal(r.ok, false)
    assert.ok(r.error)
    assert.equal(r.rows.length, 0)
  })

  test('si falla una página POSTERIOR, se devuelve lo traído MARCADO', async () => {
    // Media cartera es mejor que ninguna, pero el llamador tiene que
    // saber que está incompleta: no puede mostrarla como total.
    const s = servidor(3000, { fallaEnPagina: 2 })
    const r = await traerTodo(s.construir, { label: 'test' })
    assert.equal(r.rows.length, 2000)
    assert.equal(r.truncado, true, 'sin esta marca la UI miente sobre el total')
    assert.ok(r.error)
  })

  test('un filtro roto no dispara 20 páginas infinitas', async () => {
    const s = servidor(999999)
    const r = await traerTodo(s.construir, { label: 'test', maxPaginas: 5 })
    assert.equal(s.llamadas(), 5)
    assert.equal(r.truncado, true)
  })
})

describe('pareceTruncado · detecta consultas sin migrar', () => {
  test('un conteo exacto al tope es sospechoso', () => {
    assert.equal(pareceTruncado(1000), true)
    assert.equal(pareceTruncado(500), true)
  })
  test('un conteo cualquiera no lo es', () => {
    assert.equal(pareceTruncado(3627), false)
    assert.equal(pareceTruncado(917), false)
  })
})
