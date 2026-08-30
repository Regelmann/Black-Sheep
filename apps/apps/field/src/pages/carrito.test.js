/**
 * El catálogo público es la única pantalla que ve el CLIENTE FINAL, y
 * la que decide si confirma un pedido. Su total tiene que ser honesto.
 *
 * Bug encontrado: los productos sin precio se listan como "Consultar",
 * pero el total los sumaba como $0. El cliente confirmaba creyendo que
 * el pedido costaba lo que decía la cifra, con unidades sin cotizar
 * adentro.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { resumenCarrito, tienePrecio } from './carrito.js'

const arroz = { sku_canon: 'ARZ', precio: 1290, cantidad: 12 }
const aceite = { sku_canon: 'ACE', precio: 0, cantidad: 6 } // "Consultar"
const fideos = { sku_canon: 'FID', precio: 890, cantidad: 10 }

describe('carrito del cliente · el total no puede mentir', () => {
  test('sin líneas sin precio, el total es la suma directa', () => {
    const r = resumenCarrito([arroz, fideos])
    assert.equal(r.total, 12 * 1290 + 10 * 890)
    assert.equal(r.parcial, false)
    assert.equal(r.etiqueta, 'Total estimado')
  })

  // El caso exacto del bug.
  test('con productos "Consultar" el total se declara parcial', () => {
    const r = resumenCarrito([arroz, aceite, fideos])
    assert.equal(r.total, 24380, 'suma sólo lo que tiene precio')
    assert.equal(r.parcial, true, 'el pedido lleva unidades sin cotizar')
    assert.equal(r.lineasSinPrecio, 1)
    assert.equal(r.unidadesSinPrecio, 6)
    assert.notEqual(
      r.etiqueta,
      'Total estimado',
      'llamarlo "Total estimado" hace creer que cubre todo el pedido',
    )
  })

  test('todo sin precio: no se muestra una cifra, se cotiza', () => {
    const r = resumenCarrito([aceite])
    assert.equal(r.total, 0)
    assert.equal(r.etiqueta, 'A cotizar')
  })

  test('el carrito vacío no rompe', () => {
    const r = resumenCarrito([])
    assert.equal(r.total, 0)
    assert.equal(r.unidades, 0)
    assert.equal(r.parcial, false)
  })

  test('las unidades cuentan todo, tenga precio o no', () => {
    const r = resumenCarrito([arroz, aceite, fideos])
    assert.equal(r.unidades, 28)
  })

  test('aguanta datos sucios sin devolver NaN', () => {
    const r = resumenCarrito([
      { precio: null, cantidad: 3 },
      { precio: 'abc', cantidad: 2 },
      { precio: 500, cantidad: undefined },
      null,
    ])
    assert.ok(Number.isFinite(r.total), `total = ${r.total}`)
    assert.ok(Number.isFinite(r.unidades))
  })

  test('un precio negativo no descuenta del total', () => {
    const r = resumenCarrito([arroz, { precio: -900, cantidad: 4 }])
    assert.equal(tienePrecio({ precio: -900 }), false)
    assert.equal(r.total, 12 * 1290, 'un precio inválido no puede restar')
    assert.equal(r.parcial, true)
  })
})