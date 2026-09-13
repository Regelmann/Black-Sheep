import { fileURLToPath } from 'node:url'
import { revisar } from '../../../packages/guard/index.mjs'

const raiz = fileURLToPath(new URL('../src', import.meta.url))
const core = fileURLToPath(new URL('../../../packages', import.meta.url))

const resultado = revisar({ raiz, core })

if (resultado.fallas.length) {
  console.error(
    '\nGuard: no se puede construir\n' +
    resultado.fallas.map((f) => '  · ' + f).join('\n') +
    '\n'
  )
  process.exit(1)
}

console.log(
  `Guard: ${resultado.revisados} archivos revisados, sin hallazgos.`
)
