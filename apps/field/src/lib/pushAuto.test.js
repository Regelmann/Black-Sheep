/**
 * pushAuto.js — guardas del envío AUTOMÁTICO de Web Push (sql/35).
 *
 * Es imposible probar un trigger de Postgres acá; lo que sí se puede es
 * fijar las invariantes del SQL para que el archivo 35 no se rompa en
 * silencio:
 *   1. No redefine funciones ya existentes (R8 del guard lo cubre en una
 *      corrida completa; acá se fija la relación con 34).
 *   2. `enviar_push_catalogo` existe, es SECURITY DEFINER y usa `net.http_post`.
 *   3. `sugerir_reposicion_catalogo` existe (el "qué decirle" del aviso).
 *   4. El trigger se arma sobre `ofertas_cliente` y sólo en `activo`.
 *   5. La config `push_config` trae la URL y el token (sin estos, todo falla).
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

// import.meta.dirname = apps/field/src/lib → subimos 4 al repo root.
const RAiz = path.resolve(import.meta.dirname, '..', '..', '..', '..')
const sqlPath = path.join(RAiz, 'sql', '38_PUSH_AUTO.sql')
const sql = fs.readFileSync(sqlPath, 'utf8')

function contar(re, texto) {
  return [...texto.matchAll(re)].length
}

describe('Envío automático de push · invariantes del SQL 35', () => {
  test('no redefine funciones de 34', () => {
    // 34 ya crea guardar_push_suscripcion / borrar_push_suscripcion.
    // Si 35 las vuelve a definir con create or replace, el guard R8 lo marca.
    for (const fn of ['guardar_push_suscripcion', 'borrar_push_suscripcion']) {
      const re = new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${fn}\\b`, 'gi')
      assert.equal(
        contar(re, sql), 0,
        `35 no debe redefinir ${fn}() (ya vive en 34)`
      )
    }
  })

  test('define enviar_push_catalogo una vez y es SECURITY DEFINER', () => {
    const defs = contar(/create\s+or\s+replace\s+function\s+public\.enviar_push_catalogo\b/gi, sql)
    assert.equal(defs, 1, 'enviar_push_catalogo debe definirse EXACTAMENTE una vez')
    // Aislar el bloque de esa función: desde su CREATE hasta el siguiente
    // CREATE <...> (no usar la palabra "sugerir_..." como delimitador, porque
    // aparece en el comentario de cabecera ANTES de la definición).
    const inicio = sql.indexOf('CREATE OR REPLACE FUNCTION public.enviar_push_catalogo')
    // Delimitar por el PRÓXIMO CREATE — no por la propia función (buscar la
    // siguiente al omitir el índice actual).
    const resto = sql.slice(inicio)
    const siguiente = resto.slice(1).search(/CREATE (OR REPLACE )?FUNCTION|CREATE (OR REPLACE )?TRIGGER/)
    const fin = siguiente === -1 ? -1 : siguiente + 2
    const bloque = fin === -1 ? resto : resto.slice(0, fin)
    assert.match(bloque, /SECURITY DEFINER/, 'debe correr como owner (el cliente es anon)')
    assert.match(bloque, /net\.http_post/, 'el envío debe ir por pg_net (asíncrono)')
    assert.match(bloque, /x-internal-token/, 'debe mandar el token interno a la Edge Function')
  })

  test('define sugerir_reposicion_catalogo (motor de reposición)', () => {
    const defs = contar(/create\s+or\s+replace\s+function\s+public\.sugerir_reposicion_catalogo\b/gi, sql)
    assert.equal(defs, 1, 'sugerir_reposicion_catalogo debe definirse una vez')
    assert.match(sql, /ventas_lineas/, 'debe leer ventas reales para el ritmo')
    assert.match(sql, /cobertura_dias/, 'debe usar la cobertura de stock')
  })

  test('crea el trigger sobre ofertas_cliente y sólo en activo', () => {
    assert.match(sql, /CREATE TRIGGER[\s\S]*ON public\.ofertas_cliente/, 'el trigger debe apuntar a ofertas_cliente')
    assert.match(sql, /UPDATE OF activo/, 'debe dispararse en el cambio de activo (publicar)')
    // No debe haber trigger por cada item: no queremos spam en altas masivas.
    assert.ok(
      !/oferta_cliente_items/i.test(sql.match(/CREATE TRIGGER[\s\S]*EXECUTE FUNCTION/)?.[0] || ''),
      'el trigger no debe vivir en oferta_cliente_items (spam por item)'
    )
  })

  test('la config push_config trae URL y token (sin esto nada funciona)', () => {
    assert.match(sql, /edge_function_url/, 'debe existir la clave de URL')
    assert.match(sql, /internal_token/, 'debe existir la clave del token interno')
  })
})
