/**
 * El contraste de la identidad no es opinable: se mide.
 *
 * La app se usa en la calle, con sol directo. Un texto que en el monitor
 * "se ve bien" a 3.5:1 en la vereda no se lee. Estos valores están fijados
 * para que un retoque de paleta no los baje sin que nadie se entere.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const CSS = fs.readFileSync(
  path.join(import.meta.dirname, 'identidad.css'),
  'utf8'
)

/** Lee un token hexadecimal de identidad.css. */
function token(nombre) {
  const m = CSS.match(new RegExp(`${nombre}:\\s*(#[0-9a-fA-F]{6})`))
  assert.ok(m, `el token ${nombre} debe existir y ser un hex literal`)
  return m[1]
}

function luminancia(hex) {
  const h = hex.replace('#', '')
  const c = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
  const f = (v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])
}

function contraste(a, b) {
  const [x, y] = [luminancia(a), luminancia(b)]
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

describe('identidad · contraste sobre superficie oscura', () => {
  const fondo = token('--dark')

  test('el texto principal supera AA (4.5:1)', () => {
    const r = contraste(token('--on-dark'), fondo)
    assert.ok(r >= 4.5, `--on-dark da ${r.toFixed(2)}:1`)
  })

  test('el texto secundario supera AA', () => {
    const r = contraste(token('--on-dark-2'), fondo)
    assert.ok(r >= 4.5, `--on-dark-2 da ${r.toFixed(2)}:1`)
  })

  // El terciario es el más flojo de la escala: si alguien lo aclara "un
  // poquito" para que se vea más elegante, cae por debajo de AA.
  test('el texto terciario supera AA', () => {
    const r = contraste(token('--on-dark-3'), fondo)
    assert.ok(r >= 4.5, `--on-dark-3 da ${r.toFixed(2)}:1`)
  })

  // Los contadores de la banda oscura usan verde y rojo propios: los
  // semánticos de superficie clara (--ok #15803d, --danger #dc2626) se
  // hunden contra #1a1614 y el número queda ilegible justo donde importa,
  // que es el resumen del día.
  test('los estados de los contadores superan AA sobre oscuro', () => {
    const casos = [
      ['verde (is-ok)', '#4ade80'],
      ['rojo (is-danger)', '#f87171'],
      ['ámbar (is-warn)', token('--accent-2')],
    ]
    for (const [nombre, hex] of casos) {
      const r = contraste(hex, fondo)
      assert.ok(r >= 4.5, `${nombre} da ${r.toFixed(2)}:1`)
    }
  })

  // Y la contracara: los semánticos claros NO sirven acá. Si alguien los
  // reusa por prolijidad, este test explica por qué no se puede.
  test('los semánticos de superficie clara no alcanzan sobre oscuro', () => {
    for (const hex of ['#15803d', '#dc2626']) {
      const r = contraste(hex, fondo)
      assert.ok(r < 4.5, `${hex} da ${r.toFixed(2)}:1: ya alcanzaría AA`)
    }
  })

  // Ésta es la razón de que --accent exista aparte de --brand.
  test('el acento supera AA sobre oscuro, y por eso no se usa --brand', () => {
    const acento = contraste(token('--accent'), fondo)
    assert.ok(acento >= 4.5, `--accent da ${acento.toFixed(2)}:1`)

    // El naranja quemado de marca NO llega: 3.47:1. Si algún día alcanzara
    // AA, este test avisa de que ya se puede simplificar y usar --brand.
    const marca = contraste('#c2410c', fondo)
    assert.ok(
      marca < 4.5,
      `--brand ahora da ${marca.toFixed(2)}:1 sobre oscuro: ya se puede ` +
        'usar --brand directamente y eliminar --accent'
    )
  })
})