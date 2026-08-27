/**
 * parseSkuDetalle — el parser del que dependen 10 archivos: precios,
 * riesgo, reposición, recomendaciones, stockIntel, Cartera y Gerencia.
 * 447 líneas sin un solo test hasta ahora.
 *
 * `sku_detalle` es texto libre que llega de vistas y CSV, así que el
 * formato no está garantizado. El bug que apareció al probarlo:
 * `num()` hacía `replace(',', '.')` tratando el punto como decimal, de
 * modo que "1.290" se leía como 1.29 — y el precio histórico de un
 * cliente caía de $54 a $1, sin ningún error visible.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { parseSkuDetalle, pctRitmo, clpEfectivo } from './coach.js'

/* Formato de 6 campos: nombre|promUd|udMtd|promClp|clpMtd|ultima */
const LINEA = (promClp = '1290', clpMtd = '7740') =>
  `Arroz Grado 2 1kg|24|6|${promClp}|${clpMtd}|2026-08-01`

describe('parseSkuDetalle · formatos de entrada', () => {
  test('parsea el formato de texto con pipes', () => {
    const [r] = parseSkuDetalle(LINEA())
    assert.equal(r.nombre, 'Arroz Grado 2 1kg')
    assert.equal(r.promUd, 24)
    assert.equal(r.udMtd, 6)
    assert.equal(r.promClp, 1290)
    assert.equal(r.clpMtd, 7740)
  })

  test('acepta un array de objetos', () => {
    const r = parseSkuDetalle([{ nombre: 'Aceite 900ml', promUd: 12, promClp: 2190 }])
    assert.equal(r.length, 1)
    assert.equal(r[0].promClp, 2190)
  })

  test('acepta JSON en texto', () => {
    const r = parseSkuDetalle('[{"nombre":"Fideos 400g","promClp":890}]')
    assert.equal(r[0].nombre, 'Fideos 400g')
    assert.equal(r[0].promClp, 890)
  })

  test('varios productos separados por || o saltos de línea', () => {
    assert.equal(parseSkuDetalle(`${LINEA()}||${LINEA()}`).length, 2)
    assert.equal(parseSkuDetalle(`${LINEA()}\n${LINEA()}`).length, 2)
  })

  test('entrada vacía o basura devuelve lista vacía, no rompe', () => {
    for (const v of [null, undefined, '', '   ', 0, false, {}]) {
      assert.deepEqual(parseSkuDetalle(v), [], JSON.stringify(v))
    }
  })

  test('JSON malformado no lanza', () => {
    assert.ok(Array.isArray(parseSkuDetalle('[{roto')))
  })
})

describe('parseSkuDetalle · el formato chileno de los números', () => {
  // El bug: "1.290" se leía como 1.29.
  test('el punto como separador de miles no corrompe la plata', () => {
    const [conSep] = parseSkuDetalle(LINEA('1.290', '7.740'))
    const [sinSep] = parseSkuDetalle(LINEA('1290', '7740'))
    assert.equal(conSep.promClp, 1290, '"1.290" son mil doscientos noventa pesos')
    assert.equal(conSep.clpMtd, 7740)
    assert.deepEqual(
      [conSep.promClp, conSep.clpMtd],
      [sinSep.promClp, sinSep.clpMtd],
      'el mismo dato con y sin separador tiene que dar lo mismo',
    )
  })

  test('la coma decimal se respeta', () => {
    assert.equal(parseSkuDetalle(LINEA('1.290,50'))[0].promClp, 1290.5)
  })

  test('el punto decimal sin miles se respeta', () => {
    // "1290.5" no son 3 dígitos detrás del punto: es decimal, no miles.
    assert.equal(parseSkuDetalle(LINEA('1290.5'))[0].promClp, 1290.5)
  })

  test('millones con dos separadores', () => {
    assert.equal(parseSkuDetalle(LINEA('1.234.567'))[0].promClp, 1234567)
  })

  test('texto no numérico da 0, nunca NaN', () => {
    for (const v of ['abc', '--', '$$']) {
      const [r] = parseSkuDetalle(LINEA(v))
      assert.ok(Number.isFinite(r.promClp), `${v} dio ${r.promClp}`)
    }
  })
})

describe('ritmo y plata efectiva', () => {
  test('pctRitmo compara lo comprado contra el promedio', () => {
    assert.equal(pctRitmo(6, 24), 25)
  })

  test('promedio 0 no produce Infinity', () => {
    const p = pctRitmo(6, 0)
    assert.ok(p === null || Number.isFinite(p), `dio ${p}`)
  })

  test('clpEfectivo nunca devuelve NaN', () => {
    for (const s of [null, {}, { clpMtd: 'abc' }, { promClp: 0, promUd: 0, udMtd: 5 }]) {
      const v = clpEfectivo(s)
      assert.ok(v === null || Number.isFinite(v), `${JSON.stringify(s)} dio ${v}`)
    }
  })
})
