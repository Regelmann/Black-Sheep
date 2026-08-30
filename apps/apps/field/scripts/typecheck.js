#!/usr/bin/env node
/**
 * typecheck.js — chequeo de tipos con trinquete.
 *
 * POR QUÉ NO `tsc --noEmit` a secas
 * `checkJs` reporta también los archivos que entran al programa por import,
 * aunque no estén en `files`. Con 27.000 líneas de JS sin tipar, eso da ~100
 * errores desde el primer día y el chequeo nace inútil: nadie lo mira.
 *
 * Este script filtra la salida de tsc y sólo falla por los archivos que el
 * equipo YA declaró como tipados en tsconfig.json ("files"). El resto se
 * cuenta como deuda informativa.
 *
 * REGLA: un archivo se agrega a "files" cuando queda en cero errores, y nunca
 * se saca. El chequeo pasa siempre y el alcance crece por fases.
 *
 * Uso:  node scripts/typecheck.js
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** Lee la lista blanca desde tsconfig.json (sin dependencias, tolera comentarios). */
function archivosTipados() {
  const txt = fs.readFileSync(path.join(RAIZ, 'tsconfig.json'), 'utf8')
  const sinComentarios = txt.replace(/^\s*\/\/.*$/gm, '')
  const bloque = sinComentarios.match(/"files"\s*:\s*\[([^\]]*)\]/)
  if (!bloque) return []
  return [...bloque[1].matchAll(/"([^"]+)"/g)]
    .map(m => m[1])
    .filter(f => !f.endsWith('.d.ts'))
}

// Se invoca el binario local, NO `npx tsc`: si typescript no está instalado,
// npx se ofrece a bajar un paquete distinto del registro e imprime un aviso
// por stdout saliendo con codigo != 0. El script leia esa salida, no
// encontraba ninguna linea "error TS" y reportaba VERDE sin haber chequeado
// nada. Un chequeo que pasa cuando no corre es peor que no tenerlo.
const BIN = path.join(RAIZ, 'node_modules', '.bin', process.platform === 'win32' ? 'tsc.cmd' : 'tsc')

if (!fs.existsSync(BIN)) {
  console.error('\n❌ typescript no está instalado en apps/field.')
  console.error('   Ejecutá `npm ci` antes de correr el chequeo de tipos.\n')
  process.exit(1)
}

let salida = ''
let falloTsc = false
try {
  execFileSync(BIN, ['--noEmit'], { cwd: RAIZ, encoding: 'utf8', stdio: 'pipe' })
} catch (e) {
  salida = String(e.stdout || '') + String(e.stderr || '')
  falloTsc = true
}

const lineas = salida.split('\n').filter(l => /error TS/.test(l))

// tsc salió con error pero no emitió ningún diagnóstico reconocible: puede ser
// un tsconfig inválido o un crash. Nunca hay que interpretarlo como éxito.
if (falloTsc && lineas.length === 0) {
  console.error('\n❌ tsc falló sin emitir diagnósticos. Salida cruda:\n')
  console.error(salida.trim() || '(vacía)')
  process.exit(1)
}
const tipados = archivosTipados()

const propios = []
const deuda = new Map()

for (const l of lineas) {
  const archivo = l.split('(')[0].trim()
  if (tipados.includes(archivo)) propios.push(l)
  else deuda.set(archivo, (deuda.get(archivo) || 0) + 1)
}

const linea = '─'.repeat(60)
console.log(linea)
console.log('TYPECHECK · lista blanca creciente')
console.log(linea)
console.log(`\nArchivos tipados: ${tipados.length}`)
for (const f of tipados) console.log('   ✓ ' + f)

if (deuda.size) {
  const total = [...deuda.values()].reduce((a, b) => a + b, 0)
  console.log(`\n📋 Deuda informativa: ${total} error(es) en ${deuda.size} archivo(s) aún sin tipar.`)
  const top = [...deuda.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
  for (const [f, n] of top) console.log(`   ${String(n).padStart(3)} · ${f}`)
  console.log('   (no bloquean — se saldan al incorporar cada archivo a "files")')
}

if (propios.length) {
  console.log(`\n❌ ${propios.length} error(es) en archivos YA tipados:\n`)
  for (const l of propios) console.log('   ' + l)
  console.log('\nUn archivo en la lista blanca no puede retroceder.\n')
  process.exit(1)
}

console.log('\n✅ Sin errores de tipos en los archivos declarados\n')