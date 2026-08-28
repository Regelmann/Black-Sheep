/**
 * CONTRASTE REAL, RESOLVIENDO LA CASCADA COMPLETA
 *
 * POR QUÉ NO ALCANZA contraste.test.js
 * Ese archivo mide pares de tokens de identidad.css: "--on-dark sobre
 * --dark da 16.8:1". Correcto, y aun así la app mostró las cifras del
 * hero invisibles. Porque el color del texto salía de identidad.css
 * (var(--on-dark), #faf7f4) pero el fondo NO: lo ganaba
 * `.bs-stat { background:#fff !important }` de v90-fixes.css. Contraste
 * real 1.07:1. Ningún test miraba las hojas juntas, así que nadie lo vio.
 *
 * QUÉ HACE ESTE
 * Parte del CSS de todas las hojas concatenadas en el orden real de
 * main.jsx, resuelve para cada par texto/fondo qué declaración GANA
 * (!important > especificidad > orden, como el navegador) y exige AA.
 *
 * Es la diferencia entre "la paleta está bien elegida" y "lo que el
 * usuario tiene delante se lee".
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

/* Mismo orden que los imports de main.jsx: define quién pisa a quién. */
const HOJAS = ['index.css', 'v90-fixes.css', 'ds-2026.css', 'system.css',
  'v99-ux.css', 'shell.css', 'identidad.css']

const DIR = import.meta.dirname
const css = HOJAS
  .map(h => {
    const p = path.join(DIR, h)
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : ''
  })
  .join('\n')

const tokensCss = (() => {
  const p = path.join(DIR, 'tokens.css')
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : ''
})()

/* ── tokens globales (:root/html/body) ───────────────────────────────── */
const tokens = {}
/* Sin comentarios: las cabeceras de estas hojas contienen llaves y
   caracteres que rompen el troceo por regex (así se perdía :root entero
   de identidad.css y los --on-dark quedaban sin resolver). */
const limpio = t => t.replace(/\/\*[\s\S]*?\*\//g, '')
for (const fuente of [limpio(tokensCss), limpio(css)]) {
  const bloques = fuente.matchAll(/(^|\})\s*([^{}]+)\{([^{}]*)\}/g)
  for (const b of bloques) {
    const sel = b[2].trim()
    if (!/^(:root|html|body)(\s*,\s*(:root|html|body))*$/.test(sel)) continue
    for (const d of b[3].matchAll(/(--[\w-]+)\s*:\s*([^;]+)/g)) tokens[d[1]] = d[2].trim()
  }
}

function resolver(v, prof = 0) {
  if (!v || prof > 12) return v
  v = String(v).trim()
  const m = v.match(/^var\(\s*(--[\w-]+)\s*(?:,\s*([\s\S]+))?\)$/)
  if (!m) return v
  if (tokens[m[1]] !== undefined) return resolver(tokens[m[1]], prof + 1)
  return m[2] ? resolver(m[2], prof + 1) : null
}

function aRGB(v) {
  if (!v) return null
  v = String(v).trim().toLowerCase()
  if (['transparent', 'none', 'inherit', 'currentcolor'].includes(v)) return null
  if (/gradient/.test(v)) {
    // El color puede venir como var(--dark) DENTRO del gradiente: hay que
    // resolver el token antes de leerlo. Se toma el ÚLTIMO color del
    // degradado, que es el que cubre la mayor parte de la superficie
    // (los radiales de identidad.css abren claro y cierran en --dark).
    const crudos = [...v.matchAll(/var\(\s*--[\w-]+\s*(?:,[^()]*)?\)|#[0-9a-f]{3,8}|rgba?\([^)]+\)/g)].map(m => m[0])
    for (const c of crudos.reverse()) {
      const rgb = aRGB(resolver(c))
      if (rgb) return rgb
    }
    return null
  }
  let m = v.match(/^#([0-9a-f]{3,8})\b/)
  if (m) {
    let h = m[1]
    if (h.length === 3) h = h.split('').map(c => c + c).join('')
    if (h.length === 4) h = h.slice(0, 3).split('').map(c => c + c).join('')
    if (h.length === 8) h = h.slice(0, 6)
    if (h.length !== 6) return null
    const n = parseInt(h, 16)
    return [n >> 16 & 255, n >> 8 & 255, n & 255]
  }
  m = v.match(/^rgba?\(([^)]+)\)/)
  if (m) {
    const p = m[1].split(/[,\s/]+/).filter(Boolean).map(parseFloat)
    if (p.length >= 3 && p.every(x => !isNaN(x))) {
      if (p.length >= 4 && p[3] < 0.6) return null
      return [p[0], p[1], p[2]]
    }
  }
  return null
}

const lum = ([r, g, b]) => {
  const s = [r, g, b].map(x => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 })
  return 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2]
}
const contraste = (a, b) => {
  const x = lum(a), y = lum(b)
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

function especificidad(sel) {
  const s = sel.replace(/::?[a-z-]+(\([^)]*\))?/g, '')
  return ((s.match(/#[\w-]+/g) || []).length) * 100 +
    ((s.match(/\.[\w-]+/g) || []).length + (s.match(/\[[^\]]+\]/g) || []).length) * 10 +
    ((s.match(/(^|[\s>+~])[a-z][\w-]*/gi) || []).length)
}

/* ── declaraciones de color/fondo, en orden ──────────────────────────── */
const sinComentarios = css.replace(/\/\*[\s\S]*?\*\//g, '')
const decls = []
let orden = 0
for (const b of sinComentarios.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
  orden++
  const selectores = b[1].split(',').map(s => s.trim()).filter(Boolean)
  const cuerpo = b[2]
  for (const sel of selectores) {
    if (/^@/.test(sel)) continue
    if (/::?(before|after|placeholder|selection|backdrop)/.test(sel)) continue
    // El valor puede ocupar varias líneas (los gradientes de identidad.css
    // se escriben quebrados); [^;]+ ya las toma, pero hay que normalizar
    // los saltos o el color queda con \n y no resuelve.
    for (const d of cuerpo.matchAll(/([a-z-]+)\s*:\s*([^;]+)/gi)) {
      const prop = d[1].toLowerCase().trim()
      if (!['color', 'background', 'background-color'].includes(prop)) continue
      const val = d[2].trim()
      decls.push({
        sel, prop, val: val.replace(/\s*!important\s*$/i, '').replace(/\s+/g, ' ').trim(),
        imp: /!important/i.test(val), esp: especificidad(sel), orden,
      })
    }
  }
}

const mejor = (a, b) => (a.imp !== b.imp) ? (a.imp ? a : b)
  : (a.esp !== b.esp ? (a.esp > b.esp ? a : b) : (a.orden > b.orden ? a : b))

/** Declaración ganadora cuyo SUJETO (final del selector) es `clase`. */
function ganador(clase, prop, contexto) {
  const re = new RegExp(`\\.${clase}(?![\\w-])[^\\s>+~]*$`)
  let g = null
  for (const d of decls) {
    if (d.prop !== prop && !(prop === 'background' && d.prop === 'background-color')) continue
    if (!re.test(d.sel)) continue
    if (contexto && !d.sel.includes(contexto) && d.sel !== `.${clase}`) continue
    g = g ? mejor(g, d) : d
  }
  return g
}

/** Color de fondo efectivo: si es transparente, sube al contenedor. */
function fondoEfectivo(clase, contexto) {
  const propio = ganador(clase, 'background', contexto)
  const c = propio ? aRGB(resolver(propio.val)) : null
  if (c) return { rgb: c, sel: propio.sel, imp: propio.imp }
  if (contexto) {
    const padre = contexto.replace(/^\./, '')
    const dp = ganador(padre, 'background')
    const cp = dp ? aRGB(resolver(dp.val)) : null
    if (cp) return { rgb: cp, sel: dp.sel, imp: dp.imp }
  }
  return null
}

/* [texto, contenedor, contexto, mínimo] */
const PARES = [
  ['bs-stat-value', 'bs-stat', '.bs-shell-stats', 4.5],
  ['bs-stat-label', 'bs-stat', '.bs-shell-stats', 4.5],
  ['bs-shell-title', 'bs-shell-hero', null, 4.5],
  ['bs-shell-eyebrow', 'bs-shell-hero', null, 4.5],
  ['bs-shell-sub', 'bs-shell-hero', null, 4.5],
  ['bs-appheader-title', 'bs-appheader', null, 4.5],
  ['bs-appheader-eyebrow', 'bs-appheader', null, 4.5],
  ['bs-appheader-sub', 'bs-appheader', null, 4.5],
  ['bs-dc-value', 'bs-dc', null, 4.5],
  ['bs-dc-type', 'bs-dc', null, 4.5],
  ['bs-shop-card-meta', 'bs-shop-card', null, 4.5],
  /* Barra de navegación: se ve en TODAS las pantallas, así que un fallo
     acá se multiplica por cinco. El estado inactivo es el que más se
     mira (cuatro de cinco pestañas lo están en todo momento). */
  ['nav-item', 'navbar', null, 4.5],
  /* Chip inactivo: el activo pinta fondo saturado y es fácil de ver;
     el inactivo es texto sobre superficie clara y es donde se cuela un
     gris demasiado suave. */
  ['bs-chip', 'bs-chip', null, 4.5],
]

/* Estados que no son el "normal" del elemento: se miden aparte porque
   el par texto/fondo no sale de dos clases distintas sino de la misma
   clase con un modificador. */
const ESTADOS = [
  ['.nav-item.active', '.navbar', 4.5],
]

describe('contraste resolviendo la cascada de todas las hojas', () => {
  for (const [txt, cont, ctx, min] of PARES) {
    const etiqueta = (ctx ? ctx + ' ' : '') + '.' + txt
    test(`${etiqueta} se lee sobre .${cont}`, () => {
      const dTxt = ganador(txt, 'color', ctx)
      assert.ok(dTxt, `no hay color declarado para .${txt}`)
      const fg = aRGB(resolver(dTxt.val))
      assert.ok(fg, `color de .${txt} no resoluble: ${dTxt.val}`)

      const bg = fondoEfectivo(cont, ctx)
      assert.ok(bg, `no hay fondo resoluble para .${cont}`)

      const r = contraste(fg, bg.rgb)
      assert.ok(
        r >= min,
        `${etiqueta} da ${r.toFixed(2)}:1 (mínimo ${min}).\n` +
        `  texto ${resolver(dTxt.val)} ← ${dTxt.sel}\n` +
        `  fondo rgb(${bg.rgb.join(',')})${bg.imp ? ' !important' : ''} ← ${bg.sel}`
      )
    })
  }

  for (const [selTxt, selBg, min] of ESTADOS) {
    test(`${selTxt} se lee sobre ${selBg}`, () => {
      const exacto = (sel, prop) => {
        let g = null
        for (const d of decls) {
          if (d.sel !== sel) continue
          if (d.prop !== prop && !(prop === 'background' && d.prop === 'background-color')) continue
          g = g ? mejor(g, d) : d
        }
        return g
      }
      const dTxt = exacto(selTxt, 'color')
      assert.ok(dTxt, `${selTxt} no declara color`)
      const dBg = exacto(selBg, 'background')
      assert.ok(dBg, `${selBg} no declara fondo`)
      const fg = aRGB(resolver(dTxt.val))
      const bg = aRGB(resolver(dBg.val))
      assert.ok(fg && bg, 'color no resoluble')
      const r = contraste(fg, bg)
      assert.ok(r >= min,
        `${selTxt} da ${r.toFixed(2)}:1 (mínimo ${min}).\n` +
        `  texto ${resolver(dTxt.val)} · fondo ${resolver(dBg.val)}`)
    })
  }

  test('ninguna hoja fuerza el fondo de .bs-stat con !important', () => {
    // La causa exacta del bug: un !important en una hoja temprana derrota
    // a cualquier especificidad posterior. Si vuelve, las celdas del hero
    // oscuro se rellenan de blanco y las cifras desaparecen.
    const culpables = decls.filter(d =>
      /\.bs-stat(?![\w-])/.test(d.sel) &&
      (d.prop === 'background' || d.prop === 'background-color') && d.imp
    )
    assert.equal(culpables.length, 0,
      'fondo de .bs-stat forzado con !important en: ' +
      culpables.map(c => `${c.sel} → ${c.val}`).join(' · '))
  })

  test('el header no tiene una variante clara sin color de título propio', () => {
    // .bs-appheader.is-light fijaba background:#fff y ganaba por
    // especificidad, pero dejaba el título en var(--on-dark): 1.07:1.
    // Una variante de superficie DEBE redefinir el color de su texto.
    const variantes = [...new Set(decls
      .filter(d => /^\.bs-appheader\.[\w-]+$/.test(d.sel) &&
        (d.prop === 'background' || d.prop === 'background-color'))
      .map(d => d.sel))]
    for (const v of variantes) {
      const clase = v.split('.').pop()
      const defineTitulo = decls.some(d =>
        d.sel.includes(clase) && d.sel.includes('bs-appheader-title') && d.prop === 'color')
      assert.ok(defineTitulo,
        `${v} cambia el fondo del header pero no el color de .bs-appheader-title`)
    }
  })
})