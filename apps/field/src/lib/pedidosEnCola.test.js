/**
 * pedidosEnCola — lo que ve el vendedor mientras su pedido no llega al
 * servidor.
 *
 * LO QUE DECIDE ESTE TEST
 * Un pedido en la cola NO es invisible ni es un éxito: es "en el
 * teléfono · falta subir", y si agotó los reintentos es "falló la
 * subida". Confundir cualquiera de los dos con "no hay pedido" es la
 * mentira que devuelve al vendedor al cuaderno.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { pedidosEnCola, etiquetaEstadoPedido } from './pedidosEnCola.js'

const pedidoEnCola = {
  id: 'op-1',
  type: 'pedido',
  enqueuedAt: '2026-09-08T14:30:00.000Z',
  attempts: 2,
  agotado: false,
  payload: {
    nombreCliente: 'Almacén Doña Rosa',
    clienteKey: 'CK-77',
    lineas: [
      { nombre: 'Arroz 1kg', cantidad: 12, precio: 1290 },
      { nombre: 'Aceite 1L', cantidad: 6, precio: 2790 },
    ],
  },
}

describe('pedidosEnCola', () => {
  test('sólo toma los items type pedido — notas y checkins no son pedidos', () => {
    const cola = [
      pedidoEnCola,
      { id: 'n1', type: 'nota', payload: { texto: 'x' } },
      { id: 'c1', type: 'checkin', payload: {} },
    ]
    const rows = pedidosEnCola(cola)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].id, 'op-1')
  })

  test('fila lista para la UI: cliente, líneas, total redondeado', () => {
    const [row] = pedidosEnCola([pedidoEnCola])
    assert.equal(row.cliente, 'Almacén Doña Rosa')
    assert.equal(row.clienteKey, 'CK-77')
    assert.equal(row.lineas.length, 2)
    // 12*1290 + 6*2790 = 15480 + 16740 = 32220
    assert.equal(row.total, 32220)
    assert.equal(row.estado, 'en_cola')
    assert.equal(row.intentos, 2)
    assert.equal(row.ultimoError, null)
  })

  test('un agotado se ve como agotado, con su último error', () => {
    const [row] = pedidosEnCola([
      { ...pedidoEnCola, id: 'op-2', agotado: true, attempts: 8, lastError: 'Failed to fetch' },
    ])
    assert.equal(row.estado, 'agotado')
    assert.equal(row.intentos, 8)
    assert.equal(row.ultimoError, 'Failed to fetch')
  })

  test('cliente sin nombre cae a clienteKey, y sin nada a "Sin nombre"', () => {
    const [a, b] = pedidosEnCola([
      { id: 'x1', type: 'pedido', payload: { clienteKey: 'CK-9', lineas: [] } },
      { id: 'x2', type: 'pedido', payload: { lineas: [] } },
    ])
    assert.equal(a.cliente, 'CK-9')
    assert.equal(b.cliente, 'Sin nombre de cliente')
  })

  test('colas rotas (null, no-array, items sin payload) no revientan', () => {
    assert.deepEqual(pedidosEnCola(null), [])
    assert.deepEqual(pedidosEnCola(undefined), [])
    assert.deepEqual(pedidosEnCola('no soy cola'), [])
    const rows = pedidosEnCola([{ id: 'x', type: 'pedido' }, null, { type: 'pedido' }])
    assert.equal(rows.length, 2)
    assert.equal(rows[0].total, 0)
    assert.deepEqual(rows[0].lineas, [])
  })

  test('líneas sin precio no suman plata falsa al total', () => {
    const [row] = pedidosEnCola([
      {
        id: 'x',
        type: 'pedido',
        payload: { lineas: [{ nombre: 'A', cantidad: 2, precio: 500 }, { nombre: 'B', cantidad: 5 }] },
      },
    ])
    assert.equal(row.total, 1000, 'sólo suma lo que tiene precio')
  })
})

describe('etiquetaEstadoPedido · nunca "guardado" si está en el teléfono', () => {
  test('en_cola dice que falta subir', () => {
    assert.match(etiquetaEstadoPedido('en_cola'), /falta subir/)
  })

  test('agotado dice que falló y por qué no sigue solo', () => {
    assert.match(etiquetaEstadoPedido('agotado'), /falló/i)
    assert.match(etiquetaEstadoPedido('agotado'), /agotados/)
  })
})
