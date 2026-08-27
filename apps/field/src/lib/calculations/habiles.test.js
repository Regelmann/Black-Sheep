/**
 * La proyección de cierre de mes tenía TRES fórmulas distintas, visibles
 * en las mismas pantallas:
 *
 *   predictor.js  días corridos
 *   calcGoal      días hábiles reales
 *   metrics.js    × 22 fijo
 *
 * Con vtaMtd 4.500.000 al 17/08/2026: 8.205.882 / 8.590.909 / 9.000.000.
 * La tercera anuncia "meta cumplida" y las otras dos no.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { diasHabilesDelMes, proyeccionCierre } from './habiles.js'

/* Agosto 2026: arranca sábado 1. 21 hábiles en total. */
const AGO = (dia) => new Date(2026, 7, dia, 12, 0, 0)

describe('días hábiles del mes', () => {
  test('cuenta bien un mes conocido', () => {
    const { totales } = diasHabilesDelMes(AGO(17))
    assert.equal(totales, 21, 'agosto 2026 tiene 21 días hábiles')
  })

  test('excluye sábados y domingos', () => {
    // Lunes 3 de agosto: sólo un hábil transcurrido (el 1 y 2 son fin de semana).
    assert.equal(diasHabilesDelMes(AGO(3)).transcurridos, 1)
  })

  test('transcurridos + restantes = totales', () => {
    for (const d of [3, 10, 17, 24, 31]) {
      const { transcurridos, restantes, totales } = diasHabilesDelMes(AGO(d))
      assert.equal(transcurridos + restantes, totales, `día ${d}`)
    }
  })

  test('el día 1 en sábado no deja transcurridos en cero', () => {
    // Dividir por cero acá produce Infinity en la proyección.
    assert.ok(diasHabilesDelMes(AGO(1)).transcurridos >= 1)
  })

  test('una fecha inválida no rompe', () => {
    const r = diasHabilesDelMes(new Date('basura'))
    assert.ok(Number.isFinite(r.totales) && r.totales > 0)
  })
})

describe('proyección de cierre', () => {
  test('proyecta al ritmo de días hábiles', () => {
    // 11 hábiles al 17/08, 21 totales. 4.500.000 / 11 * 21
    const p = proyeccionCierre(4500000, AGO(17))
    assert.equal(p, Math.round((4500000 / 11) * 21))
  })

  // El caso que motivó todo.
  test('no extrapola el mes entero desde el primer día', () => {
    assert.equal(
      proyeccionCierre(500000, AGO(3)),
      null,
      'una venta grande el día 1 proyectaba 15.500.000 de cierre',
    )
  })

  test('con suficientes días sí proyecta', () => {
    assert.ok(proyeccionCierre(500000, AGO(10)) !== null)
  })

  test('no devuelve Infinity ni NaN nunca', () => {
    for (const v of [0, 1, 999999999, null, undefined, 'abc', -5]) {
      for (const d of [1, 2, 3, 15, 31]) {
        const p = proyeccionCierre(v, AGO(d))
        assert.ok(p === null || Number.isFinite(p), `${v} el día ${d} dio ${p}`)
      }
    }
  })

  test('venta 0 con mes avanzado proyecta 0, no null', () => {
    assert.equal(proyeccionCierre(0, AGO(17)), 0)
  })

  test('difiere de la fórmula por días corridos, que es el bug', () => {
    const habil = proyeccionCierre(4500000, AGO(17))
    const corrido = 4500000 + (4500000 / 17) * (31 - 17)
    assert.notEqual(
      habil,
      Math.round(corrido),
      'si coincidieran, el arreglo no estaría haciendo nada',
    )
  })
})