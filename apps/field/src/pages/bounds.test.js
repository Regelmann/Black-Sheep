/**
 * BOUNDS del mapa — qué punto se dibuja y cuál se descarta.
 *
 * EL BUG
 * El recuadro era el Gran Santiago urbano (-33.85..-33.10, -71.05..-70.30)
 * y dejaba fuera SIETE comunas de la Región Metropolitana. Un prospecto
 * en Melipilla o Tiltil se descartaba del mapa y el único rastro era un
 * `console.log('skip geo', n)` que nadie mira.
 *
 * Contradice la regla del proyecto: si algo no se puede ubicar bien, se
 * muestra marcado — no se oculta en silencio.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const RUTA = fs.readFileSync(new URL('./Ruta.jsx', import.meta.url), 'utf8')

/** Lee el BOUNDS real del archivo, no una copia. */
function leerBounds() {
  const m = RUTA.match(/const BOUNDS = \{([^}]+)\}/)
  assert.ok(m, 'no se encontró BOUNDS en Ruta.jsx')
  const o = {}
  for (const par of m[1].split(',')) {
    const [k, v] = par.split(':').map((x) => x.trim())
    if (k) o[k] = parseFloat(v)
  }
  return o
}

const dentro = (b, lat, lng) =>
  lat >= b.latMin && lat <= b.latMax && lng >= b.lngMin && lng <= b.lngMax

/** Comunas reales de la RM, incluidas las periféricas. */
const COMUNAS = [
  ['Santiago centro', -33.4372, -70.6506],
  ['Las Condes',      -33.4084, -70.5420],
  ['Vitacura',        -33.3800, -70.5700],
  ['La Cisterna',     -33.5380, -70.6620],
  ['Puente Alto',     -33.6110, -70.5760],
  ['Melipilla',       -33.6870, -71.2150],
  ['Tiltil',          -33.0870, -70.9280],
  ['Lampa',           -33.2830, -70.8770],
  ['Buin',            -33.7330, -70.7420],
  ['Talagante',       -33.6640, -70.9280],
  ['San Pedro',       -33.8930, -71.4590],
  ['Alhué',           -34.0330, -71.1000],
  ['Colina',          -33.2010, -70.6740],
  ['San José de Maipo', -33.6400, -70.3500],
]

describe('BOUNDS · ninguna comuna de la RM queda fuera', () => {
  const b = leerBounds()

  for (const [nombre, lat, lng] of COMUNAS) {
    test(`${nombre} entra en el recuadro`, () => {
      assert.ok(dentro(b, lat, lng),
        `${nombre} (${lat}, ${lng}) queda FUERA: su punto no se dibuja y ` +
        `el vendedor nunca se entera`)
    })
  }
})

describe('BOUNDS · sigue filtrando lo que debe', () => {
  const b = leerBounds()

  test('otras regiones quedan fuera', () => {
    // El recuadro existe para descartar datos corruptos, no para
    // recortar la región de trabajo.
    assert.equal(dentro(b, -36.8270, -73.0500), false, 'Concepción')
    assert.equal(dentro(b, -20.2140, -70.1520), false, 'Iquique')
    assert.equal(dentro(b, -53.1630, -70.9170), false, 'Punta Arenas')
  })

  test('la coordenada 0,0 se descarta', () => {
    // Golfo de Guinea: es el valor que aparece cuando falta el dato.
    assert.equal(dentro(b, 0, 0), false)
  })
})

describe('BOUNDS · lo descartado se reporta', () => {
  test('un punto fuera del recuadro genera un aviso visible', () => {
    assert.match(RUTA, /console\.warn\([\s\S]{0,200}fuera del recuadro/,
      'descartar puntos del mapa no puede ser un console.log entre otros')
  })
})
