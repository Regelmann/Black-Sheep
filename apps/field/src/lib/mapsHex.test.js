/**
 * Google Maps no resuelve variables CSS. Un fillColor con `var(...)`
 * queda inválido → el marcador "yo" sale negro, igual que los pines SVG.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const ruta = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'pages', 'Ruta.jsx'),
  'utf8',
)

describe('mapa · colores de Maps API en hex', () => {
  test('el marcador "yo" no usa var() en fillColor/strokeColor', () => {
    const i = ruta.indexOf('meMarkerRef.current = new maps.Marker')
    assert.ok(i >= 0)
    const bloque = ruta.slice(i, i + 900)
    assert.ok(/fillColor:\s*'#[0-9a-fA-F]{6}'/.test(bloque), bloque.slice(0, 400))
    assert.ok(!/fillColor:\s*'var\(/.test(bloque), 'Maps no resuelve CSS vars')
    assert.ok(!/strokeColor:\s*'var\(/.test(bloque))
  })

  test('la polyline de la ruta tampoco usa var(--brand)', () => {
    const i = ruta.indexOf('new maps.Polyline')
    assert.ok(i >= 0)
    const bloque = ruta.slice(i, i + 400)
    assert.ok(/strokeColor:\s*'#[0-9a-fA-F]{3,8}'/.test(bloque))
    assert.ok(!/strokeColor:\s*'var\(/.test(bloque))
  })
})
