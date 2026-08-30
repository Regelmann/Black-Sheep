/**
 * portalPedidos.test.js — guardas del portal B2B de autoservicio (sql/36).
 *
 * El portal permite que un cliente `anon` vea SUS pedidos y reordene. Lo que
 * se puede fijar sin una base real:
 *   1. Las funciones existen una sola vez (R8 en una corrida completa; acá se
 *      fija la relación con 21).
 *   2. Son SECURITY DEFINER (el cliente es anon → corre como owner).
 *   3. Aíslan por `cliente_key` de la oferta (no por un id que pase el cliente).
 *   4. `reordenar_pedido_publico` verifica que el pedido sea del mismo cliente.
 *   5. `crear_pedido_publico` (21) guarda el `token_catalogo` (portal por token).
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const RAiz = path.resolve(import.meta.dirname, '..', '..', '..', '..')
const sql36 = fs.readFileSync(path.join(RAiz, 'sql', '39_PORTAL_PEDIDOS.sql'), 'utf8')
const sql21 = fs.readFileSync(path.join(RAiz, 'sql', '21_PEDIDO_PUBLICO_CANONICO.sql'), 'utf8')

const contar = (re, texto) => [...texto.matchAll(re)].length
const bloqueDe = (sql, fn) => {
  const inicio = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${fn}`)
  const resto = sql.slice(inicio)
  const siguiente = resto.slice(1).search(/CREATE (OR REPLACE )?FUNCTION|CREATE (OR REPLACE )?TRIGGER/)
  const fin = siguiente === -1 ? -1 : siguiente + 2
  return fin === -1 ? resto : resto.slice(0, fin)
}

describe('Portal B2B · invariantes del SQL 36', () => {
  test('get_pedidos_publicos existe una vez y es SECURITY DEFINER', () => {
    assert.equal(contar(/create\s+or\s+replace\s+function\s+public\.get_pedidos_publicos\b/gi, sql36), 1)
    const b = bloqueDe(sql36, 'get_pedidos_publicos')
    assert.match(b, /SECURITY DEFINER/, 'debe correr como owner (cliente anon)')
    assert.match(b, /cliente_key/, 'debe aislar por cliente_key de la oferta')
    assert.match(b, /fuente = 'catalogo_publico'/, 'debe listar pedidos del catálogo público')
  })

  test('reordenar_pedido_publico verifica pertenencia del cliente', () => {
    assert.equal(contar(/create\s+or\s+replace\s+function\s+public\.reordenar_pedido_publico\b/gi, sql36), 1)
    const b = bloqueDe(sql36, 'reordenar_pedido_publico')
    assert.match(b, /SECURITY DEFINER/, 'debe correr como owner')
    // El pedido debe resolverse por id Y cliente_key de la oferta.
    assert.match(b, /p\.cliente_key = v_oferta\.cliente_key/, 'no se puede reordenar el pedido de otra empresa')
    assert.match(b, /crear_pedido_publico\(/, 'debe reusar la función canónica (revalida precios)')
  })

  test('no redefine funciones de 21/34 (R8)', () => {
    for (const fn of ['crear_pedido_publico', 'get_public_catalogo', 'guardar_push_suscripcion', 'borrar_push_suscripcion']) {
      assert.equal(
        contar(new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${fn}\\b`, 'gi'), sql36),
        0,
        `36 no debe redefinir ${fn}()`
      )
    }
  })
})

describe('crear_pedido_publico guarda el token (portal por token)', () => {
  test('el INSERT de 21 incluye token_catalogo', () => {
    assert.match(
      sql21,
      /token_catalogo/,
      '21 debe persistir el token_catalogo para poder consultar el historial por token'
    )
  })
})
