import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { createSyncHandlers } from './syncHandlers.js'

function crearSupabaseFake({ red = false } = {}) {
  const filas = []
  const intentos = []
  const client = {
    from(tabla) {
      assert.equal(tabla, 'pedidos')
      return {
        insert(row) {
          intentos.push({ ...row })
          const select = async () => {
            if (red) return { data: null, error: { code: '08006', message: 'network error' } }
            if (row.client_op_id && filas.some(x => x.client_op_id === row.client_op_id)) {
              return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint pedidos_op_uidx' } }
            }
            const id = `pedido-${filas.length + 1}`
            filas.push({ ...row, id })
            return { data: [{ id }], error: null }
          }
          return { select }
        },
      }
    },
  }
  return { client, filas, intentos }
}

function itemPedido() {
  return {
    id: 'op-aceptacion-001',
    client_op_id: 'op-aceptacion-001',
    type: 'pedido',
    enqueuedAt: '2026-08-30T12:00:00.000Z',
    payload: {
      ejecutivoId: 'ejecutivo-1',
      clienteKey: 'cliente-42',
      nombreCliente: 'Cliente Demo',
      fuente: 'catalogo',
      estado: 'borrador',
      lineas: [
        { sku: 'SKU-A', cantidad: 2, precio: 1500 },
        { sku: 'SKU-B', cantidad: 1, precio: 2500 },
      ],
      nota: 'Pedido generado desde catálogo',
    },
  }
}

describe('ACEPTACIÓN V14 · Catálogo → Carrito → Pedido', () => {
  test('crea un único pedido confirmado con cliente, líneas y total', async () => {
    const db = crearSupabaseFake()
    const { handlePedido } = createSyncHandlers(db.client)
    const resultado = await handlePedido(itemPedido())
    assert.equal(resultado.ok, true)
    assert.equal(resultado.id, 'pedido-1')
    assert.equal(db.filas.length, 1)
    assert.equal(db.filas[0].cliente_key, 'cliente-42')
    assert.equal(db.filas[0].fuente, 'catalogo')
    assert.equal(db.filas[0].lineas.length, 2)
    assert.equal(db.filas[0].total_estimado, 5500)
  })

  test('repetir la misma operación es éxito idempotente y deja una sola fila', async () => {
    const db = crearSupabaseFake()
    const { handlePedido } = createSyncHandlers(db.client)
    const item = itemPedido()
    const primero = await handlePedido(item)
    const segundo = await handlePedido(item)
    assert.equal(primero.ok, true)
    assert.equal(segundo.ok, true)
    assert.equal(segundo.yaExistia, true)
    assert.equal(db.filas.length, 1)
    assert.equal(db.intentos.length, 2)
  })

  test('un fallo de red no se convierte en pedido confirmado', async () => {
    const db = crearSupabaseFake({ red: true })
    const { handlePedido } = createSyncHandlers(db.client)
    const resultado = await handlePedido(itemPedido())
    assert.equal(resultado.ok, false)
    assert.equal(db.filas.length, 0)
  })

  test('un error no relacionado con esquema no hace un segundo insert mutilado', async () => {
    let intentos = 0
    const client = {
      from() {
        return {
          insert() {
            intentos++
            return {
              select: async () => ({ data: null, error: { code: '42501', message: 'new row violates row-level security policy' } }),
            }
          },
        }
      },
    }
    const { handlePedido } = createSyncHandlers(client)
    const resultado = await handlePedido(itemPedido())
    assert.equal(resultado.ok, false)
    assert.equal(intentos, 1)
  })
})
