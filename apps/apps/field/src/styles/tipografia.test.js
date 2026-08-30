/**
 * La app se usa al sol, a un brazo de distancia, por gente que a veces ya
 * no ve de cerca. El tamaño de letra no es una preferencia estética: es la
 * diferencia entre poder trabajar y no poder.
 *
 * Estos tests fijan las tres condiciones que hacen que el texto se pueda
 * agrandar. Las tres estaban rotas antes de V11 y ninguna daba error.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const RAIZ = path.resolve(import.meta.dirname, '..', '..')
const leer = (p) => fs.readFileSync(path.join(RAIZ, p), 'utf8')

describe('tipografía · el vendedor tiene que poder agrandar el texto', () => {
  // 1 · El viewport no puede bloquear el gesto.
  test('el viewport permite hacer zoom', () => {
    const html = leer('index.html')
    const m = html.match(/name="viewport"\s+content="([^"]+)"/)
    assert.ok(m, 'debe existir el meta viewport')
    const contenido = m[1]

    assert.ok(
      !/user-scalable\s*=\s*no/.test(contenido),
      'user-scalable=no impide agrandar el texto (WCAG 1.4.4)'
    )
    // maximum-scale=1 es el mismo bloqueo con otro nombre.
    const max = contenido.match(/maximum-scale\s*=\s*([\d.]+)/)
    assert.ok(
      !max || Number(max[1]) >= 2,
      `maximum-scale=${max?.[1]} impide llegar al 200% que exige WCAG 1.4.4`
    )
  })

  // 2 · La raíz no puede quedar clavada en px, o la preferencia del
  //     sistema operativo no tiene ningún efecto.
  test('la raíz no fija font-size en px', () => {
    const css = leer('src/index.css')
    const m = css.match(/html\s*\{([^}]*)\}/)
    assert.ok(m, 'debe existir la regla html')
    assert.ok(
      !/font-size:\s*\d+px/.test(m[1]),
      'html con font-size en px anula el ajuste de letra del sistema'
    )
  })

  // 3 · La escala tiene que estar en unidades relativas. Un token en px
  //     es un token que no escala, por más que se use en todos lados.
  test('la escala tipográfica está en rem', () => {
    const tokens = leer('src/styles/tokens.css')
    const escala = [...tokens.matchAll(/(--text-[\w-]+):\s*([^;]+);/g)]
    assert.ok(escala.length >= 7, 'la escala debe tener al menos 7 pasos')

    for (const [, nombre, valor] of escala) {
      assert.ok(
        /rem/.test(valor),
        `${nombre} vale ${valor.trim()}: en px no escala con el sistema`
      )
    }
  })

  // 4 · Por debajo de 16px iOS hace zoom solo al enfocar un campo, y el
  //     usuario queda con la vista corrida. Es el motivo por el que
  //     alguien había puesto user-scalable=no en lugar de arreglar esto.
  test('los campos de texto llegan a 16px', () => {
    const fuentes = ['src/styles/v90-fixes.css', 'src/index.css']
    const selectores = [/\.bs-search-input\s*\{([^}]*)\}/, /\.search\s*\{([^}]*)\}/]

    for (const f of fuentes) {
      const css = leer(f)
      for (const sel of selectores) {
        const m = css.match(sel)
        if (!m) continue
        const fs_ = m[1].match(/font-size:\s*([\d.]+)px/)
        if (!fs_) continue
        assert.ok(
          Number(fs_[1]) >= 16,
          `${f}: un input a ${fs_[1]}px dispara zoom automático en iOS`
        )
      }
    }
  })
})