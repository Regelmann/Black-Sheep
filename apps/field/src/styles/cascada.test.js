/**
 * LA CASCADA — por qué "la UI nunca mejoraba".
 *
 * EL PROBLEMA
 * 7 hojas de CSS, 6.100 líneas, y `.bs-chip` definido en CINCO de
 * ellas. Cada arreglo entraba al final y algo anterior lo pisaba, así
 * que los cambios se aplicaban en el código y no se veían en el
 * teléfono. Tres intentos para cada corrección visual.
 *
 * LA LIMPIEZA (V12.7)
 *   242 bloques que NUNCA se aplicaban  → eliminados
 *   119 !important                      → 15
 *
 * Este test impide que vuelva a crecer. No prohíbe `!important`:
 * prohíbe que se acumule sin control.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const DIR = new URL('.', import.meta.url).pathname
const RAIZ = path.resolve(DIR, '..')

const hojas = [
  ...fs.readdirSync(DIR).filter((f) => f.endsWith('.css')).map((f) => path.join(DIR, f)),
  path.join(RAIZ, 'index.css'),
].filter((p) => fs.existsSync(p))

const leer = (p) => ({ nombre: path.basename(p), css: fs.readFileSync(p, 'utf8') })
const TODAS = hojas.map(leer)

describe('el peso de la cascada no crece', () => {
  test('los !important no superan 25', () => {
    // Eran 119. Cada uno es una regla peleando contra otra hoja: si
    // vuelven a subir, la UI vuelve a ser impredecible.
    const n = TODAS.reduce((s, h) => s + (h.css.match(/!important/g) || []).length, 0)
    assert.ok(n <= 25,
      `${n} !important (el tope es 25). Antes de agregar uno, revisá si ` +
      `la regla que estás peleando todavía hace falta.`)
  })

  test('v90-fixes.css sigue achicándose', () => {
    // Es una hoja de PARCHES: su tamaño es deuda, no diseño.
    const h = TODAS.find((x) => x.nombre === 'v90-fixes.css')
    if (!h) return
    const lineas = h.css.split('\n').length
    assert.ok(lineas <= 780,
      `v90-fixes.css tiene ${lineas} líneas. Era 873. No debería crecer: ` +
      `cada regla acá existe para pelear contra otra hoja.`)
  })

  test('el CSS total no supera 6.500 líneas', () => {
    const n = TODAS.reduce((s, h) => s + h.css.split('\n').length, 0)
    assert.ok(n <= 6500, `${n} líneas de CSS. Objetivo de la Fase 3: bajar de 4.000.`)
  })
})

describe('ningún selector se define en demasiadas hojas', () => {
  test('ninguno aparece en 5 hojas o más', () => {
    // `.bs-chip` llegó a estar en CINCO. Eso hace imposible saber cuál
    // regla gana sin abrir el inspector.
    const mapa = new Map()
    for (const h of TODAS) {
      for (const m of h.css.matchAll(/^\s*([.#][a-zA-Z][\w-]*)[^{]*\{/gm)) {
        if (!mapa.has(m[1])) mapa.set(m[1], new Set())
        mapa.get(m[1]).add(h.nombre)
      }
    }
    const peores = [...mapa.entries()]
      .filter(([, v]) => v.size >= 5)
      .map(([k, v]) => `${k} (${v.size} hojas)`)
    assert.deepEqual(peores, [],
      `estos selectores están repartidos en 5+ hojas: ${peores.join(', ')}`)
  })
})

describe('la identidad no se contradice', () => {
  test('el naranja de KeyFoods no aparece fijo en la plataforma', () => {
    // #c2410c es el color del TENANT. Va por var(--brand), que
    // applyTenantBrand() define. Fijarlo impide que otra empresa use
    // su propio color.
    for (const h of TODAS) {
      // tokens.css DEFINE --brand: ahí el hex es correcto.
      // identidad.css deriva de él. En el resto, fijarlo impide que
      // otro tenant use su color.
      if (['identidad.css','tokens.css'].includes(h.nombre)) continue
      const fijos = (h.css.match(/#c2410c/gi) || []).length
      const conFallback = (h.css.match(/var\(--brand[^)]*#c2410c/gi) || []).length
      assert.equal(fijos - conFallback, 0,
        `${h.nombre} fija el naranja de KeyFoods fuera de var(--brand)`)
    }
  })
})
