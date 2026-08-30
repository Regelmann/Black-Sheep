/**
 * La app se usa de pie, en la calle, con una mano y a veces con el
 * teléfono a medio guardar. Un control de 32 px se falla seguido: el
 * dedo tapa el objetivo y no hay forma de apuntar mejor.
 *
 * 44 px es el mínimo que recomiendan tanto Apple (Human Interface
 * Guidelines) como el criterio 2.5.8 de WCAG 2.2 para objetivos táctiles.
 * No es una cifra estética: por debajo de eso la tasa de error sube de
 * golpe.
 *
 * Estos tests fijan el piso para los controles que el vendedor toca de
 * verdad. Se excluye lo decorativo (puntos de color, iconos dentro de un
 * botón ya grande), que no es un objetivo táctil.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const RAIZ = path.resolve(import.meta.dirname, '..', '..')

const HOJAS = [
  'src/index.css',
  'src/styles/v90-fixes.css',
  'src/styles/ds-2026.css',
  'src/styles/system.css',
  'src/styles/v99-ux.css',
  'src/styles/shell.css',
  'src/styles/identidad.css',
]

const MINIMO = 44

/**
 * Controles que el usuario toca. Se listan a mano en vez de adivinar por
 * el nombre: `.bs-zone-chip-dot` contiene "chip" y es un punto de 7 px
 * puramente decorativo.
 */
const TACTILES = [
  '.bs-chip',
  '.bs-seg-btn',
  '.bs-sync-btn',
  '.bs-tray-toggle',
  '.bs-stock-buyers-btn',
  '.bs-visit-outcomes button',
  '.bs-pedido-secondary button',
  '.bs-shop-qty button',
  '.cli-acciones .acc-btn',
  '.nav-item',
  '.bs-confirm-actions button',
]

const leer = (p) => fs.readFileSync(path.join(RAIZ, p), 'utf8')

/** Alto efectivo de un selector, resolviendo la cascada por orden de
 *  importación (mismo criterio que el navegador ante igual especificidad). */
function altoDe(selector) {
  let alto = null
  for (const hoja of HOJAS) {
    const css = leer(hoja).replace(/\/\*[\s\S]*?\*\//g, '')
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const sels = m[1].split(',').map((s) => s.trim().replace(/\s+/g, ' '))
      if (!sels.includes(selector)) continue
      const mh = m[2].match(/min-height:\s*([\d.]+)px/)
      const h = m[2].match(/(?:^|;)\s*height:\s*([\d.]+)px/)
      if (mh) alto = Number(mh[1])
      else if (h) alto = Number(h[1])
    }
  }
  return alto
}

describe('táctil · los controles se pueden tocar con el pulgar', () => {
  for (const sel of TACTILES) {
    test(`${sel} llega a ${MINIMO}px`, () => {
      const alto = altoDe(sel)
      assert.notEqual(
        alto,
        null,
        `${sel} no declara alto en ninguna hoja: no se puede garantizar ` +
          'el área táctil',
      )
      assert.ok(
        alto >= MINIMO,
        `${sel} mide ${alto}px y el mínimo es ${MINIMO}px`,
      )
    })
  }

  /**
   * Un control puede medir 44 px y aun así ser imposible de acertar si el
   * de al lado está pegado. WCAG pide 44 px de objetivo O separación
   * equivalente; acá se exige separación mínima entre chips.
   */
  test('los chips no quedan pegados entre sí', () => {
    const css = HOJAS.map(leer).join('\n').replace(/\/\*[\s\S]*?\*\//g, '')
    const bloque = css.slice(css.indexOf('.bs-filterbar-scroller'))
    const gap = bloque.match(/gap:\s*([\d.]+)px/)
    assert.ok(gap, 'la fila de chips debe declarar gap')
    assert.ok(
      Number(gap[1]) >= 6,
      `gap de ${gap[1]}px entre chips: muy poco para el dedo`,
    )
  })
})