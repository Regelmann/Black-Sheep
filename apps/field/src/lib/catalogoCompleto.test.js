/**
 * EL CATÁLOGO MUESTRA TODO EL STOCK.
 *
 * 🔴 EL BUG
 *   FROM public.oferta_cliente_items i
 *   WHERE i.oferta_id = v_offer.id
 *
 * La base de la consulta eran los productos que el vendedor había
 * agregado A MANO. Si había cargado 2, el cliente veía 2 — de un stock
 * de cientos. En la app se leía "PRODUCTOS DEL CATÁLOGO (2)" y el
 * cliente recibía un link con dos cosas para comprar.
 *
 * LA REGLA
 * El catálogo es una LISTA DE PRECIOS, no una selección curada. El
 * cliente tiene que poder comprar todo lo que hay disponible. La oferta
 * sirve para:
 *   · poner un precio negociado
 *   · destacar productos (subirlos en el orden)
 *   · ocultar uno puntual con visible = false — el ÚNICO caso explícito
 *
 * Nunca para limitar el catálogo por omisión.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// fileURLToPath() en vez de new URL(...).pathname: en Windows, .pathname
// de una file:// URL da "/C:/Users/..." (con "/" antes de la letra de
// unidad), y un path.resolve/join posterior con eso duplica el prefijo
// de disco → "C:\C:\Users\...\ENOENT". fileURLToPath resuelve la unidad
// correctamente en cualquier plataforma.
const DIR = path.dirname(fileURLToPath(import.meta.url))
const RAIZ = path.resolve(DIR, '../../../..')
const SQL = fs.readFileSync(path.join(RAIZ, 'sql', '26_CATALOGO_ORDEN.sql'), 'utf8')

describe('el stock es la base, no la oferta', () => {
  test('🔴 la consulta parte de stock', () => {
    assert.match(SQL, /FROM public\.stock\s+st/,
      'si la base es oferta_cliente_items, el cliente sólo ve lo cargado a mano')
  })

  test('la oferta entra por LEFT JOIN, no como filtro', () => {
    assert.match(SQL, /LEFT JOIN public\.oferta_cliente_items\s+i/,
      'con INNER JOIN se perderían todos los productos sin fila en la oferta')
  })

  test('no queda un WHERE que exija fila en la oferta', () => {
    // `WHERE i.oferta_id = ...` sobre un LEFT JOIN lo convierte en INNER:
    // es el error clásico y volvería a esconder el catálogo entero.
    const base = SQL.slice(SQL.indexOf('FROM public.stock'), SQL.indexOf('ordenado AS'))
    assert.doesNotMatch(base, /WHERE[^)]*\bi\.oferta_id\s*=/,
      'ese WHERE anula el LEFT JOIN y vuelve el bug')
  })
})

describe('el stock informa, no filtra', () => {
  test('la disponibilidad sale de stock, no está fija en true', () => {
    // Estaba `'stock_disponible', true` — literal. El catálogo nunca
    // reflejó si había existencia.
    assert.match(SQL, /'stock_disponible',\s*o\.hay_stock/,
      'estaba fijo en true: el catálogo mentía sobre la disponibilidad')
  })

  test('sin stock NO se excluye de la consulta', () => {
    const base = SQL.slice(SQL.indexOf('FROM public.stock'), SQL.indexOf('ordenado AS'))
    assert.doesNotMatch(base, /AND[^\n]*estado_stock[^\n]*<>/,
      'sin stock se MUESTRA marcado: ocultar en silencio ya nos costó caro')
  })
})

describe('lo que sí puede ocultar un producto', () => {
  test('visible = false, y sólo eso', () => {
    assert.match(SQL, /COALESCE\(i\.visible,\s*true\)\s*=\s*true/,
      'ocultar tiene que ser explícito: por omisión todo se ve')
  })

  test('un producto sin precio no se muestra', () => {
    // Mostrarlo en $0 es peor que no mostrarlo: el cliente lo agrega al
    // carrito y el pedido sale mal.
    assert.match(SQL, /NULLIF\(st\.precio_caja, 0\), 0\)\s*> 0/,
      'sin precio no se puede vender: se omite en vez de salir en $0')
  })
})

describe('el orden pone primero lo que importa', () => {
  test('lo que ya compra va primero', () => {
    assert.match(SQL, /WHEN b\.ya_compra\s+THEN 1/)
  })

  test('las OFERTAS del vendedor van segundas', () => {
    // Con el catálogo completo hay cientos de productos: sin esto, lo
    // que el vendedor quería empujar se pierde en el medio.
    assert.match(SQL, /WHEN b\.es_oferta_vendedor\s+THEN 2/,
      'lo que el vendedor ofrece debe SUBIR, no sólo marcarse')
  })

  test('el rubro del cliente va tercero', () => {
    // "productos relacionados a lo que compra o su tipo de negocio".
    assert.match(SQL, /WHEN b\.es_sugerencia\s+THEN 3/)
  })

  test('el resto del catálogo va último, pero VA', () => {
    assert.match(SQL, /ELSE\s+4/)
  })
})
