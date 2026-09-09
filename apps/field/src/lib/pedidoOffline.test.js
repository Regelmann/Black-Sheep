/**
 * Pedidos de terreno: una sola puerta, nunca insert directo al RPC.
 *
 * EL BUG QUE CUBRE
 * PedidoSheet llamaba `guardarPedido` directo: sin señal el request
 * fallaba y el pedido no quedaba en NINGÚN lado. El handler `pedido`
 * del outbox existía (con tests desde V92) pero ningún productor lo
 * alimentaba — construido sin cablear, el patrón que ya costó GoalCard,
 * el Control Center y el dashboard de replicación.
 *
 * Este pedido de prueba es el escenario exacto del ROADMAP 1.1:
 * "modo avión → check-in → pedido → nota". El check-in y la nota
 * encolaban; el pedido se perdía.
 *
 * No se importa pedidoOffline.js: arrastra supabase-js vía pedido.js y
 * el test dejaría de correr sin node_modules (mismo criterio que
 * nota.test.js).
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const SRC = path.dirname(fileURLToPath(import.meta.url))
const raizSrc = path.resolve(SRC, '..')
const leer = (rel) => readFileSync(path.join(raizSrc, rel), 'utf8')

describe('guardarPedidoTerreno · contrato', () => {
  test('existe y encola items type pedido con client_op_id', () => {
    const src = leer('lib/pedidoOffline.js')
    assert.ok(/export async function guardarPedidoTerreno/.test(src))
    assert.ok(/enqueueAction\(\s*\{\s*type:\s*'pedido'/.test(src), 'debe encolar type pedido')
    assert.ok(/client_op_id:\s*opId/.test(src), 'el item lleva el op_id (idempotencia)')
  })

  test('offline va directo a la cola sin quemar un request', () => {
    const src = leer('lib/pedidoOffline.js')
    assert.ok(/isProbablyOffline\(\)\s*\)\s*return encolar\(\)/.test(src))
  })

  test('el payload usa las líneas mapeadas — fuente única con el RPC', () => {
    const src = leer('lib/pedidoOffline.js')
    assert.ok(/import\s*\{[^}]*mapearLineasPedido[^}]*\}\s*from\s*'\.\/pedido\.js'/.test(src))
    assert.ok(/lineas:\s*items/.test(src), 'payload.lineas ya mapeadas, como las lee handlePedido')
  })

  test('error de permiso NO encola: reintentarlo no lo arregla', () => {
    const src = leer('lib/pedidoOffline.js')
    assert.ok(/permission\|42501\|row-level/.test(src))
    assert.ok(
      /if\s*\(\/permission\|42501\|row-level\|not authorized\|jwt\/i\.test\(texto\)\)\s*\{\s*return\s*\{\s*ok:\s*false[^}]*\}/.test(src),
      'permiso devuelve {ok:false}, no encola'
    )
  })

  test('pedido sin líneas no encola basura', () => {
    const src = leer('lib/pedidoOffline.js')
    assert.ok(/El pedido no tiene líneas/.test(src))
    assert.match(src, /if\s*\(!items\.length\)\s*return\s*\{\s*ok:\s*false/)
  })

  test('mapearLineasPedido es la misma función que usa el RPC', () => {
    const src = leer('lib/pedido.js')
    assert.ok(/export function mapearLineasPedido/.test(src))
    // guardarPedido debe USARLA, no tener su propia copia (fuente única).
    assert.ok(/const items = mapearLineasPedido\(lineas\)/.test(src))
    // La FORMA del servidor (sku/nombre/cantidad/unidad/precio/motivo)
    // debe construirse en un solo lugar: mapearLineasPedido. Que exista
    // más de una copia es lo que permite que la cola offline y el RPC
    // diverjan silenciosamente.
    // (El filtro `cantidad > 0 && (nombre || sku)` sí aparece en WhatsApp/
    // PDF: esos mapean a texto de presentación, no a la forma del server.)
    const copias = src.match(/sku:\s*l\.sku \|\| null,/g) || []
    assert.equal(copias.length, 1, `la forma de línea del server debe construirse 1 vez, hay ${copias.length}`)
  })
})

describe('escrituras de pedido · pasan por guardarPedidoTerreno', () => {
  test('PedidoSheet no llama al RPC directo', () => {
    const src = leer('domain/PedidoSheet.jsx')
    assert.ok(/import \{ guardarPedidoTerreno \} from '\.\.\/lib\/pedidoOffline\.js'/.test(src))
    assert.ok(/await guardarPedidoTerreno\(/.test(src))
    assert.ok(
      !/guardarPedido\(\s*\{/.test(src.replace(/guardarPedidoTerreno/g, '')),
      'guardarPedido (RPC directo) no debe volver a llamarse desde la UI'
    )
  })

  test('PedidoSheet bloquea el doble envío cuando el pedido quedó en cola', () => {
    const src = leer('domain/PedidoSheet.jsx')
    assert.ok(/if \(encolado\) return/.test(src), 're-confirmar duplicaría el pedido')
    assert.ok(/disabled=\{busy \|\| !!encolado\}/.test(src), 'los botones se deshabilitan')
  })

  test('el mensaje nunca dice "guardado" si quedó en el teléfono', () => {
    const src = leer('domain/PedidoSheet.jsx')
    assert.ok(/falta subir/.test(src), 'el mensaje debe decir que falta subir')
    const visita = leer('pages/Visita.jsx')
    assert.ok(
      /r\?\.encolado[\s\S]*?falta subir/.test(visita),
      'Visita también debe diferenciar el mensaje cuando encola'
    )
  })
})
