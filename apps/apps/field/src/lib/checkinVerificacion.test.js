/**
 * "Verificado" es evidencia de que el vendedor estuvo en el local: queda
 * guardado en la fila del check-in. No puede afirmarse sobre una
 * medición que no lo sostiene.
 *
 * El bug: `verificado = dist <= 150` sin mirar accuracy. Con ±2000 m de
 * error, estar "a 140 m" es ruido — el vendedor podría estar en su casa.
 * El dato de precisión se pedía y se guardaba, pero no entraba en la
 * decisión.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { evaluarCheckin, RADIO_LOCAL_M } from './checkinVerificacion.js'

describe('verificación de check-in', () => {
  test('cerca y con GPS preciso: verificado', () => {
    const r = evaluarCheckin({ distancia: 40, accuracy: 15 })
    assert.equal(r.verificado, true)
    assert.equal(r.motivo, 'ok')
  })

  test('lejos con GPS preciso: no verificado, y se dice a cuánto', () => {
    const r = evaluarCheckin({ distancia: 800, accuracy: 15 })
    assert.equal(r.verificado, false)
    assert.equal(r.motivo, 'lejos')
    assert.match(r.texto, /800 m/)
  })

  // El caso del bug.
  test('cerca pero con GPS impreciso: NO se afirma que estuvo', () => {
    const r = evaluarCheckin({ distancia: 140, accuracy: 2000 })
    assert.equal(
      r.verificado,
      false,
      'con ±2 km de error, "a 140 m" no prueba nada',
    )
    assert.equal(r.motivo, 'impreciso')
    assert.match(r.texto, /impreciso/i)
  })

  test('el margen de error justo en el límite sigue sirviendo', () => {
    assert.equal(evaluarCheckin({ distancia: 100, accuracy: 150 }).verificado, true)
    assert.equal(evaluarCheckin({ distancia: 100, accuracy: 151 }).verificado, false)
  })

  test('sin accuracy no se asume que la medición es buena', () => {
    for (const acc of [null, undefined, 0, -5, NaN, 'abc']) {
      const r = evaluarCheckin({ distancia: 40, accuracy: acc })
      assert.equal(r.verificado, false, `accuracy ${JSON.stringify(acc)}`)
    }
  })

  test('sin distancia el check-in queda sin ubicación', () => {
    for (const d of [null, undefined, NaN, 'abc']) {
      const r = evaluarCheckin({ distancia: d, accuracy: 20 })
      assert.equal(r.verificado, false)
      assert.equal(r.motivo, 'sin_posicion')
    }
  })

  // El check-in se registra igual: hay locales en subterráneos.
  test('nunca bloquea: siempre hay un texto que mostrar', () => {
    for (const [d, a] of [[40, 15], [800, 15], [140, 2000], [null, null]]) {
      const r = evaluarCheckin({ distancia: d, accuracy: a })
      assert.ok(r.texto && r.texto.length > 0, `${d}/${a}`)
      assert.match(r.texto, /Check-in/)
    }
  })

  test('el radio del local es configurable', () => {
    assert.equal(evaluarCheckin({ distancia: 200, accuracy: 20 }).verificado, false)
    assert.equal(evaluarCheckin({ distancia: 200, accuracy: 20, radio: 300 }).verificado, true)
    assert.equal(RADIO_LOCAL_M, 150, 'el radio por defecto no cambió')
  })

  test('distancia 0 con buen GPS es el caso ideal', () => {
    assert.equal(evaluarCheckin({ distancia: 0, accuracy: 10 }).verificado, true)
  })
})