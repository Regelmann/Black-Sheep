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

// ── R16 · El CI debe leer el sello de donde REALMENTE está ─────────
// El sello se movió de App.jsx a lib/buildStamp.js y el workflow siguió
// buscándolo en App.jsx: `grep` sin resultado → exit 1 → CI en rojo.
{
  const raiz = path.resolve(SRC, '..', '..', '..')
  const wf = path.join(raiz, '.github', 'workflows', 'ci.yml')
  const stampFiles = archivos.filter((f) => /export const BUILD_STAMP/.test(fs.readFileSync(f, 'utf8')))
  if (stampFiles.length !== 1) {
    problemas.push(`[R16 sello duplicado]  BUILD_STAMP definido en ${stampFiles.length} archivos — debe ser 1`)
  } else if (fs.existsSync(wf)) {
    const real = rel(stampFiles[0])                       // p.ej. lib/buildStamp.js
    const yml = fs.readFileSync(wf, 'utf8')
    if (yml.includes('BUILD_STAMP') && !yml.includes(real)) {
      problemas.push(`[R16 CI desincronizado]  ci.yml no lee el sello de src/${real}`)
    }
  }
}

// ── R15 · ESLint tiene que estar y correr en verify ────────────────
// La auditoría V11 lo dijo con razón: guard.js es defensa RETROSPECTIVA
// (sólo detecta bugs que YA ocurrieron). Un `data` sin declarar es una
// clase de error que ninguna de estas reglas contempla y que ESLint
// atrapa desde 2013.
{
  const raiz = path.resolve(SRC, '..')
  const cfg = ['eslint.config.js', 'eslint.config.mjs', '.eslintrc.json', '.eslintrc.cjs']
  if (!cfg.some((f) => fs.existsSync(path.join(raiz, f)))) {
    problemas.push('[R15 sin ESLint]  falta eslint.config.js — el análisis estático no es opcional')
  }
  const pkgPath = path.join(raiz, 'package.json')
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
    if (!/lint/.test(pkg.scripts?.verify || '')) {
      problemas.push('[R15 lint fuera de verify]  npm run verify debe correr el lint antes del build')
    }
  }
}

// ── R14 · No usar tokens CSS que no existen ────────────────────────
// `var(--no-existe)` NO da error: CSS lo resuelve como valor inválido.
// Un color inexistente = fondo transparente = elemento INVISIBLE.
// Así se perdió el gráfico de tendencia de Gerencia: 4 de sus 5
// colores eran tokens fantasma y sólo se veía una barra.
{
  const definidos = new Set()
  const stylesDir = path.join(SRC, 'styles')
  const cssFiles = []
  if (fs.existsSync(stylesDir)) {
    for (const f of fs.readdirSync(stylesDir)) if (f.endsWith('.css')) cssFiles.push(path.join(stylesDir, f))
  }
  for (const f of ['index.css', 'index.legacy.css']) {
    const p2 = path.join(SRC, f)
    if (fs.existsSync(p2)) cssFiles.push(p2)
  }
  for (const f of cssFiles) {
    const t = fs.readFileSync(f, 'utf8')
    for (const m of t.matchAll(/--([a-z0-9-]+)\s*:/gi)) definidos.add(m[1])
  }
  // Tokens que un componente define en línea (style={{ '--x': ... }})
  // o vía setProperty. Son válidos aunque no estén en un .css.
  for (const f of archivos.filter((x) => /\.jsx?$/.test(x))) {
    const t = fs.readFileSync(f, 'utf8')
    for (const m of t.matchAll(/['"](--[a-z0-9-]+)['"]\s*:/gi)) definidos.add(m[1].slice(2))
    for (const m of t.matchAll(/setProperty\(\s*['"]--([a-z0-9-]+)/gi)) definidos.add(m[1])
  }

  const usados = new Map()
  const todos = [...cssFiles, ...archivos.filter((f) => /\.jsx?$/.test(f))]
  for (const f of todos) {
    const t = fs.readFileSync(f, 'utf8')
    t.split('\n').forEach((l, i) => {
      for (const m of l.matchAll(/var\(\s*--([a-z0-9-]+)/gi)) {
        // var(--x, fallback) es seguro: tiene respaldo
        const idx = m.index + m[0].length
        if (l.slice(idx, idx + 2).trim().startsWith(',')) continue
        if (!definidos.has(m[1]) && !usados.has(m[1])) {
          usados.set(m[1], `${rel(f)}:${i + 1}`)
        }
      }
    })
  }
  for (const [tok, donde] of usados) {
    problemas.push(`[R14 token inexistente]  --${tok} en ${donde} — no resuelve, el elemento queda invisible`)
  }
}

// ── R13 · Ninguna página define su propio hero ─────────────────────
// El App Shell existe para que las 5 pestañas compartan estructura.
// Si una página vuelve a montar `bs-page-hero`, se rompe la coherencia
// y vuelve el problema de "cada pestaña se ve distinta".
{
  const dir = path.join(SRC, 'pages')
  if (fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.jsx'))) {
      const txt = fs.readFileSync(path.join(dir, f), 'utf8')
      if (/className="bs-page-hero"/.test(txt)) {
        avisos.push(`[R13 hero propio]  pages/${f} — usar PageShell en vez de bs-page-hero`)
      }
    }
  }
}

// ── R12 · Las páginas pesadas no se importan estáticamente ─────────
// Gerencia (2.300 líneas) y Admin (958) los abre un gerente desde una
// oficina. Importarlos estáticos los mete en el bundle que un vendedor
// descarga en 4G para abrir "Hoy".
{
  const app = path.resolve(SRC, 'App.jsx')
  if (fs.existsSync(app)) {
    const txt = fs.readFileSync(app, 'utf8')
    for (const pagina of ['Gerencia', 'Admin', 'Stock', 'CatalogoCliente']) {
      const estatico = new RegExp(`^import\\s+${pagina}\\s+from`, 'm')
      if (estatico.test(txt)) {
        problemas.push(
          `[R12 import estático]  App.jsx importa ${pagina} sin lazy() — ` +
          `entra al bundle inicial`
        )
      }
    }
  }
}

// ── R11 · Ninguna política RLS con USING(true) ─────────────────────
// `using (true)` = cualquier usuario autenticado ve TODO. Con un solo
// tenant no duele; con el segundo es fuga de datos entre empresas.
// Excepciones legítimas: tablas de referencia sin datos sensibles, y
// las policies de `anon` que sirven el catálogo público por token.
if (fs.existsSync(SQL)) {
  const EXENTAS = ['zonas_comunas']
  for (const f of fs.readdirSync(SQL).filter((x) => x.endsWith('.sql'))) {
    const txt = fs.readFileSync(path.join(SQL, f), 'utf8')
    const lineas = txt.split('\n')
    lineas.forEach((l, i) => {
      if (!/using\s*\(\s*true\s*\)/i.test(l)) return
      // Contexto: la policy puede abarcar varias líneas
      const ctx = lineas.slice(Math.max(0, i - 4), i + 1).join(' ')
      if (/\bto\s+anon\b/i.test(ctx)) return                    // catálogo público
      if (EXENTAS.some((t) => ctx.includes(t))) return           // tabla de referencia
      if (!/create\s+policy/i.test(ctx)) return
      avisos.push(`[R11 política abierta]  sql/${f}:${i + 1} — using(true) expone todo el tenant`)
    })
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
