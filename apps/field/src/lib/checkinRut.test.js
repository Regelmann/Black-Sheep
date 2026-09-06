/**
 * EL "ERROR AL SINCRONIZAR" QUE SE VEÍA EN TODA LA APP.
 *
 * De la consola, en producción:
 *
 *   POST /rest/v1/checkins 400 (Bad Request)
 *   invalid input syntax for type uuid: "76491307-C"
 *   [outbox] agotado tras 8 intentos: checkin
 *
 * `"76491307-C"` es un cliente_key —un RUT— llegando a `visita_id`,
 * que es UUID. Postgres lo rechaza SIEMPRE, así que el outbox lo
 * reintentaba 8 veces, lo mandaba a la bandeja de agotados, y el banner
 * rojo quedaba pegado en Hoy, Clientes, Mapa y Visita.
 *
 * Había una guarda `esRut()`, pero su patrón exigía que el dígito
 * verificador fuera un número o `k`. El `-C` de este proyecto se
 * colaba.
 *
 * EL CRITERIO CORRECTO ES AL REVÉS: lo que no tiene forma de UUID no
 * puede ir a una columna UUID.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = path.dirname(fileURLToPath(import.meta.url))
const src = fs.readFileSync(path.join(DIR, 'syncHandlers.js'), 'utf8')

/** Misma lógica que el handler, para poder ejercitarla. */
const esUuid = (v) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || '').trim())
const esRut = (v) => {
  if (!v) return false
  const t = String(v).trim()
  return !esUuid(t) && /^[\d.]{5,12}-?[\dA-Za-z]$/.test(t)
}

describe('el RUT nunca llega a una columna UUID', () => {
  test('🔴 "76491307-C" se reconoce como RUT', () => {
    // El caso EXACTO de producción. Con la guarda anterior daba false.
    assert.equal(esRut('76491307-C'), true)
  })

  test('los verificadores numéricos también', () => {
    assert.equal(esRut('77665074-9'), true)
  })

  test('la K clásica sigue funcionando', () => {
    assert.equal(esRut('12345678-k'), true)
    assert.equal(esRut('12345678-K'), true)
  })

  test('cualquier letra como verificador cuenta', () => {
    // El ERP de este cliente usa letras que no son K. Si el patrón las
    // excluye, vuelve el bug.
    for (const l of ['A', 'C', 'J', 'Z']) {
      assert.equal(esRut(`76491307-${l}`), true, `verificador ${l}`)
    }
  })

  test('un UUID real NO se confunde con un RUT', () => {
    // Si esto fallara, los check-ins legítimos irían a cliente_key y se
    // perdería el vínculo con la visita.
    assert.equal(esRut('a7f51e74-c4c1-4d35-ab70-388f510fe8ca'), false)
  })

  test('vacío, null y undefined no son RUT', () => {
    assert.equal(esRut(''), false)
    assert.equal(esRut(null), false)
    assert.equal(esRut(undefined), false)
  })
})

describe('el handler desvía en vez de fallar', () => {
  test('un RUT en visita_id se manda a cliente_key', () => {
    assert.match(src, /visita_id:\s*esRut\(p\.visita_id\)\s*\?\s*null/,
      'si el RUT sigue yendo a visita_id, Postgres devuelve 400 en cada reintento')
    assert.match(src, /cliente_key:\s*p\.cliente_key\s*\|\|\s*\(esRut/,
      'el RUT tiene que terminar en cliente_key, que es su lugar')
  })

  test('la detección se basa en el formato UUID, no en el verificador', () => {
    assert.match(src, /function esUuid/,
      'el criterio debe ser "no tiene forma de UUID", no "termina en dígito o k"')
  })

  test('client_op_id viaja: sin él el reintento duplica', () => {
    assert.match(src, /client_op_id:/)
  })
})

describe('la tabla tiene que aceptar lo que el handler manda', () => {
  test('sql/43 agrega cliente_key a checkins', () => {
    // El segundo error de la consola:
    //   PGRST204 — Could not find the 'cliente_key' column of 'checkins'
    // Sin la columna, desviar el RUT no sirve de nada.
    const raiz = path.resolve(DIR, '..', '..', '..', '..')
    const sql = fs.readFileSync(path.join(raiz, 'sql', '43_CHECKINS_COLUMNAS.sql'), 'utf8')
    assert.match(sql, /ADD COLUMN IF NOT EXISTS cliente_key TEXT/,
      'cliente_key debe ser TEXT: un RUT no es un uuid')
    assert.match(sql, /idx_checkins_client_op/,
      'sin índice único el reintento duplica el check-in')
  })
})
