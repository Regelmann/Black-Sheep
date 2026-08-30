/**
 * Proyección del mes.
 *
 * "El ejecutivo tiene que saber su camino, sino no genera acciones."
 *
 * La venta MTD dice DÓNDE ESTÁS. La proyección dice A DÓNDE LLEGÁS si
 * el ritmo no cambia — y eso es lo que convierte un número en una
 * decisión.
 *
 * Un 56% el día 24 y un 56% el día 8 son el mismo porcentaje y
 * problemas opuestos. Sin proyección, la app no distingue.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { proyeccionCierre, diasHabilesDelMes } from '../lib/calculations/habiles.js'

/** Réplica del cálculo que hace el componente. */
function resumen(ventaMtd, meta, ahora) {
  const proy = proyeccionCierre(ventaMtd, ahora)
  if (proy === null || !meta) return null
  const { transcurridos, totales } = diasHabilesDelMes(ahora)
  const restantes = Math.max(0, totales - transcurridos)
  const faltaTotal = Math.max(0, meta - ventaMtd)
  return {
    proy,
    sobre: proy >= meta,
    dif: Math.abs(proy - meta),
    restantes,
    porDia: restantes > 0 ? faltaTotal / restantes : faltaTotal,
  }
}

describe('proyección · el mismo % con distinto día', () => {
  const META = 74_500_000
  const VENTA = 41_922_217          // 56% de la meta

  test('56% temprano en el mes proyecta POR ENCIMA', () => {
    // Día 8: llevás 56% con la mayor parte del mes por delante.
    const r = resumen(VENTA, META, new Date(2026, 7, 8))
    assert.ok(r, 'debe haber proyección')
    assert.equal(r.sobre, true, 'ese ritmo cierra sobre la meta')
  })

  test('el MISMO 56% al final del mes proyecta BAJO', () => {
    // Día 24: mismo número, mes casi terminado.
    const r = resumen(VENTA, META, new Date(2026, 7, 24))
    assert.equal(r.sobre, false, 'ese ritmo NO llega')
  })

  test('esa diferencia es exactamente el valor del bloque', () => {
    const temprano = resumen(VENTA, META, new Date(2026, 7, 8))
    const tarde = resumen(VENTA, META, new Date(2026, 7, 24))
    assert.ok(temprano.proy > tarde.proy,
      'mismo MTD, proyecciones distintas: eso es lo que la venta sola no dice')
  })
})

describe('proyección · el número que genera acción', () => {
  test('dice cuánto falta POR DÍA, no el promedio del mes', () => {
    const r = resumen(40_000_000, 74_500_000, new Date(2026, 7, 24))
    const falta = 74_500_000 - 40_000_000
    assert.ok(Math.abs(r.porDia - falta / r.restantes) < 1,
      'el ritmo necesario se calcula sobre los días QUE QUEDAN')
  })

  test('meta cumplida: no pide vender más por día', () => {
    const r = resumen(80_000_000, 74_500_000, new Date(2026, 7, 24))
    assert.equal(r.sobre, true)
    assert.equal(r.porDia, 0)
  })
})

describe('proyección · casos límite', () => {
  test('no proyecta el día 1: sería ruido, no información', () => {
    assert.equal(proyeccionCierre(1_000_000, new Date(2026, 7, 1)), null)
  })

  test('sin meta no hay proyección que mostrar', () => {
    assert.equal(resumen(40_000_000, 0, new Date(2026, 7, 15)), null)
  })

  test('venta 0 proyecta 0, no NaN', () => {
    const p = proyeccionCierre(0, new Date(2026, 7, 15))
    assert.equal(p, 0)
    assert.ok(!isNaN(p))
  })

  test('valores inválidos devuelven null', () => {
    for (const v of [null, undefined, -5, 'abc', NaN]) {
      assert.equal(proyeccionCierre(v, new Date(2026, 7, 15)), null)
    }
  })
})
