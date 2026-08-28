/**
 * PRESUPUESTO DE !important — que la deuda no vuelva a crecer sola
 *
 * DE DÓNDE VIENE
 * `v90-fixes.css` es una capa de parches sobre `index.css`. Cada vez que
 * algo se veía mal en terreno se agregó una regla con !important para
 * ganarle a lo anterior. Llegó a tener 75 de los 139 !important del
 * proyecto.
 *
 * (Un primer conteo dio 71 en total. Estaba mal: el patrón usado no
 * captaba las reglas dentro de bloques anidados. Contar CSS con regex
 * plano subestima; hay que recorrer con una pila de llaves.)
 *
 * El problema no es estético. Un !important en una hoja TEMPRANA derrota
 * a cualquier hoja posterior sin !important, sin importar la
 * especificidad ni el orden. Así fue como `.bs-stat{background:#fff
 * !important}` de esta hoja anuló a identidad.css y dejó las cifras del
 * hero en blanco sobre blanco (1.07:1) en /mapa y /cartera. La hoja de
 * identidad se cargaba última y perdía igual.
 *
 * QUÉ SE HIZO
 * Se midió, para cada !important, si existía alguna declaración
 * competidora en una hoja posterior. 108 no tenían ninguna: eran ruido
 * defensivo. Se quitaron en dos tandas y se comparó el CSS calculado
 * antes/después sobre 4.072 pares selector+propiedad — cero diferencias
 * en ambas. Total: de 139 a 31, todos confinados a v90-fixes.css.
 *
 * Cuatro de esos 45 SÍ hacían falta y el snapshot los atrapó:
 * `.bs-shop-grid` compite con shell.css, que carga después. Se
 * restauraron con un comentario que explica por qué. Ese es exactamente
 * el tipo de error que un `grep -v important` habría metido en
 * producción sin que nadie lo notara.
 *
 * QUÉ FIJA ESTE TEST
 * Un techo por hoja. No prohíbe !important —hay 16 que ganan conflictos
 * reales entre capas— pero obliga a que agregar uno sea deliberado:
 * si el número sube, este test falla y hay que justificarlo acá.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const DIR = import.meta.dirname
const RAIZ = path.join(DIR, '..')

/** Orden real de carga (main.jsx). Define quién puede pisar a quién. */
const HOJAS = [
  { archivo: '../index.css', techo: 0 },
  { archivo: 'v90-fixes.css', techo: 31 },
  { archivo: 'ds-2026.css', techo: 0 },
  { archivo: 'system.css', techo: 0 },
  { archivo: 'v99-ux.css', techo: 0 },
  { archivo: 'shell.css', techo: 0 },
  { archivo: 'identidad.css', techo: 0 },
]

const sinComentarios = t => t.replace(/\/\*[\s\S]*?\*\//g, '')

/** Cuenta declaraciones con !important (no líneas: una línea puede traer varias). */
function contar(css) {
  let n = 0
  for (const b of sinComentarios(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    for (const d of b[2].matchAll(/[a-z-]+\s*:\s*([^;]+)/gi)) {
      if (/!important/i.test(d[1])) n++
    }
  }
  return n
}

describe('presupuesto de !important por hoja', () => {
  for (const { archivo, techo } of HOJAS) {
    test(`${archivo} no pasa de ${techo}`, () => {
      const p = path.join(DIR, archivo)
      if (!fs.existsSync(p)) return
      const n = contar(fs.readFileSync(p, 'utf8'))
      assert.ok(n <= techo,
        `${archivo} tiene ${n} !important (techo ${techo}).\n` +
        'Un !important en una hoja temprana derrota a TODA hoja posterior ' +
        'sin !important: así se rompió el contraste del hero. Antes de ' +
        'subir el techo, comprobá si el conflicto se resuelve con orden de ' +
        'carga o especificidad.')
    })
  }

  test('las capas nuevas se mantienen limpias', () => {
    // identidad.css, shell.css y v99-ux.css cargan al final: no necesitan
    // !important para ganar. Que sigan en cero es la señal de que el
    // rediseño no está peleando con las capas viejas.
    for (const hoja of ['identidad.css', 'shell.css', 'v99-ux.css']) {
      const n = contar(fs.readFileSync(path.join(DIR, hoja), 'utf8'))
      assert.equal(n, 0,
        `${hoja} carga al final y tiene ${n} !important: si necesita ` +
        'forzar, es que una hoja temprana tiene un !important que sobra.')
    }
  })

  test('el total del proyecto no crece', () => {
    const total = HOJAS.reduce((s, { archivo }) => {
      const p = path.join(DIR, archivo)
      return s + (fs.existsSync(p) ? contar(fs.readFileSync(p, 'utf8')) : 0)
    }, 0)
    assert.ok(total <= 31,
      `${total} !important en total (eran 139 antes de la limpieza). ` +
      'El objetivo es que baje, no que suba.')
  })

  test('sólo v90-fixes.css conserva !important', () => {
    // Toda la deuda quedó confinada a la capa de parches. Las demás hojas
    // ganan por orden de carga y especificidad, como corresponde. Que una
    // hoja limpia empiece a necesitar !important es la señal temprana de
    // que v90-fixes está forzando algo que no debería.
    for (const { archivo } of HOJAS) {
      if (archivo === 'v90-fixes.css') continue
      const p = path.join(DIR, archivo)
      if (!fs.existsSync(p)) continue
      assert.equal(contar(fs.readFileSync(p, 'utf8')), 0,
        `${archivo} volvió a usar !important`)
    }
  })
})

describe('los !important que quedan tienen motivo', () => {
  test('.bs-shop-grid conserva el suyo, y explicado', () => {
    // Es el caso que el snapshot rescató: shell.css carga DESPUÉS y lo
    // define como grid de tarjetas; esta capa lo fuerza a lista vertical
    // porque la ficha con foto no entra legible en media pantalla.
    // Si alguien lo quita "para limpiar", el catálogo vuelve a dos
    // columnas sin que ningún test de render lo note.
    const css = fs.readFileSync(path.join(DIR, 'v90-fixes.css'), 'utf8')
    const i = css.indexOf('.bs-shop-grid')
    assert.ok(i > 0, 'falta la regla .bs-shop-grid')
    const bloque = css.slice(i, css.indexOf('}', i))
    assert.match(bloque, /display:\s*flex\s*!important/,
      'sin !important gana shell.css y el catálogo vuelve a la grilla')
    // Y el comentario que lo justifica, en las 12 líneas previas.
    const contexto = css.slice(Math.max(0, i - 700), i)
    assert.match(contexto, /shell\.css/,
      'un !important sin comentario que lo justifique es deuda: explicá ' +
      'contra qué hoja está peleando')
  })

  test('shell.css sigue definiendo .bs-shop-grid como grid', () => {
    // Fija el conflicto que hace necesario el !important de arriba. Si
    // shell.css deja de tocar esta clase, el !important pasa a ser ruido
    // y se puede quitar.
    const shell = fs.readFileSync(path.join(DIR, 'shell.css'), 'utf8')
    assert.match(shell, /\.bs-shop-grid\s*\{[^}]*display:\s*grid/,
      'si shell.css ya no define .bs-shop-grid como grid, el !important ' +
      'de v90-fixes.css sobra: quitalo y actualizá este test')
  })
})

describe('ninguna hoja tardía pelea con una temprana', () => {
  test('identidad.css no necesita forzar nada', () => {
    // La hoja de identidad es la última: si necesitara !important, sería
    // porque una hoja temprana está forzando algo que no debería. Fue
    // exactamente el bug del hero invisible.
    const css = fs.readFileSync(path.join(DIR, 'identidad.css'), 'utf8')
    assert.equal(contar(css), 0)
  })

  test('v90-fixes.css no fuerza colores de fondo de tarjetas de datos', () => {
    // La regla concreta que rompió el contraste:
    // `.bs-stat { background: #fff !important }`. Quedó eliminada y no
    // puede volver: dejaría las cifras del hero en blanco sobre blanco.
    const css = sinComentarios(fs.readFileSync(path.join(DIR, 'v90-fixes.css'), 'utf8'))
    const m = css.match(/\.bs-stat\s*\{([^}]*)\}/)
    if (m) {
      assert.ok(!/background[^;]*!important/i.test(m[1]),
        '.bs-stat vuelve a forzar background: es el bug del hero ' +
        'invisible (1.07:1 en /mapa y /cartera). El fondo lo decide ' +
        'identidad.css según el contexto.')
    }
  })
})