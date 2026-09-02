/**
 * Notas de terreno: una sola puerta, nunca insert directo.
 *
 * EL BUG
 * NotaRapidaMap insertaba en notas_cliente, ignoraba `error` y
 * mostraba "Guardada". Sin señal la nota se perdía. Tampoco mandaba
 * client_op_id, así que un reintento del outbox duplicaba.
 *
 * No se importa nota.js: arrastra supabase-js y el test dejaría de
 * correr en entornos sin node_modules (el mismo patrón que el resto
 * de tests de fuente).
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const SRC = path.dirname(fileURLToPath(import.meta.url))
const raizSrc = path.resolve(SRC, '..')
const leer = (rel) => readFileSync(path.join(raizSrc, rel), 'utf8')

describe('guardarNotaTerreno · contrato', () => {
  test('encola con el mismo client_op_id del insert', () => {
    const src = leer('lib/nota.js')
    assert.ok(/export async function guardarNotaTerreno/.test(src))
    assert.ok(/enqueueAction\(\s*\{\s*type:\s*'nota'/.test(src))
    assert.ok(/client_op_id:\s*opId/.test(src))
    assert.ok(/23505/.test(src), 'un duplicado es éxito, no error')
  })

  test('armarFilaNota pone client_op_id en la fila', () => {
    const src = leer('lib/nota.js')
    assert.ok(/export function armarFilaNota/.test(src))
    assert.ok(/client_op_id:\s*opts\.clientOpId/.test(src))
  })
})

describe('escrituras de nota · pasan por guardarNotaTerreno', () => {
  const CALLERS = [
    'pages/Ruta.jsx',
    'pages/Visita.jsx',
    'pages/Cartera.jsx',
    'domain/NotaModal.jsx',
  ]

  test('ningún caller de terreno inserta directo en notas_cliente', () => {
    for (const f of CALLERS) {
      const src = leer(f)
      assert.ok(
        /guardarNotaTerreno/.test(src),
        `${f} no usa guardarNotaTerreno`
      )
      assert.ok(
        !/supabase\.from\(\s*['"]notas_cliente['"]\s*\)\s*\.insert/.test(src),
        `${f} todavía inserta directo — offline pierde la nota`
      )
    }
  })

  test('NotaRapidaMap no miente con Guardada si el insert falla', () => {
    const ruta = leer('pages/Ruta.jsx')
    const i = ruta.indexOf('function NotaRapidaMap')
    assert.ok(i >= 0)
    const f = ruta.slice(i)
    assert.ok(/guardarNotaTerreno/.test(f))
    assert.ok(/r\.ok/.test(f), 'tiene que mirar el resultado antes de decir Guardada')
  })
})
