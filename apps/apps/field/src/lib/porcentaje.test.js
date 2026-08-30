/**
 * Los porcentajes de Gerencia no pueden mostrar NaN ni fingir un 100%.
 *
 * Sin guarda en el denominador:
 *   · total 0, venta 0   → NaN%      (barra sin ancho, CSS inválido)
 *   · total 0, venta > 0 → Infinity  → Math.min(Infinity,100) = 100
 *
 * El segundo es el peligroso: la barra se pinta LLENA. Un gerente lee
 * 100% de participación donde en realidad falta el dato.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { participacion, textoParticipacion, anchoBarra } from './porcentaje.js'

describe('participación · sin base no se inventa un número', () => {
  test('cálculo normal con un decimal', () => {
    assert.equal(participacion(250000, 1000000), 25)
    assert.equal(participacion(333333, 1000000), 33.3)
    assert.equal(textoParticipacion(250000, 1000000), '25%')
  })

  // Primer día del mes: nadie vendió todavía.
  test('total 0 y parte 0 no da NaN', () => {
    assert.equal(participacion(0, 0), null)
    const t = textoParticipacion(0, 0)
    assert.ok(!/NaN/.test(t), `mostraba "${t}"`)
    assert.equal(t, '—')
  })

  // El caso grave.
  test('total 0 con venta > 0 no finge un 100%', () => {
    assert.equal(participacion(150000, 0), null)
    assert.equal(
      anchoBarra(150000, 0),
      '0%',
      'Math.min(Infinity,100) pintaba la barra llena: parecía éxito total',
    )
  })

  test('la barra nunca se pasa de 100 ni baja de 0', () => {
    assert.equal(anchoBarra(2000, 1000), '100%')
    assert.equal(anchoBarra(-500, 1000), '0%')
  })

  test('datos sucios se tratan como sin base', () => {
    // Number(null) es 0, así que [null, 100] es un 0% legítimo, no ausencia.
    // Sólo son "sin base" los que no producen un número usable.
    for (const [p, t] of [['abc', 100], [100, null], [100, 'x'], [undefined, undefined]]) {
      assert.equal(participacion(p, t), null, `falló con ${JSON.stringify([p, t])}`)
    }
    assert.equal(participacion(null, 100), 0, 'null como parte es cero, no falta de dato')
    for (const [p, t] of [['abc', 100], [100, null], [null, 100], [0, 0]]) {
      assert.ok(!/NaN|Infinity/.test(textoParticipacion(p, t)), `${JSON.stringify([p, t])}`)
    }
  })

  test('un total negativo tampoco es base válida', () => {
    assert.equal(participacion(100, -50), null)
  })

  test('parte 0 sobre un total real sí es 0%, no ausencia', () => {
    assert.equal(participacion(0, 1000000), 0)
    assert.equal(textoParticipacion(0, 1000000), '0%')
    assert.equal(anchoBarra(0, 1000000), '0%')
  })
})