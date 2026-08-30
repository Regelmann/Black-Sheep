/**
 * DEFECTOS VISTOS EN CAPTURAS DE PRODUCCIÓN (v10.6)
 *
 * Ninguno de estos lo detectaron los 528 tests que ya existían, porque
 * todos son de cascada CSS: el JSX era correcto, los componentes
 * montaban, el contraste daba AA. Lo que fallaba era dónde terminaba
 * cada caja en la pantalla y qué apariencia heredaba.
 *
 * Cada test de acá nombra lo que se veía mal en la captura. Se resuelve
 * la cascada igual que el navegador (!important > especificidad >
 * orden), sobre las hojas concatenadas en el orden real de main.jsx.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const DIR = import.meta.dirname
/* Mismo orden que los imports de main.jsx. */
const HOJAS = ['index.css', 'v90-fixes.css', 'ds-2026.css', 'system.css',
  'v99-ux.css', 'shell.css', 'identidad.css', 'midia.css', 'arreglos-ux.css']

const css = HOJAS.map(h => {
  const p = path.join(DIR, h)
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : ''
}).join('\n')

/**
 * Bloques {..} cuyo selector coincide, en orden de cascada.
 *
 * El primer intento usaba un solo regex sobre el selector y fallaba en
 * silencio: `.bs-offline-pill` devolvía 1 de 3 bloques y cualquier
 * selector con `>` devolvía 0, así que los tests "pasaban" leyendo
 * nada. Ahora se trocea el CSS en reglas y se compara la lista de
 * selectores de cada una.
 */
function reglas() {
  const out = []
  // Fuera comentarios: pueden traer llaves y rompen el troceo.
  const limpio = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const re = /([^{}]+)\{([^{}]*)\}/g
  let m
  while ((m = re.exec(limpio))) {
    const sels = m[1].split(',').map(x => x.replace(/\s+/g, ' ').trim()).filter(Boolean)
    out.push({ sels, cuerpo: m[2] })
  }
  return out
}
const REGLAS = reglas()

function bloques(selector) {
  const objetivo = selector.replace(/\s+/g, ' ').trim()
  return REGLAS.filter(r => r.sels.includes(objetivo)).map(r => r.cuerpo)
}

/** Último valor declarado de una propiedad: el que gana a igual especificidad. */
function valorFinal(selector, prop) {
  let val = null
  for (const b of bloques(selector)) {
    const re = new RegExp(`(^|;)\\s*${prop}\\s*:\\s*([^;]+)`, 'g')
    let m
    while ((m = re.exec(b))) val = m[2].trim()
  }
  return val
}

describe('la píldora "sin conexión" no puede tapar el header', () => {
  // En la captura, "Sin conexión · los cambios se guardan y se envían
  // después" cae justo encima de "Hola, Seba…" y de los chips de zona.
  // El vendedor no puede ni leer ni tocar el selector de zona.
  test('queda por debajo del header, no encima', () => {
    const top = valorFinal('.bs-offline-pill', 'top')
    assert.ok(top, 'sin regla de top la píldora se pega arriba de todo')
    /* El valor es un calc() con env(safe-area-inset-top): lo que importa
       es el desplazamiento fijo que se le suma. El primer intento de
       este test hacía replace(env(...), '0px') y después tomaba el
       PRIMER número del string, que era justamente ese 0 inyectado: el
       test fallaba con el CSS correcto. */
    const sinEnv = top.replace(/env\([^)]*\)/g, '')
    const numeros = [...sinEnv.matchAll(/(\d+(?:\.\d+)?)px/g)].map(x => Number(x[1]))
    const desplazamiento = Math.max(0, ...numeros)
    assert.ok(desplazamiento >= 64,
      `top efectivo "${top}" → ${desplazamiento}px: el header mide ~64px, ` +
      'cualquier valor menor lo tapa')
  })

  test('el texto largo envuelve en vez de cortarse', () => {
    // Con white-space:nowrap el mensaje se sale de la pantalla.
    assert.equal(valorFinal('.bs-offline-pill', 'white-space'), 'normal')
  })

  test('no se mete por encima de los diálogos', () => {
    // Un aviso o un confirm tienen que poder taparla.
    const z = Number(valorFinal('.bs-offline-pill', 'z-index'))
    assert.ok(z < 500, `z-index ${z}: los modales viven en 500 y los avisos en 620`)
  })
})

describe('los botones secundarios del pedido tienen que parecer botones', () => {
  // En la captura salen como los botones grises por defecto del
  // navegador —"Guardar | PDF | WhatsApp cliente" pegados, con el texto
  // cortado— debajo de un pedido de $577.600.
  for (const prop of ['border-radius', 'background', 'border', 'font-family']) {
    test(`define ${prop}`, () => {
      assert.ok(valorFinal('.bs-pedido-secondary button', prop),
        `sin ${prop} el botón se ve como HTML crudo`)
    })
  }

  test('están separados entre sí', () => {
    assert.ok(valorFinal('.bs-pedido-secondary', 'gap'),
      'sin gap los tres botones quedan pegados')
  })

  test('siguen siendo tocables con el pulgar', () => {
    const h = valorFinal('.bs-pedido-secondary button', 'min-height')
    assert.ok(h && parseInt(h, 10) >= 44, `min-height ${h}: el mínimo táctil es 44px`)
  })
})

describe('el bloque ANÁLISIS tiene que leerse', () => {
  // En la captura se lee "MTD$1.152.920" y "En riesgo$38.431": el
  // <em> y el <strong> son inline y quedan pegados.
  test('la etiqueta va arriba del número, no al lado', () => {
    assert.equal(valorFinal('.bs-client-intel-grid > div', 'flex-direction'), 'column',
      'sin apilar, la etiqueta y la cifra se pegan: "MTD$1.152.920"')
  })

  test('la etiqueta se distingue del número', () => {
    const et = valorFinal('.bs-client-intel-grid em', 'font-size')
    const nu = valorFinal('.bs-client-intel-grid strong', 'font-size')
    assert.ok(parseInt(et, 10) < parseInt(nu, 10),
      `etiqueta ${et} vs número ${nu}: la cifra tiene que dominar`)
  })

  test('las cifras se alinean como columna de números', () => {
    assert.equal(valorFinal('.bs-client-intel-grid strong', 'font-variant-numeric'),
      'tabular-nums')
  })

  test('el color se reserva para el riesgo, no para todo', () => {
    // Cuatro cifras en cuatro colores no jerarquizan nada.
    const risk = valorFinal('.bs-client-intel-grid .risk strong', 'color')
    const opp = valorFinal('.bs-client-intel-grid .opp strong', 'color')
    assert.ok(risk && /danger/.test(risk), `riesgo debería ir en rojo, es "${risk}"`)
    assert.ok(opp && /ink/.test(opp), `oportunidad no debería competir en color, es "${opp}"`)
  })
})

describe('el banner de sync no puede comerse la pantalla', () => {
  test('es compacto', () => {
    const p = valorFinal('.bs-sync-banner', 'padding')
    assert.ok(p, 'sin padding propio hereda uno grande y empuja el hero fuera de vista')
    const primero = parseInt(p, 10)
    assert.ok(primero <= 10, `padding vertical ${primero}px es demasiado para una barra de aviso`)
  })

  test('sus botones no se parten en dos líneas', () => {
    assert.equal(valorFinal('.bs-sync-btn', 'white-space'), 'nowrap')
  })
})