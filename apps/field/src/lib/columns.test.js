/**
 * Tolerancia a cambios de esquema.
 *
 * QUÉ CUBRE
 * PostgREST rechaza la consulta ENTERA si una columna del select no
 * existe. Devuelve 400 y cero filas, no las columnas que sí están.
 *
 * Como el ETL evoluciona, cada renombre podía tumbar una pantalla:
 *   Stock    → "Esta vista está desactualizada"
 *   Gerencia → "No cargó: stock · notas"
 *
 * Ningún test previo cubría esto.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  pick, pickNum, pickStr, pickBool,
  faltantes, columnasReales,
  CARTERA, STOCK,
} from './columns.js'

describe('pick · resolución por alias', () => {
  test('toma el primer alias presente', () => {
    assert.equal(pick({ venta_mtd: 100 }, ['venta_mtd', 'venta_mes']), 100)
    assert.equal(pick({ venta_mes: 200 }, ['venta_mtd', 'venta_mes']), 200)
  })

  test('respeta el orden de preferencia', () => {
    const r = { venta_mes: 200, venta_mtd: 100 }
    assert.equal(pick(r, ['venta_mtd', 'venta_mes']), 100, 'gana el primero de la lista')
  })

  test('null, undefined y "" se saltan — no son un valor', () => {
    assert.equal(pick({ a: null,      b: 5 }, ['a', 'b']), 5)
    assert.equal(pick({ a: undefined, b: 5 }, ['a', 'b']), 5)
    assert.equal(pick({ a: '',        b: 5 }, ['a', 'b']), 5)
  })

  test('el 0 SÍ es un valor válido', () => {
    // Un cliente con venta 0 es distinto de un cliente sin dato.
    assert.equal(pick({ venta: 0 }, ['venta'], 999), 0)
  })

  test('false SÍ es un valor válido', () => {
    assert.equal(pick({ activo: false }, ['activo'], true), false)
  })

  test('devuelve el default si no hay ningún alias', () => {
    assert.equal(pick({ x: 1 }, ['a', 'b'], 'nada'), 'nada')
  })

  test('no explota con row null', () => {
    assert.equal(pick(null, ['a'], 'ok'), 'ok')
    assert.equal(pick(undefined, ['a'], 'ok'), 'ok')
  })
})

describe('pickNum · PostgREST devuelve numéricos como string', () => {
  test('convierte string a número', () => {
    assert.equal(pickNum({ v: '1234.5' }, ['v']), 1234.5)
  })
  test('acepta coma decimal', () => {
    assert.equal(pickNum({ v: '1234,5' }, ['v']), 1234.5)
  })
  test('texto no numérico cae al default, no a NaN', () => {
    assert.equal(pickNum({ v: 'ninguno' }, ['v'], 0), 0)
    assert.ok(!isNaN(pickNum({ v: 'x' }, ['v'])))
  })
  test('preserva el 0', () => {
    assert.equal(pickNum({ v: 0 }, ['v'], 99), 0)
    assert.equal(pickNum({ v: '0' }, ['v'], 99), 0)
  })
})

describe('pickBool · variantes de la base', () => {
  test('acepta las formas que llegan de Postgres', () => {
    for (const v of [true, 'true', 't', '1', 1, 'SI', 'sí']) {
      assert.equal(pickBool({ a: v }, ['a']), true, `debería ser true: ${v}`)
    }
  })
  test('lo demás es false', () => {
    for (const v of [false, 'false', 'f', '0', 'no']) {
      assert.equal(pickBool({ a: v }, ['a']), false, `debería ser false: ${v}`)
    }
  })
})

describe('faltantes · auditoría de esquema', () => {
  test('detecta el campo que no existe con ningún alias', () => {
    const filas = [{ cliente_key: 'A', nombre_cliente: 'X' }]
    const falta = faltantes(filas, CARTERA)
    assert.ok(falta.includes('skuDetalle'), 'sku_detalle no está y debe reportarse')
    assert.ok(!falta.includes('clienteKey'), 'cliente_key sí está')
  })

  test('un alias alternativo cuenta como presente', () => {
    // La vista usa razon_social en vez de nombre_cliente.
    const filas = [{ cliente_key: 'A', razon_social: 'X' }]
    assert.ok(!faltantes(filas, CARTERA).includes('nombre'))
  })

  test('sin filas no inventa faltantes', () => {
    assert.deepEqual(faltantes([], CARTERA), [])
    assert.deepEqual(faltantes(null, CARTERA), [])
  })
})

describe('el escenario real que rompía Stock', () => {
  // La vista renombró venta_mtd → venta_mtd_clp y quitó ciclo_dias.
  const filas = [
    { cliente_key: 'C1', razon_social: 'ROUTE SPA', sku_detalle: 'A||1||2||3||4', venta_mtd_clp: '11134674' },
    { cliente_key: 'C2', razon_social: 'GALPON MUT', sku_detalle: 'B||1||2||3||4', venta_mtd_clp: '3214360' },
  ]

  test('los datos se leen igual pese al renombre', () => {
    assert.equal(pickStr(filas[0], CARTERA.nombre), 'ROUTE SPA')
    assert.equal(pickNum(filas[0], CARTERA.ventaMtd), 11134674)
  })

  test('un campo ausente degrada, no rompe', () => {
    assert.equal(pickNum(filas[0], CARTERA.cicloDias, 0), 0)
  })

  test('se reporta exactamente qué falta', () => {
    const falta = faltantes(filas, CARTERA)
    assert.ok(falta.includes('cicloDias'))
    assert.ok(!falta.includes('ventaMtd'), 'lo resolvió por alias')
  })

  test('el cruce de compradores sigue funcionando', () => {
    // Lo que Stock necesita para "encontrar compradores".
    const usables = filas.filter((r) => pickStr(r, CARTERA.skuDetalle))
    assert.equal(usables.length, 2, 'ninguna fila se pierde por el renombre')
  })
})

describe('STOCK · alias de precio en cascada', () => {
  test('resuelve el precio según lo que exista', () => {
    assert.equal(pickNum({ precio_unidad: 100 }, STOCK.precioUnidad), 100)
    assert.equal(pickNum({ precio_lista: 200 }, STOCK.precioUnidad), 200)
    assert.equal(pickNum({ precio: 300 }, STOCK.precioUnidad), 300)
  })
  test('sin precio devuelve 0, nunca NaN', () => {
    const p = pickNum({ sku_canon: 'X' }, STOCK.precioUnidad, 0)
    assert.equal(p, 0)
    assert.ok(!isNaN(p))
  })
})

describe('columnasReales', () => {
  test('lista las columnas ordenadas', () => {
    assert.deepEqual(columnasReales([{ b: 1, a: 2 }]), ['a', 'b'])
  })
  test('sin filas devuelve vacío', () => {
    assert.deepEqual(columnasReales([]), [])
  })
})
