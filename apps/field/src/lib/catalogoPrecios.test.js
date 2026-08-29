/**
 * catalogoPrecios.test.js — guardas de la resolución de precios del catálogo.
 *
 * La RPC `get_public_catalogo` (sql/26) debe respetar el precio del cliente y,
 * si no hay, sugerir el de la lista de precios del ciclo único (stock). Lo que
 * se puede fijar leyendo el SQL sin una base real:
 *   1. `precio` cae a la lista cuando no hay precio de cliente.
 *   2. La lista cae a `stock.precio_unidad` SI la oferta no guardó `precio_lista`
 *      (el fallback "sin precio → lista" es robusto y no depende del editor).
 *   3. `precio_origen` marca 'lista' cuando el precio proviene de la lista.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const RAiz = path.resolve(import.meta.dirname, '..', '..', '..', '..')
const sql26 = fs.readFileSync(path.join(RAiz, 'sql', '26_CATALOGO_ORDEN.sql'), 'utf8')

// Solo el cuerpo de la función (primera definición).
const inicio = sql26.indexOf('CREATE OR REPLACE FUNCTION public.get_public_catalogo')
const fn = sql26.slice(inicio)

describe('Catálogo público · resolución de precios', () => {
  test('el precio cae a la lista cuando no hay precio de cliente', () => {
    // `precio` = cliente; si es 0, lista; si no, 0 → front muestra "Consultar".
    assert.match(
      fn,
      /'precio',\s*COALESCE\(NULLIF\(o\.p_cliente,\s*0\),\s*NULLIF\(o\.p_lista,\s*0\),\s*0\)/,
      'precio debe caer: cliente → lista → 0'
    )
  })

  test('la lista cae a stock.precio_unidad si la oferta no guardó precio_lista', () => {
    // El fallback "sin precio → sugiere el de la lista" del ciclo único:
    // p_lista = oferta.precio_lista; si es null/0 → stock.precio_unidad.
    assert.match(
      fn,
      /NULLIF\(i\.precio_lista,\s*0\),\s*NULLIF\(st\.precio_unidad,\s*0\)/,
      'p_lista debe caer a stock.precio_unidad cuando la oferta no tiene precio_lista'
    )
    assert.match(
      fn,
      /LEFT JOIN public\.stock\s+st\s+ON\s+st\.sku_canon\s*=\s*i\.sku_canon/,
      'el JOIN a stock debe existir para poder caer a su precio_unidad'
    )
  })

  test('precio_origen distingue negociado / lista / consultar', () => {
    assert.match(
      fn,
      /WHEN\s+o\.p_cliente\s*>\s*0\s+THEN\s+'negociado'/,
      'precio de cliente (negociado) tiene prioridad'
    )
    assert.match(
      fn,
      /WHEN\s+o\.p_lista\s*>\s*0\s+THEN\s+'lista'/,
      'sin precio de cliente se muestra como lista'
    )
    assert.match(
      fn,
      /ELSE\s+'consultar'/,
      'sin ni cliente ni lista se marca Consultar'
    )
  })

  test('respetar el precio del cliente por encima de la lista', () => {
    // jerarquía: p_cliente tiene prioridad sobre p_lista.
    const idxCliente = fn.indexOf('NULLIF(o.p_cliente, 0)')
    const idxLista = fn.indexOf('NULLIF(o.p_lista, 0)')
    assert.ok(idxCliente !== -1 && idxLista !== -1, 'ambos fallbacks presentes')
    assert.ok(idxCliente < idxLista, 'p_cliente se evalúa antes que p_lista')
  })
})
