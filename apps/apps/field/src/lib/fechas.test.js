/**
 * Una fecha rota no puede convertirse en una hora creíble.
 *
 * Dos modos de fallar distintos:
 *   · new Date('basura')  → "Invalid Date" impreso en pantalla
 *   · new Date(null)      → 1970 → "12:00 a. m." junto a un pedido
 *
 * El segundo es el peligroso: no parece un error.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { fechaValida, hora, fechaHora, fechaLarga } from './fechas.js'

const ISO = '2026-08-27T14:35:00-04:00'

describe('fechas · nunca mostrar Invalid Date ni una hora inventada', () => {
  test('una fecha real se formatea', () => {
    assert.ok(fechaValida(ISO) instanceof Date)
    assert.match(hora(ISO), /\d{1,2}:\d{2}/)
  })

  test('"Invalid Date" no llega a la pantalla', () => {
    for (const basura of ['basura', 'no-es-fecha', '2026-13-45']) {
      assert.equal(fechaValida(basura), null, basura)
      assert.equal(hora(basura), '')
      assert.ok(!/Invalid/.test(fechaHora(basura)), basura)
    }
  })

  // El caso traicionero.
  test('null no se convierte en las 12:00 a.m. de 1970', () => {
    assert.equal(fechaValida(null), null)
    assert.equal(
      hora(null),
      '',
      'new Date(null) da 1970 y se imprime como una hora válida junto al pedido',
    )
    assert.equal(fechaValida(0), null, 'el epoch tampoco es una fecha de negocio')
  })

  test('vacío y undefined se tratan como sin dato', () => {
    for (const v of ['', undefined]) {
      assert.equal(fechaValida(v), null)
      assert.equal(hora(v), '')
    }
  })

  test('se puede pedir un texto alternativo', () => {
    assert.equal(hora(null, '—'), '—')
    assert.equal(fechaHora('basura', 'sin fecha'), 'sin fecha')
    assert.equal(fechaLarga(null, '—'), '—')
  })

  test('acepta un Date ya construido', () => {
    const d = new Date(ISO)
    assert.equal(fechaValida(d)?.getTime(), d.getTime())
  })

  test('un Date inválido tampoco pasa', () => {
    assert.equal(fechaValida(new Date('x')), null)
  })

  test('los formatos no devuelven NaN', () => {
    for (const v of [null, 'basura', 0, {}, []]) {
      for (const fn of [hora, fechaHora, fechaLarga]) {
        assert.ok(!/NaN|Invalid/.test(fn(v)), `${fn.name}(${JSON.stringify(v)})`)
      }
    }
  })
})