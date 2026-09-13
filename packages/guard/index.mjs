/**
 * Guard · UNA implementación para las cuatro apps.
 *
 * Estaba copiado en cada app y llegó a tener dos versiones de la misma
 * regla, una apuntando a una carpeta borrada. Ese es exactamente el
 * problema que el guard existe para evitar, cometido por el guard.
 *
 * Cada regla viene de un error real en producción o en una captura.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'

/** Clases que no son estilo: estado semántico que el CSS usa en pares. */
const MODIFICADORES = new Set([
  'ok', 'mal', 'aviso', 'error', 'critico', 'logro', 'atencion', 'alerta',
  'activa', 'activo', 'hecho', 'pendiente', 'primario', 'peligro', 'chico',
  'cuadra', 'no-cuadra', 'sube', 'baja', 'igual', 'plataforma', 'ancho-total',
  'num', 'silencio', 'vacio', 'sello', 'pulsable',
])

/** Esquemas internos: ningún cliente puede consultarlos directamente. */
const ESQUEMAS_INTERNOS = '(?:platform|core|ingest|compliance)'

function archivos(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? archivos(p) : [p]
  })
}

export function revisar({ raiz, core }) {
  const fallas = []

  // El guard no se revisa a sí mismo: sus patrones SON lo que busca.
  const todos = [...archivos(raiz), ...archivos(core)]
    .filter((f) => !f.split(/[\\/]+/).includes('guard'))

  const rel = (f) => f.replace(raiz, 'src').replace(core, 'packages')

  for (const f of todos) {
    const bruto = readFileSync(f, 'utf8')

    // Los comentarios no son código: mencionar una regla no es violarla.
    const txt = bruto
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')

    // R1 · Columnas explícitas. select('*') trae de más y se rompe en
    //      silencio cuando la vista cambia.
    if (/\.select\(\s*['"`]\*/.test(txt))
      fallas.push(`${rel(f)}: select('*')`)

    // R2 · Ningún secreto en el repositorio.
    if (/service_role|SERVICE_ROLE_KEY\s*=\s*['"]ey/.test(txt))
      fallas.push(`${rel(f)}: parece contener un secreto`)

    if (/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{20,}/.test(txt))
      fallas.push(`${rel(f)}: parece contener un JWT`)

    // R3 · El CSS se arregla en su cascada, no a martillazos.
    if (f.endsWith('.css')) {
      const permitido = /guard-permitido: reduced-motion/.test(bruto)
      const usos = (txt.match(/!important/g) || []).length

      const esperados = permitido
        ? (
            bruto
              .match(
                /reduce\)[\s\S]{0,600}?\}\s*\}/
              )?.[0]
              .match(/!important/g) || []
          ).length
        : 0

      if (usos > esperados) {
        fallas.push(
          `${rel(f)}: ${usos - esperados} !important fuera de la excepción`
        )
      }
    }

    // R4 · var() no resuelve dentro de un SVG embebido: sale negro.
    if (/data:image\/svg\+xml[^`'"]*var\(--/.test(txt))
      fallas.push(`${rel(f)}: var(--…) dentro de un SVG embebido`)

    // R5 · El tenant sale del JWT, nunca de un parámetro.
    if (/rpc\([^)]*p_tenant/.test(txt) && !/admin_/.test(txt))
      fallas.push(`${rel(f)}: manda p_tenant a una función que no es de superadmin`)

    // R9 · Frontera Apps → API.
    //
    // Las aplicaciones consumen la superficie pública/canónica `api`.
    // Nunca deben consultar directamente los esquemas internos:
    // platform, core, ingest o compliance.
    //
    // Esto evita que la UI termine acoplada a tablas, vistas o funciones
    // internas de implementación.
    if (
      new RegExp(
        `\\.from\\(\\s*['"\`]${ESQUEMAS_INTERNOS}\\.`,
      ).test(txt)
    ) {
      fallas.push(
        `${rel(f)}: acceso directo a un esquema interno mediante from(); usar api`
      )
    }

    if (
      new RegExp(
        `\\.schema\\(\\s*['"\`]${ESQUEMAS_INTERNOS}['"\`]\\s*\\)`,
      ).test(txt)
    ) {
      fallas.push(
        `${rel(f)}: acceso directo a un esquema interno mediante schema(); usar api`
      )
    }

    if (
      new RegExp(
        `\\.rpc\\(\\s*['"\`]${ESQUEMAS_INTERNOS}\\.`,
      ).test(txt)
    ) {
      fallas.push(
        `${rel(f)}: acceso directo a una función interna mediante rpc(); usar api`
      )
    }
  }

  // R6 · Un token que se usa y no existe. CSS no da error: simplemente
  //      no aplica. Así `--fuente` faltó y todo salió en serif.
  {
    const definidas = new Set()

    for (const f of todos.filter((x) => x.endsWith('.css'))) {
      for (const m of readFileSync(f, 'utf8').matchAll(
        /^\s*(--[a-z0-9-]+)\s*:/gm
      )) {
        definidas.add(m[1])
      }
    }

    for (const f of todos.filter((x) => x.endsWith('.css'))) {
      for (const m of readFileSync(f, 'utf8').matchAll(
        /var\((--[a-z0-9-]+)/g
      )) {
        if (!definidas.has(m[1])) {
          fallas.push(
            `${rel(f)}: usa ${m[1]}, que no está definida`
          )
        }
      }
    }
  }

  // R7 · Una clase usada en JSX que ninguna hoja define. Al mover las
  //      tarjetas a packages/ui se borraron .ficha y .tablero, y la
  //      pantalla de Empresas quedó como texto plano sin avisar.
  {
    const clases = new Set()

    for (const f of todos.filter((x) => x.endsWith('.css'))) {
      for (const m of readFileSync(f, 'utf8').matchAll(
        /\.([a-z][a-z0-9-]*)/g
      )) {
        clases.add(m[1])
      }
    }

    for (const f of archivos(raiz).filter((x) => x.endsWith('.jsx'))) {
      const txt = readFileSync(f, 'utf8')
      const usadas = new Set()

      for (const m of txt.matchAll(/className="([^"{]+)"/g)) {
        for (const c of m[1].split(/\s+/)) {
          if (c) usadas.add(c)
        }
      }

      for (const m of txt.matchAll(/className=\{`([a-z0-9 -]+)/g)) {
        for (const c of m[1].split(/\s+/)) {
          if (c) usadas.add(c)
        }
      }

      for (const c of usadas) {
        if (!clases.has(c) && !MODIFICADORES.has(c)) {
          fallas.push(
            `${rel(f)}: usa la clase .${c}, que ninguna hoja define`
          )
        }
      }
    }
  }

  // R8 · Máximo cuatro tarjetas de KPI por pantalla. Con cinco nadie
  //      sabe cuál mirar primero y la quinta queda huérfana abajo.
  for (const f of archivos(raiz).filter((x) => x.endsWith('.jsx'))) {
    const n = (
      readFileSync(f, 'utf8').match(/<Kpi\s/g) || []
    ).length

    if (n > 4) {
      fallas.push(
        `${rel(f)}: ${n} tarjetas de KPI, el máximo es 4`
      )
    }
  }

  return {
    fallas,
    revisados: todos.length,
  }
}