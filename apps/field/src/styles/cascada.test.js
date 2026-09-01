/**
 * LA CASCADA — y la lección de V12.7.
 *
 * 🔴 LO QUE HICE MAL
 * En V12.7 borré 242 bloques de CSS con este criterio:
 *
 *   "si el selector aparece en una hoja posterior, este bloque nunca
 *    se aplica → se puede borrar"
 *
 * **Está mal.** La cascada de CSS es por PROPIEDAD, no por selector:
 *
 *   hoja A:  .bs-seg-btn { color: #fff; font-weight: 700 }
 *   hoja B:  .bs-seg-btn { padding: 0 10px }
 *
 * La hoja B no pisa el color: sólo agrega padding. Borrar el bloque de
 * A porque "B lo redefine" borra el color, y el botón queda con texto
 * invisible sobre naranja.
 *
 * Eso fue exactamente lo que se vio en producción: las pastillas de
 * zona sin texto, la barra inferior sin etiquetas, el contenido
 * desbordado.
 *
 * REVERTIDO. Este test ya no exige una limpieza agresiva: vigila que
 * la cascada no EMPEORE, que es lo que sí se puede hacer sin romper.
 *
 * LA LIMPIEZA CORRECTA, cuando se haga, tiene que comparar propiedad
 * por propiedad y verificarse con capturas de pantalla, no sólo con
 * tests unitarios: ninguno de los 544 detectó que la UI se había roto.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = fileURLToPath(new URL('.', import.meta.url))
const RAIZ = path.resolve(DIR, '..')
const hojas = [
  ...fs.readdirSync(DIR).filter((f) => f.endsWith('.css')).map((f) => path.join(DIR, f)),
  path.join(RAIZ, 'index.css'),
].filter((p) => fs.existsSync(p))
const TODAS = hojas.map((p) => ({ nombre: path.basename(p), css: fs.readFileSync(p, 'utf8') }))

describe('la cascada no empeora', () => {
  test('los !important no superan 170', () => {
    // Son 154. El objetivo sigue siendo bajarlos, pero por consolidación
    // real —mover reglas a una hoja— no borrando bloques a ciegas.
    const n = TODAS.reduce((s, h) => s + (h.css.match(/!important/g) || []).length, 0)
    assert.ok(n <= 170, `${n} !important. No deberían crecer.`)
  })

  test('el CSS total no supera 7.600 líneas', () => {
    const n = TODAS.reduce((s, h) => s + h.css.split('\n').length, 0)
    assert.ok(n <= 7600, `${n} líneas. Objetivo de largo plazo: bajar de 4.000.`)
  })

  test('no se agregan hojas nuevas sin consolidar antes', () => {
    // Cada hoja nueva es una capa más de cascada que pelea con las otras.
    assert.ok(TODAS.length <= 12,
      `${TODAS.length} hojas de CSS. Antes de sumar otra, consolidá dos.`)
  })
})

describe('la identidad no se contradice', () => {
  test('el naranja de KeyFoods sólo va por var(--brand)', () => {
    // #c2410c es el color del TENANT. Fijarlo impide que otra empresa
    // use el suyo: el catálogo del próximo cliente saldría naranja
    // KeyFoods.
    for (const h of TODAS) {
      // tokens.css DEFINE la variable; identidad.css deriva de ella.
      if (['identidad.css', 'tokens.css'].includes(h.nombre)) continue
      const fijos = (h.css.match(/#c2410c/gi) || []).length
      const conVar = (h.css.match(/var\(--brand[^)]*#c2410c/gi) || []).length
      assert.equal(fijos - conVar, 0,
        `${h.nombre} fija #c2410c fuera de var(--brand): rompe el multi-tenant`)
    }
  })
})
