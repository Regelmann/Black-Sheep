/**
 * "Sin dato de stock" y "hay stock" no son lo mismo.
 *
 * El bug: Number(fila.stock_operativo) sobre una fila sin esa columna da
 * NaN. En pantalla salía "stock NaN", y como NaN <= 0 es false, el
 * producto NO se marcaba crítico: el vendedor lo veía disponible y podía
 * comprometerlo con el cliente.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { stockKg, textoStock, esCritico } from './stockTexto.js'

describe('stock de una línea · nunca mostrar NaN', () => {
  test('con stock real muestra el número formateado', () => {
    assert.equal(stockKg({ stock_operativo: 1250 }), 1250)
    assert.equal(textoStock({ stock_operativo: 1250 }), 'stock 1.250 kg')
  })

  // El caso del bug.
  test('sin la columna no dice NaN', () => {
    const texto = textoStock({ producto_nombre: 'Arroz' })
    assert.ok(!/NaN/.test(texto), `mostraba: "${texto}"`)
    assert.equal(texto, 'stock sin dato')
  })

  test('null, cadena vacía y basura se tratan como sin dato', () => {
    for (const v of [null, undefined, '', 'abc', {}]) {
      assert.equal(stockKg({ stock_operativo: v }), null, `falló con ${JSON.stringify(v)}`)
      assert.ok(!/NaN/.test(textoStock({ stock_operativo: v })))
    }
  })

  test('sin dato se advierte: no se puede prometer lo que no se sabe', () => {
    assert.equal(
      esCritico({ producto_nombre: 'Arroz' }),
      true,
      'NaN <= 0 daba false y el producto salía como disponible',
    )
  })

  test('stock cero o negativo es crítico', () => {
    assert.equal(esCritico({ stock_operativo: 0 }), true)
    assert.equal(esCritico({ stock_operativo: -5 }), true)
  })

  test('stock sano no es crítico', () => {
    assert.equal(esCritico({ stock_operativo: 900 }), false)
  })

  test('el estado textual manda aunque haya números', () => {
    assert.equal(esCritico({ stock_operativo: 900, estado_stock: 'CRITICO' }), true)
  })

  test('el cero es un dato válido, no ausencia', () => {
    assert.equal(stockKg({ stock_operativo: 0 }), 0)
    assert.equal(textoStock({ stock_operativo: 0 }), 'stock 0 kg')
  })
})