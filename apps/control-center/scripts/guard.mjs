/**
 * Guard · reglas que rompen el build antes que la producción.
 * Cada una existe por un bug real de la 15.3.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const raiz = new URL('../src', import.meta.url).pathname
const fallas = []

function archivos(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? archivos(p) : [p]
  })
}

for (const f of archivos(raiz)) {
  const bruto = readFileSync(f, 'utf8')
  const rel = f.replace(raiz, 'src')
  // Los comentarios no son código: mencionar una regla no es violarla.
  const txt = bruto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

  // R7 · columnas explícitas. Un select('*') trae de más y se rompe
  // en silencio cuando la vista cambia.
  if (/\.select\(\s*['"`]\*/.test(txt)) fallas.push(`${rel}: select('*')`)

  // R8 · ningún secreto en el repositorio.
  if (/service_role|SERVICE_KEY|eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\./.test(txt))
    fallas.push(`${rel}: parece contener un secreto`)

  // D-08 · el CSS se arregla en su cascada, no a martillazos.
  // Excepción única y documentada: prefers-reduced-motion tiene que
  // poder ganarle a cualquier animación, incluidas las de terceros.
  // Va marcada en el CSS con /* guard-permitido: reduced-motion */.
  if (f.endsWith('.css')) {
    const permitido = /guard-permitido: reduced-motion/.test(bruto)
    const usos = (txt.match(/!important/g) || []).length
    const esperados = permitido ? (bruto.match(/reduce\)[\s\S]{0,400}?\}/)?.[0].match(/!important/g) || []).length : 0
    if (usos > esperados) fallas.push(`${rel}: ${usos - esperados} !important fuera de la excepción`)
  }

  // Regla 4 · var() no resuelve dentro de un data:image/svg+xml.
  if (/data:image\/svg\+xml[^`'"]*var\(--/.test(txt))
    fallas.push(`${rel}: var(--…) dentro de un SVG embebido (sale negro)`)

  // El tenant sale del JWT. Una llamada que lo manda por parámetro se
  // puede apuntar a otra empresa.
  if (/rpc\([^)]*p_tenant/.test(txt) && !/admin_/.test(txt))
    fallas.push(`${rel}: manda p_tenant a una función que no es de superadmin`)
}

if (fallas.length) {
  console.error('\nGuard: no se puede construir\n' + fallas.map((f) => '  · ' + f).join('\n') + '\n')
  process.exit(1)
}
console.log(`Guard: ${archivos(raiz).length} archivos revisados, sin hallazgos.`)
