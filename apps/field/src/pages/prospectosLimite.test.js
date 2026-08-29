/**
 * EL CORTE DE PROSPECTOS — historia de dos bugs.
 *
 * BUG 1 (V11.0): `.limit()` sin `.order()`
 * El corte lo decidía el orden interno de Postgres: se perdían filas al
 * azar, no las de menos valor. Se agregó `.order('score')` — el mismo
 * campo con el que planDia.js rankea después.
 *
 * BUG 2 (V11.2): `.limit()` no sirve para nada
 * PostgREST corta en 1.000 filas por defecto y `.limit(5000)` NO sube
 * ese tope: el límite del cliente sólo puede BAJARLO. La app mostraba
 * 917 / 462 / 1.000 con 2.389 / 3.870 / 3.627 en la base.
 *
 * El 1.000 redondo era la pista. Y no fallaba: 200 con menos filas.
 *
 * Este test verifica que ya NO se use `.limit()` para eso.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const RUTA = fs.readFileSync(new URL('./Ruta.jsx', import.meta.url), 'utf8')

describe('las consultas de prospectos paginan', () => {
  test('ninguna usa .limit() para traer prospectos', () => {
    // `.limit(5000)` daba una falsa sensación de completitud.
    const bloque = RUTA.slice(RUTA.indexOf("from('prospectos')"))
      .slice(0, 4000)
    assert.doesNotMatch(bloque, /\.limit\(\s*[0-9]{4,}\s*\)/,
      '.limit() con números grandes no sube el techo de 1.000 del servidor')
  })

  test('usan traerTodo, que pagina con .range()', () => {
    const usos = [...RUTA.matchAll(/traerTodo\(/g)]
    assert.ok(usos.length >= 3,
      `sólo ${usos.length} consultas paginan; deberían ser las 3 de prospectos`)
  })

  test('cada página se pide con .range(d, h)', () => {
    assert.match(RUTA, /\.range\(d,\s*h\)/,
      'sin .range() no hay paginación real')
  })
})

describe('el orden del corte sigue siendo el correcto', () => {
  test('ordenan por score, no por potencial', () => {
    // planDia.js rankea por `score`. Ordenar la consulta por otro campo
    // haría que se pierdan justo los que iban a quedar arriba.
    const ordenes = [...RUTA.matchAll(/\.order\('(\w+)'/g)].map((m) => m[1])
    assert.ok(ordenes.includes('score'))
  })

  test('los nulos van al final, no se comen el cupo', () => {
    assert.match(RUTA, /nullsFirst:\s*false/,
      'sin esto los prospectos sin score cargado quedarían primeros')
  })
})

describe('el recuadro del mapa no descarta en silencio', () => {
  test('lo descartado se avisa con warn, no con log', () => {
    assert.match(RUTA, /console\.warn\([\s\S]{0,200}fuera del recuadro/,
      'un console.log entre otros no lo mira nadie')
  })

  test('los prospectos con zona y comuna contradictorias se reportan', () => {
    assert.match(RUTA, /contradictorias/,
      'esos prospectos no los ve NINGÚN vendedor: hay que poder detectarlos')
  })
})
