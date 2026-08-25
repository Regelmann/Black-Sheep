#!/usr/bin/env node
/**
 * guard.js — reglas que ya nos costaron una versión cada una.
 *
 * Cada regla acá abajo existe porque un bug real llegó a producción
 * (o intentó llegar). No son preferencias de estilo.
 *
 * Uso:  node scripts/guard.js
 * Sale con código 1 si algo falla → rompe el CI.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src')

const problemas = []
const avisos = []

function walk(dir) {
  const out = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...walk(p))
    else if (/\.(jsx?|css)$/.test(e.name)) out.push(p)
  }
  return out
}

const archivos = walk(SRC)
const rel = (f) => path.relative(SRC, f)

for (const f of archivos) {
  const txt = fs.readFileSync(f, 'utf8')
  const lineas = txt.split('\n')
  const esTest = /\.test\.js$/.test(f)

  // ── R1 · Imports que apuntan a archivos inexistentes ──────────────
  // V92 importaba CatalogoCliente.jsx después de borrarlo. No compilaba.
  for (const m of txt.matchAll(/from ['"](\.[^'"]+)['"]/g)) {
    const base = path.resolve(path.dirname(f), m[1])
    const existe = ['', '.js', '.jsx', '.css', '/index.js', '/index.jsx']
      .some((e) => fs.existsSync(base + e))
    if (!existe) problemas.push(`[R1 import roto]  ${rel(f)} → ${m[1]}`)
  }

  // ── R2 · var() como valor de color en JS ──────────────────────────
  // V9.0: accent:'var(--brand)' + setProperty('--brand', accent)
  // → --brand: var(--brand) → circular → murió todo el branding.
  if (/\.jsx?$/.test(f)) {
    lineas.forEach((l, i) => {
      if (/\b(accent|accentDark|accentSoft|accentRing|color|background)\s*:\s*['"]var\(--/.test(l)
          && /setProperty|accent/.test(txt)) {
        if (/accent\w*\s*:\s*['"]var\(--/.test(l)) {
          problemas.push(`[R2 var() circular]  ${rel(f)}:${i + 1} — un token de marca debe ser hex literal`)
        }
      }
    })
  }

  // ── R3 · require() dentro de ESM ──────────────────────────────────
  // V9.0 inyectó require() en pedido.js dentro de un try/catch mudo.
  if (/\.jsx?$/.test(f) && !esTest) {
    lineas.forEach((l, i) => {
      if (/(^|[^.\w])require\s*\(/.test(l) && !/\/\//.test(l.split('require')[0])) {
        problemas.push(`[R3 require en ESM]  ${rel(f)}:${i + 1}`)
      }
    })
  }

  // ── R4 · Consultas que descartan el error ─────────────────────────
  // 27 ocurrencias hacían que "falló la query" se viera como "0 resultados".
  if (/\.jsx?$/.test(f) && !esTest && !/lib\/query\.js$/.test(f)) {
    lineas.forEach((l, i) => {
      if (/const\s*\{\s*data[^}]*\}\s*=\s*await\s+supabase/.test(l) && !/error/.test(l)) {
        avisos.push(`[R4 error descartado]  ${rel(f)}:${i + 1} — usar safeSelect()`)
      }
    })
  }

  // ── R5 · flushActionQueue sin handlers ────────────────────────────
  // El botón "Reintentar" existía pero drenaba con {} → no hacía nada.
  lineas.forEach((l, i) => {
    if (/flushActionQueue\(\s*\{\s*\}\s*\)/.test(l)) {
      problemas.push(`[R5 flush vacío]  ${rel(f)}:${i + 1} — pasar syncHandlers`)
    }
  })

  // ── R6 · Handler del outbox que devuelve undefined ────────────────
  // App.jsx tenía async (p) => { await insert(p) } → falsy → cola eterna.
  if (/syncHandlers|SYNC_HANDLERS/.test(txt) && !esTest) {
    lineas.forEach((l, i) => {
      if (/^\s*\w+:\s*async\s*\([^)]*\)\s*=>\s*\{\s*await\s/.test(l) && !/return/.test(l)) {
        avisos.push(`[R6 handler sin return]  ${rel(f)}:${i + 1} — debe devolver {ok:boolean}`)
      }
    })
  }

  // ── R7 · localStorage/sessionStorage fuera de lib/offline ─────────
  if (/\.jsx?$/.test(f) && !esTest && !/lib\/(offline|memory|tenants|planStore)\.js$/.test(f)) {
    lineas.forEach((l, i) => {
      if (/localStorage\.(get|set|remove)Item\(\s*['"]kf_/.test(l)) {
        avisos.push(`[R7 clave de storage duplicada]  ${rel(f)}:${i + 1} — importar la constante`)
      }
    })
  }
}

// ── R8 · Una sola definición por función SQL ────────────────────────
// get_public_catalogo estaba redefinida en 4 archivos; ganaba la última
// ejecutada. Nadie sabía cuál. Ahí vivía el bug de activo/activa.
const SQL = path.resolve(SRC, '..', '..', '..', 'sql')
if (fs.existsSync(SQL)) {
  const defs = {}
  for (const f of fs.readdirSync(SQL).filter((x) => x.endsWith('.sql'))) {
    const txt = fs.readFileSync(path.join(SQL, f), 'utf8')
    for (const m of txt.matchAll(/create\s+or\s+replace\s+function\s+(?:public\.)?(\w+)/gi)) {
      ;(defs[m[1]] ||= []).push(f)
    }
  }
  for (const [fn, files] of Object.entries(defs)) {
    if (files.length > 1) {
      const canon = files.some((f) => /CANONICO/i.test(f))
      const msg = `[R8 función SQL duplicada]  ${fn}() en: ${files.join(', ')}`
      ;(canon ? avisos : problemas).push(canon ? `${msg} (hay canónico — borrar los viejos)` : msg)
    }
  }
}

// ── R9 · La documentación de deploy debe citar el stamp actual ──────
// DEPLOY.md decía "V68 CLOSE" y el README decía "v2.4" cuando la app
// iba en V9.2. Documentación desactualizada = pasos de deploy erróneos.
const APP = path.resolve(SRC, 'App.jsx')
if (fs.existsSync(APP)) {
  const stamp = fs.readFileSync(APP, 'utf8').match(/BUILD_STAMP\s*=\s*'([^']+)'/)?.[1]
  if (stamp) {
    const raiz = path.resolve(SRC, '..', '..', '..')
    for (const doc of ['DEPLOY.md', 'README.md']) {
      const f = path.join(raiz, doc)
      if (!fs.existsSync(f)) { problemas.push(`[R9 doc faltante]  ${doc}`); continue }
      if (!fs.readFileSync(f, 'utf8').includes(stamp)) {
        problemas.push(`[R9 doc desactualizada]  ${doc} no menciona ${stamp}`)
      }
    }
  }
}

// ── R10 · Todo .sql del repo debe estar listado en DEPLOY.md ────────
// Si una versión trae SQL nuevo y nadie lo agrega a los pasos, la
// migración no se corre y la app llama funciones que no existen.
if (fs.existsSync(SQL)) {
  const deploy = path.resolve(SRC, '..', '..', '..', 'DEPLOY.md')
  if (fs.existsSync(deploy)) {
    const txt = fs.readFileSync(deploy, 'utf8')
    for (const f of fs.readdirSync(SQL).filter((x) => x.endsWith('.sql'))) {
      if (!txt.includes(f)) {
        problemas.push(`[R10 SQL sin documentar]  sql/${f} no aparece en DEPLOY.md`)
      }
    }
  }
}

// ── Reporte ────────────────────────────────────────────────────────
const линия = '─'.repeat(60)
console.log(линия)
console.log('GUARD · reglas de regresión')
console.log(линия)

if (avisos.length) {
  console.log(`\n⚠️  ${avisos.length} aviso(s) — deuda conocida, no bloquean:\n`)
  for (const a of avisos.slice(0, 40)) console.log('   ' + a)
  if (avisos.length > 40) console.log(`   … y ${avisos.length - 40} más`)
}

if (problemas.length) {
  console.log(`\n❌ ${problemas.length} problema(s) BLOQUEANTE(s):\n`)
  for (const p of problemas) console.log('   ' + p)
  console.log('\nCada regla existe porque este bug ya llegó a una entrega.\n')
  process.exit(1)
}

console.log(`\n✅ Sin regresiones bloqueantes${avisos.length ? ` (${avisos.length} avisos)` : ''}\n`)
