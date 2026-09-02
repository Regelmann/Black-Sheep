/**
 * Regresión de los handlers del outbox.
 *
 * EL BUG QUE ORIGINÓ ESTE ARCHIVO
 * `handleCompletar()` referenciaba una variable `data` inexistente en su
 * scope. Llegó por un reemplazo de texto que asumió que la función
 * anterior a `handleNota` era `handleCheckin`; era `handleCompletar`, y
 * el bloque de confirmación aterrizó en la función equivocada.
 *
 * Consecuencia en terreno:
 *   1. Visita.jsx encola 'completar' SOLO sin señal → camino 100% offline
 *   2. flushActionQueue envuelve el handler en try/catch
 *   3. El ReferenceError se convierte en fail++ y el item vuelve a la cola
 *   4. Las escrituras a Supabase YA se ejecutaron: la base queda bien
 *   5. La cola reintenta 25 veces algo ya aplicado y el banner de
 *      "pendiente de sincronizar" no se va nunca
 *
 * Ningún test lo tocaba. El guard no evalúa scope. ESLint no estaba
 * instalado. Se agrega el test Y la herramienta.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const SRC = path.dirname(fileURLToPath(import.meta.url))
const código = readFileSync(path.join(SRC, 'syncHandlers.js'), 'utf8')

/** Extrae el cuerpo de una función exportada por nombre. */
function cuerpoDe(nombre) {
  const i = código.indexOf(`export async function ${nombre}`)
  assert.ok(i >= 0, `no existe ${nombre}`)
  const resto = código.slice(i)
  const fin = resto.indexOf('\nexport ', 1)
  return fin > 0 ? resto.slice(0, fin) : resto
}

describe('syncHandlers · scope', () => {
  test('handleCompletar no usa variables de otro handler', () => {
    const f = cuerpoDe('handleCompletar')
    // `data` sólo se declara en handleCheckin. Si aparece acá sin
    // declararse, es el ReferenceError que rompía el cierre de visita.
    const declara = /const\s*\{[^}]*\bdata\b[^}]*\}\s*=/.test(f) || /\bconst\s+data\b/.test(f)
    const usa = /[^.\w]data\s*[.[]/.test(f) || /!\s*data\b/.test(f)
    assert.ok(!usa || declara, 'handleCompletar usa `data` sin declararla')
  })

  test('cada handler exportado declara lo que usa', () => {
    const nombres = [...código.matchAll(/export async function (handle\w+)/g)].map(m => m[1])
    assert.ok(nombres.length >= 4, 'deberían existir al menos 4 handlers')

    for (const n of nombres) {
      const f = cuerpoDe(n)
      for (const v of ['data', 'error', 'row']) {
        const usa = new RegExp(`[^.\\w]${v}\\s*[.[]|!\\s*${v}\\b`).test(f)
        if (!usa) continue
        const declara = new RegExp(`(const|let|var)\\s+(\\{[^}]*\\b${v}\\b[^}]*\\}|${v}\\b)`).test(f)
        assert.ok(declara, `${n} usa "${v}" sin declararla`)
      }
    }
  })

  test('handleNota y handlePedido mandan client_op_id (índice de 27)', () => {
    // El índice único de 27_IDEMPOTENCIA.sql es parcial: varios NULL
    // no colisionan. Insertar el payload crudo = duplicar al reintentar.
    for (const n of ['handleNota', 'handlePedido', 'handleNoVenta']) {
      const f = cuerpoDe(n)
      assert.ok(
        /client_op_id/.test(f),
        `${n} no adjunta client_op_id — un reintento duplica la fila`
      )
      assert.ok(
        /23505|esDuplicadoIdempotente/.test(f),
        `${n} no trata 23505 como éxito — la cola reintenta para siempre`
      )
    }
  })

  test('todo handler devuelve un objeto con ok', () => {
    const nombres = [...código.matchAll(/export async function (handle\w+)/g)].map(m => m[1])
    for (const n of nombres) {
      const f = cuerpoDe(n)
      // Acepta `return { ok: … }` y también el ternario
      // `return error ? { ok:false } : { ok:true }`, que es la forma
      // que usa handleNota. La versión anterior de esta regla sólo
      // buscaba `return {` literal y daba falso positivo.
      assert.ok(/return[^;]*\{\s*ok\s*:/.test(f), `${n} no devuelve { ok: … }`)
      // `return true` a secas revive la ambigüedad que costó check-ins.
      assert.ok(!/return\s+true\s*$/m.test(f), `${n} devuelve boolean suelto`)
    }
  })
})
