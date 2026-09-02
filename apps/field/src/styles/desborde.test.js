/**
 * DESBORDE HORIZONTAL — el bug que se arregló mal tres veces.
 *
 * SÍNTOMA
 * La barra inferior se veía cortada ("ntes Stock Más") y el contenido
 * de la derecha desaparecía: "$288.23", "Oferta del d", el botón de
 * WhatsApp a medias.
 *
 * CAUSA
 * Sangrados `margin: 0 -14px` sin un contenedor que los contenga.
 * Empujan la página fuera del viewport, el navegador ensancha el
 * documento, y todo lo `position: fixed` se posiciona contra ESE ancho
 * — no contra el de la pantalla. La navbar estaba completa, sólo que
 * corrida fuera del teléfono.
 *
 * POR QUÉ SE ARREGLÓ MAL ANTES
 * V9.9.7: escribí CSS para `.bs-tabbar` y `.bs-bottomnav`, clases que
 *   no existen en este proyecto. La real es `.navbar`.
 * V10.0.1: corregí el box-sizing de `.navbar`, pero el desborde venía
 *   de otro lado, así que el síntoma siguió.
 *
 * Este test verifica la CAUSA, no el síntoma.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const DIR = new URL('.', import.meta.url).pathname
const hojas = fs.readdirSync(DIR)
  .filter((f) => f.endsWith('.css'))
  .map((f) => ({ nombre: f, css: fs.readFileSync(path.join(DIR, f), 'utf8') }))
const TODO = hojas.map((h) => h.css).join('\n')

describe('el documento no puede ser más ancho que la pantalla', () => {
  test('html y body están limitados', () => {
    assert.match(TODO, /html,\s*body\s*\{[^}]*max-width:\s*100%/s,
      'sin max-width, cualquier hijo puede ensanchar el documento')
  })

  test('el desborde se contiene con clip, NO con hidden', () => {
    // `overflow-x: hidden` en un ancestro rompe `position: sticky` de
    // sus descendientes: el header dejaría de pegarse arriba.
    // Puede haber varias reglas html,body en la cascada: la que manda
    // es la ÚLTIMA. Se juntan todas.
    const bloques = [...TODO.matchAll(/html,\s*body\s*\{([^}]*)\}/gs)]
      .map((m) => m[1]).join('\n')
    assert.match(bloques, /overflow-x:\s*clip/,
      'usar clip: hidden rompe el sticky del header')

  })

  test('los contenedores de página también contienen', () => {
    assert.match(TODO, /\.bs-shell[^{]*\{[^}]*overflow-x:\s*clip/s)
  })
})

describe('la barra inferior se mide contra la pantalla', () => {
  const nav = TODO.match(/^\.navbar\s*\{[^}]*\}/ms)
  const reglas = [...TODO.matchAll(/\.navbar\s*\{([^}]*)\}/gs)].map((m) => m[1]).join('\n')

  test('existe una regla para .navbar (la clase REAL del proyecto)', () => {
    assert.ok(reglas.length > 0,
      'en V9.9.7 se escribió CSS para .bs-tabbar y .bs-bottomnav, que no existen')
  })

  test('no se centra con translateX sobre un ancho del 100%', () => {
    // width:100% + padding + translateX(-50%) fue la combinación que
    // sacaba el primer ítem fuera de la pantalla.
    assert.match(reglas, /transform:\s*none/,
      'el centrado va por margin-inline, no por translate')
  })

  test('tiene box-sizing: border-box', () => {
    assert.match(reglas, /box-sizing:\s*border-box/,
      'sin esto, width:100% + padding es más ancho que la pantalla')
  })
})

describe('nada usa 100vw sin protección', () => {
  test('100vw incluye la barra de scroll y desborda', () => {
    for (const h of hojas) {
      const malos = [...h.css.matchAll(/(?<!max-)width:\s*100vw/g)]
      assert.equal(malos.length, 0,
        `${h.nombre} usa width:100vw — incluye el ancho de la barra de ` +
        `scroll, así que la página queda más ancha que el viewport. Usar 100%.`)
    }
  })
})

describe('los sangrados negativos siguen permitidos', () => {
  test('margin negativo existe (es una técnica válida)', () => {
    // No se prohíben: sirven para que un bloque llegue de borde a borde.
    // Lo que hacía falta era CONTENERLOS, no eliminarlos.
    assert.match(TODO, /margin:\s*0\s+-\d+px/,
      'si desaparecieron, los heros perdieron el sangrado de borde a borde')
  })
})
