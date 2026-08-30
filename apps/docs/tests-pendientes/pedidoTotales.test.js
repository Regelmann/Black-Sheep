/**
 * El total de un pedido, en los cuatro lugares donde se muestra.
 *
 * `guardarPedido` descarta las líneas sin cantidad o sin nombre antes de
 * escribir, y calcula `total_estimado` sobre lo que queda. Pero el
 * WhatsApp al cliente, el de bodega, el PDF formal y `totalPedido`
 * sumaban la lista COMPLETA.
 *
 * Efecto medido: un pedido con una línea válida de $2.580 y una línea sin
 * nombre de $50.000 se guardaba como $2.580, no listaba la segunda en
 * ningún lado — y le cobraba al cliente $52.580.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  lineasValidas,
  totalLineas,
  totalPedido,
  buildWhatsAppPedido,
  buildWhatsAppBodega,
  buildPedidoFormalHtml,
  sanitizeNombreProducto,
} from './pedido.js'

const CLIENTE = { nombre_cliente: 'Almacén Rosa', telefono: '+56 9 8123 4567' }

/** Una línea real y una fantasma: con plata, sin nombre ni sku. */
const LINEAS = [
  { nombre: 'Arroz Grado 2 1kg', cantidad: 2, precio: 1290, unidad: 'ud' },
  { nombre: '', sku: '', cantidad: 10, precio: 5000, unidad: 'ud' },
]

const soloTexto = html => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

describe('qué línea cuenta', () => {
  test('descarta las que no se envían: sin cantidad, sin nombre, negativas', () => {
    const r = lineasValidas([
      { nombre: 'Arroz', cantidad: 2, precio: 1290 },
      { nombre: '', sku: '', cantidad: 10, precio: 5000 },
      { nombre: 'Aceite', cantidad: 0, precio: 2190 },
      { nombre: 'Fideos', cantidad: -3, precio: 890 },
      { sku: 'SKU-9', cantidad: 1, precio: 500 },
    ])
    assert.deepEqual(r.map(l => l.nombre || l.sku), ['Arroz', 'SKU-9'])
  })

  test('entradas nulas no rompen', () => {
    for (const v of [null, undefined, [], [null], [undefined], [{}]]) {
      assert.deepEqual(lineasValidas(v), [], JSON.stringify(v))
      assert.equal(totalLineas(v), 0)
    }
  })

  test('una línea sin precio suma 0, no NaN', () => {
    const t = totalLineas([{ nombre: 'Arroz', cantidad: 3 }, { nombre: 'Sal', cantidad: 1, precio: 'abc' }])
    assert.equal(t, 0)
    assert.ok(Number.isFinite(t))
  })
})

describe('los cuatro totales dicen lo mismo', () => {
  const ESPERADO = 2580 // 2 × 1290; la línea sin nombre no se envía

  test('totalPedido ignora la línea que no se guarda', () => {
    assert.equal(totalPedido({ lineas: LINEAS }), ESPERADO)
  })

  test('el WhatsApp al cliente no cobra lo que no lista', () => {
    const { text } = buildWhatsAppPedido({ cliente: CLIENTE, lineas: LINEAS, ejecutivoNombre: 'Juan' })
    assert.match(text, /Total estimado: \$2\.580/)
    assert.doesNotMatch(text, /52\.580/, 'estaba cobrando la línea fantasma')
    // Una sola línea de producto listada.
    assert.equal(text.split('\n').filter(l => l.startsWith('•')).length, 1)
  })

  test('el WhatsApp a bodega coincide con lo que pide preparar', () => {
    const t = buildWhatsAppBodega({ cliente: CLIENTE, lineas: LINEAS })
    assert.match(t, /Total est\.: \$2\.580/)
    assert.doesNotMatch(t, /52\.580/)
  })

  test('el PDF formal coincide', () => {
    const html = soloTexto(buildPedidoFormalHtml({ cliente: CLIENTE, lineas: LINEAS, pedidoId: 'abc-123' }))
    assert.match(html, /Total estimado: \$2\.580/)
    assert.doesNotMatch(html, /52\.580/)
  })

  test('los cuatro caminos coinciden entre sí', () => {
    const html = soloTexto(buildPedidoFormalHtml({ cliente: CLIENTE, lineas: LINEAS, pedidoId: 'x' }))
    const wa = buildWhatsAppPedido({ cliente: CLIENTE, lineas: LINEAS }).text
    const bod = buildWhatsAppBodega({ cliente: CLIENTE, lineas: LINEAS })
    for (const [nombre, txt] of [['whatsapp', wa], ['bodega', bod], ['pdf', html]]) {
      assert.ok(txt.includes('2.580'), `${nombre} no muestra el total correcto`)
    }
    assert.equal(totalPedido({ lineas: LINEAS }), totalLineas(LINEAS))
  })
})

describe('totalPedido · casos de la base', () => {
  test('respeta total_estimado cuando viene guardado', () => {
    assert.equal(totalPedido({ total_estimado: 9900, lineas: LINEAS }), 9900)
  })

  test('cae a las líneas si total_estimado es 0, null o basura', () => {
    for (const v of [0, null, undefined, 'abc']) {
      assert.equal(totalPedido({ total_estimado: v, lineas: LINEAS }), 2580, `total_estimado=${v}`)
    }
  })

  test('un pedido nulo o sin líneas da 0, nunca NaN', () => {
    for (const p of [null, undefined, {}, { lineas: null }, { lineas: 'x' }]) {
      const t = totalPedido(p)
      assert.equal(t, 0, JSON.stringify(p))
      assert.ok(Number.isFinite(t))
    }
  })
})

describe('sanitizeNombreProducto', () => {
  test('corta el pipe y descarta basura', () => {
    assert.equal(sanitizeNombreProducto('Arroz 1kg|24|6'), 'Arroz 1kg')
    assert.equal(sanitizeNombreProducto('OK'), '')
    assert.equal(sanitizeNombreProducto('1,5 kg'), '')
    assert.equal(sanitizeNombreProducto('ab'), '')
    assert.equal(sanitizeNombreProducto(null), '')
  })
})