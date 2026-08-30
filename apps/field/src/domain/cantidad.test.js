/**
 * Un cero de más no puede convertir un pedido de $154.800 en uno de
 * $15.480.000 sin que nadie pregunte nada.
 *
 * setCant hacía Math.max(0, Number(v) || 0): piso pero ningún techo, ni
 * control de decimales ni de notación científica. El pedido salía a
 * bodega tal cual.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizarCantidad,
  cantidadSospechosa,
  revisarCantidades,
  CANTIDAD_SOSPECHOSA,
} from './cantidad.js'

describe('normalizar la cantidad tecleada', () => {
  test('un número normal pasa igual', () => {
    assert.equal(normalizarCantidad(12), 12)
    assert.equal(normalizarCantidad('12'), 12)
  })

  test('los decimales se truncan: no se venden 1,5 cajas', () => {
    assert.equal(normalizarCantidad('1.5'), 1)
    assert.equal(normalizarCantidad('0.001'), 0, 'una fracción no es una cantidad')
  })

  test('la notación científica no cuela', () => {
    // '1e5' pasaba silenciosamente a 100.000.
    assert.equal(normalizarCantidad('1e5'), 100000, 'se acota al techo duro')
    assert.ok(normalizarCantidad('1e12') <= 100000, 'nunca por encima del techo')
  })

  test('negativos y basura dan 0', () => {
    for (const v of [-5, '-5', 'abc', null, undefined, '', {}, []]) {
      assert.equal(normalizarCantidad(v), 0, `falló con ${JSON.stringify(v)}`)
    }
  })

  test('nunca devuelve NaN ni Infinity', () => {
    for (const v of ['abc', Infinity, -Infinity, NaN, '1e999']) {
      const n = normalizarCantidad(v)
      assert.ok(Number.isFinite(n), `${v} dio ${n}`)
    }
  })
})

describe('detectar el cero de más', () => {
  test('una cantidad de terreno normal no es sospechosa', () => {
    for (const v of [1, 12, 48, 120, CANTIDAD_SOSPECHOSA]) {
      assert.equal(cantidadSospechosa(v), false, `${v} debería pasar sin preguntar`)
    }
  })

  test('un pedido con un cero de más se marca', () => {
    assert.equal(cantidadSospechosa(1200), true)
    assert.equal(cantidadSospechosa(12000), true)
  })

  test('revisarCantidades señala la línea concreta', () => {
    const { sospechosas, hayQueConfirmar } = revisarCantidades([
      { nombre: 'Arroz', cantidad: 12 },
      { nombre: 'Aceite', cantidad: 1200 },
      { nombre: 'Fideos', cantidad: 30 },
    ])
    assert.equal(hayQueConfirmar, true)
    assert.equal(sospechosas.length, 1)
    assert.equal(sospechosas[0].nombre, 'Aceite', 'hay que decir CUÁL línea')
    assert.equal(sospechosas[0].cantidad, 1200)
  })

  test('un pedido normal no pide confirmación', () => {
    const r = revisarCantidades([
      { nombre: 'Arroz', cantidad: 12 },
      { nombre: 'Fideos', cantidad: 30 },
    ])
    assert.equal(r.hayQueConfirmar, false)
  })

  test('no rompe con líneas vacías o datos sucios', () => {
    for (const v of [null, undefined, 'no es array', [], [null], [{}]]) {
      const r = revisarCantidades(v)
      assert.ok(Array.isArray(r.sospechosas), `falló con ${JSON.stringify(v)}`)
    }
  })
})