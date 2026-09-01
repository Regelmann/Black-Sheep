#!/usr/bin/env node

/**
 * Black Sheep Field
 * TYPECHECK ENGINE
 *
 * Objetivo:
 *   Tener un typecheck determinista y robusto para Windows/Git Bash.
 *
 * Diseño:
 *   1. No usa npx.
 *   2. No ejecuta tsc.cmd.
 *   3. No depende de la API interna de TypeScript.
 *   4. Ejecuta directamente el CLI JS de TypeScript mediante Node.
 *   5. Lee los archivos protegidos desde tsconfig.json.
 *   6. Los errores en archivos protegidos bloquean.
 *   7. Los errores fuera de los protegidos se reportan como deuda.
 *   8. Un fallo del motor TypeScript siempre bloquea.
 *
 * Esto permite aumentar progresivamente la superficie tipada sin
 * esconder errores ni declarar verde un typecheck que realmente no corrió.
 */

import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(SCRIPT_DIR, '..')
const CONFIG_FILE = path.join(ROOT, 'tsconfig.json')
const NODE_MODULES = path.join(ROOT, 'node_modules')
const TYPESCRIPT_DIR = path.join(NODE_MODULES, 'typescript')

const TS_CLI_CANDIDATES = [
  path.join(TYPESCRIPT_DIR, 'bin', 'tsc'),
  path.join(TYPESCRIPT_DIR, 'bin', 'tsc.js'),
  path.join(TYPESCRIPT_DIR, 'lib', 'tsc.js'),
]

const LINE = '─'.repeat(72)

function fail(message, details = '') {
  console.error(`\n❌ ${message}`)
  if (details) {
    console.error(details)
  }
  console.error('')
  process.exit(1)
}

function exists(file) {
  try {
    return fs.existsSync(file)
  } catch {
    return false
  }
}

function normalizePath(value) {
  return String(value)
    .replace(/\\/g, '/')
    .replace(/^file:\/+/i, '')
    .replace(/\/+/g, '/')
    .toLowerCase()
}

function absolutePath(value) {
  if (path.isAbsolute(value)) {
    return path.normalize(value)
  }

  return path.normalize(path.resolve(ROOT, value))
}

/**
 * El tsconfig de un proyecto normal es JSON con comentarios y, en algunos
 * repositorios, trailing commas. No necesitamos interpretar todo TypeScript:
 * solamente localizar la propiedad "files".
 */
function parseTsConfig(text) {
  let source = String(text)

  source = source.replace(
    /\/\*[\s\S]*?\*\//g,
    '',
  )

  source = source.replace(
    /(^|[^:])\/\/.*$/gm,
    '$1',
  )

  source = source.replace(
    /,\s*([}\]])/g,
    '$1',
  )

  try {
    return JSON.parse(source)
  } catch (error) {
    fail(
      'No se pudo interpretar tsconfig.json.',
      String(error?.message || error),
    )
  }
}

function readProtectedFiles() {
  if (!exists(CONFIG_FILE)) {
    fail(
      'No existe tsconfig.json.',
      `Ruta esperada:\n   ${CONFIG_FILE}`,
    )
  }

  const config = parseTsConfig(
    fs.readFileSync(CONFIG_FILE, 'utf8'),
  )

  const files = Array.isArray(config.files)
    ? config.files
    : []

  const protectedFiles = files
    .filter(value => typeof value === 'string')
    .filter(value => !value.toLowerCase().endsWith('.d.ts'))
    .map(absolutePath)

  return protectedFiles
}

function findTypeScriptCli() {
  for (const candidate of TS_CLI_CANDIDATES) {
    if (exists(candidate)) {
      return candidate
    }
  }

  fail(
    'No se encontró el CLI de TypeScript instalado.',
    [
      `TypeScript esperado en:`,
      `   ${TYPESCRIPT_DIR}`,
      '',
      'Ejecuta primero:',
      '   npm ci',
    ].join('\n'),
  )
}

function readTypeScriptVersion() {
  const packageFile = path.join(
    TYPESCRIPT_DIR,
    'package.json',
  )

  if (!exists(packageFile)) {
    return 'desconocida'
  }

  try {
    const pkg = JSON.parse(
      fs.readFileSync(packageFile, 'utf8'),
    )

    return pkg.version || 'desconocida'
  } catch {
    return 'desconocida'
  }
}

function protectedSet(files) {
  return new Set(
    files.map(file => normalizePath(file)),
  )
}

/**
 * Extrae la ruta del archivo desde una línea de diagnóstico de tsc.
 *
 * Ejemplos soportados:
 *
 *   src/lib/offline.js(202,25): error TS2538: ...
 *
 *   C:/repo/src/lib/offline.js(202,25): error TS2538: ...
 *
 *   src/lib/offline.js:202:25 - error TS2538: ...
 */
function extractDiagnosticFile(line) {
  const text = String(line)

  let match = text.match(
    /^(.+?)\(\d+,\d+\):\s+error\s+TS\d+:/,
  )

  if (match) {
    return match[1].trim()
  }

  match = text.match(
    /^(.+?):\d+:\d+\s+-\s+error\s+TS\d+:/,
  )

  if (match) {
    return match[1].trim()
  }

  return null
}

function isTypeScriptError(line) {
  return /(?:error\s+TS\d+:|-+\s+error\s+TS\d+:)/.test(
    String(line),
  )
}

function classifyDiagnostics(output, protectedFiles) {
  const protectedLookup = protectedSet(protectedFiles)

  const protectedErrors = []
  const debtErrors = []
  const unclassifiedErrors = []

  const lines = String(output || '').split(/\r?\n/)

  for (const line of lines) {
    if (!isTypeScriptError(line)) {
      continue
    }

    const file = extractDiagnosticFile(line)

    if (!file) {
      unclassifiedErrors.push(line)
      continue
    }

    const absolute = absolutePath(file)
    const normalized = normalizePath(absolute)

    if (protectedLookup.has(normalized)) {
      protectedErrors.push({
        file: absolute,
        line,
      })
    } else {
      debtErrors.push({
        file: absolute,
        line,
      })
    }
  }

  return {
    protectedErrors,
    debtErrors,
    unclassifiedErrors,
  }
}

function formatRelative(file) {
  const relative = path.relative(ROOT, file)

  if (!relative || relative.startsWith('..')) {
    return file
  }

  return relative.replace(/\\/g, '/')
}

function runTypeScript(tsCli) {
  /**
   * Importante:
   *
   * En Windows, spawnSync("node_modules/.bin/tsc.cmd") puede producir:
   *
   *   spawnSync ... EINVAL
   *
   * Por eso NO ejecutamos el .cmd.
   *
   * Ejecutamos:
   *
   *   node <typescript>/lib/tsc.js --noEmit --pretty false
   *
   * Esto elimina la capa problemática de cmd.exe/npm.
   */

  const result = spawnSync(
    process.execPath,
    [
      tsCli,
      '--noEmit',
      '--pretty',
      'false',
    ],
    {
      cwd: ROOT,
      encoding: 'utf8',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )

  const stdout = result.stdout == null
    ? ''
    : String(result.stdout)

  const stderr = result.stderr == null
    ? ''
    : String(result.stderr)

  const output = [stdout, stderr]
    .filter(Boolean)
    .join('\n')

  return {
    status: result.status,
    signal: result.signal,
    error: result.error,
    stdout,
    stderr,
    output,
  }
}

function printHeader(version, tsCli, protectedFiles) {
  console.log(LINE)
  console.log('TYPECHECK · MOTOR DETERMINISTA V4')
  console.log(LINE)

  console.log('\nProyecto:')
  console.log(`   ${ROOT}`)

  console.log('\nNode:')
  console.log(`   ${process.version}`)

  console.log('\nTypeScript:')
  console.log(`   ${version}`)

  console.log('\nCLI TypeScript:')
  console.log(`   ${tsCli}`)

  console.log('\nArchivos protegidos:')
  console.log(`   ${protectedFiles.length}`)

  if (protectedFiles.length === 0) {
    console.log('   ⚠ ninguno')
  } else {
    for (const file of protectedFiles) {
      console.log(`   ✓ ${formatRelative(file)}`)
    }
  }
}

function printExecution(result) {
  console.log('\nEjecución:')

  if (result.error) {
    console.log('   proceso: ERROR')
    console.log(`   mensaje: ${result.error.message}`)
    return
  }

  console.log(
    `   exit code: ${result.status == null ? 'null' : result.status}`,
  )

  console.log(
    `   signal: ${result.signal || 'none'}`,
  )
}

function printDebt(debtErrors) {
  if (debtErrors.length === 0) {
    return
  }

  const counts = new Map()

  for (const item of debtErrors) {
    const file = formatRelative(item.file)
    counts.set(file, (counts.get(file) || 0) + 1)
  }

  const ranking = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])

  console.log(
    `\n📋 Deuda informativa: ${debtErrors.length} error(es) fuera de archivos protegidos.`,
  )

  console.log(`   archivos afectados: ${counts.size}`)

  console.log('\n   Principales archivos:')

  for (const [file, count] of ranking.slice(0, 10)) {
    console.log(
      `   ${String(count).padStart(4)} · ${file}`,
    )
  }

  console.log(
    '\n   Estos errores NO bloquean el typecheck todavía.',
  )
}

function printProtectedErrors(errors) {
  if (errors.length === 0) {
    return
  }

  console.error(
    `\n❌ ${errors.length} error(es) en archivos protegidos:\n`,
  )

  for (const item of errors) {
    console.error(`   ${item.line}`)
  }

  console.error(
    '\nUn archivo protegido no puede retroceder.',
  )
}

function printUnclassified(errors) {
  if (errors.length === 0) {
    return
  }

  console.error(
    `\n❌ ${errors.length} diagnóstico(s) de TypeScript no pudieron clasificarse.`,
  )

  for (const line of errors) {
    console.error(`   ${line}`)
  }

  console.error(
    '\nEl motor se detiene para evitar un falso verde.',
  )
}

function main() {
  const version = readTypeScriptVersion()
  const tsCli = findTypeScriptCli()
  const protectedFiles = readProtectedFiles()

  printHeader(
    version,
    tsCli,
    protectedFiles,
  )

  const result = runTypeScript(tsCli)

  printExecution(result)

  /**
   * Error de proceso = TypeScript ni siquiera terminó normalmente.
   * Eso JAMÁS puede convertirse en verde.
   */
  if (result.error) {
    fail(
      'No se pudo ejecutar TypeScript.',
      [
        `CLI: ${tsCli}`,
        `Node: ${process.execPath}`,
        '',
        String(result.error.message || result.error),
      ].join('\n'),
    )
  }

  const classified = classifyDiagnostics(
    result.output,
    protectedFiles,
  )

  /**
   * Si TypeScript terminó con código != 0 pero no produjo ningún diagnóstico
   * reconocible, asumimos que hubo un problema del motor/configuración.
   */
  if (
    result.status !== 0 &&
    classified.protectedErrors.length === 0 &&
    classified.debtErrors.length === 0 &&
    classified.unclassifiedErrors.length === 0
  ) {
    fail(
      'TypeScript terminó con error pero no produjo diagnósticos reconocibles.',
      result.output.trim() || '(salida vacía)',
    )
  }

  printDebt(classified.debtErrors)
  printUnclassified(classified.unclassifiedErrors)
  printProtectedErrors(classified.protectedErrors)

  if (classified.unclassifiedErrors.length > 0) {
    process.exit(1)
  }

  if (classified.protectedErrors.length > 0) {
    process.exit(1)
  }

  console.log('\n' + LINE)

  if (result.status === 0) {
    console.log('✅ TYPECHECK OK')
    console.log('   TypeScript terminó correctamente.')
    console.log('   Sin errores en archivos protegidos.')
  } else {
    console.log('✅ TYPECHECK OK · DEUDA CONTROLADA')
    console.log(
      '   TypeScript encontró errores solamente fuera de los archivos protegidos.',
    )
    console.log(
      '   Los archivos protegidos permanecen sin errores.',
    )
  }

  console.log(LINE)
  console.log('')
}

main()
