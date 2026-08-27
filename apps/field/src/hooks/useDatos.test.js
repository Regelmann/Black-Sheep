import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { ErrorDeDatos } from './useDatos.js'
import { valeLaPenaReintentar } from '../lib/queryClient.js'
import { safeSelect } from '../lib/query.js'

/**
 * El riesgo que cubre esta suite: `safeSelect` nunca lanza, y TanStack sólo
 * considera fallida una consulta que lanza. Si el puente entre ambos se
 * rompe, TODA consulta fallida se guarda en caché como éxito durante 24 h y
 * el vendedor ve una tabla vacía en vez de un aviso.
 */

/** Reproduce la queryFn de useDatos sin necesitar React. */
async function correrQueryFn(builder, label = 'test') {
  const r = await safeSelect(builder, { label })
  if (!r.ok) throw new ErrorDeDatos(r.error || {}, label)
  return r.rows
}

describe('puente safeSelect → TanStack', () => {
  test('una consulta OK devuelve las filas', async () => {
    const rows = await correrQueryFn(Promise.resolve({ data: [{ id: 1 }], error: null }))
    assert.deepEqual(rows, [{ id: 1 }])
  })

  test('🔴 una consulta fallida LANZA, no devuelve vacío', async () => {
    // Si esto dejara de lanzar, el fallo se cachearía como éxito.
    await assert.rejects(
      () => correrQueryFn(Promise.resolve({ data: null, error: { code: '42703' } })),
      ErrorDeDatos
    )
  })

  test('un resultado vacío NO es un error', async () => {
    const rows = await correrQueryFn(Promise.resolve({ data: [], error: null }))
    assert.deepEqual(rows, [], 'cero filas es un resultado válido')
  })

  test('el builder que revienta también lanza ErrorDeDatos', async () => {
    await assert.rejects(() => correrQueryFn(Promise.reject(new Error('sin red'))), ErrorDeDatos)
  })
})

describe('el error preserva lo que cada capa necesita', () => {
  test('conserva el code para que la política pueda decidir', async () => {
    // Sin el code, un error de esquema se reintentaría como si fuera red.
    const e = await correrQueryFn(
      Promise.resolve({ data: null, error: { code: '42703', message: 'column x' } })
    ).catch(x => x)

    assert.equal(e.code, '42703')
    assert.equal(valeLaPenaReintentar(e), false, 'un 42703 no debe reintentarse')
  })

  test('un error de red sí se reintenta', async () => {
    const e = await correrQueryFn(Promise.reject(new Error('Failed to fetch'))).catch(x => x)
    assert.equal(valeLaPenaReintentar(e), true)
  })

  test('trae un texto en castellano para el vendedor', async () => {
    const e = await correrQueryFn(
      Promise.resolve({ data: null, error: { code: '42703', message: 'column x' } })
    ).catch(x => x)

    assert.ok(e.user && typeof e.user === 'string')
    assert.ok(!/column x/i.test(e.user), 'no puede filtrar jerga de PostgREST a la UI')
  })

  test('sobrevive a un error vacío sin romperse', async () => {
    // Regresión: explainError devolvía null y quien lo usaba hacía info.dev.
    const e = await correrQueryFn(Promise.reject(null)).catch(x => x)
    assert.ok(e instanceof ErrorDeDatos)
    assert.ok(e.user)
  })
})