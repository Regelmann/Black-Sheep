/**
 * Una sola puerta para pedidos de terreno — el mismo contrato que
 * guardarNotaTerreno (nota.js).
 *
 * EL BUG QUE CIERRA
 * PedidoSheet llamaba `guardarPedido` directo al RPC. Sin señal, el
 * request fallaba y el pedido NO quedaba en ningún lado: el vendedor
 * veía un error y volvía al cuaderno. El handler `pedido` del outbox
 * existía (con tests) pero nadie lo usaba — construido sin productor.
 *
 * Y es el peor caso posible: un pedido es plata real, tomado de pie en
 * un local, en el momento exacto en que el cliente dijo que sí.
 *
 * Contrato: { ok, encolado?, data?, client_op_id?, error? }.
 * `ok:true` sólo si quedó en la base O en la cola. Nunca "guardado"
 * si no hay rastro del pedido en ningún lado.
 *
 * CUÁNDO ENCOLA (mismo criterio que notas)
 *   · navigator.onLine === false → directo a la cola, sin gastar un
 *     request que se va a perder.
 *   · error de red / esquema (columna que no existe todavía) → a la
 *     cola: el handler reintenta con backoff.
 *   · error de PERMISO (RLS / JWT) → NO encola: reintentar 8 veces un
 *     42501 no lo arregla, sólo quema la bandeja de agotados. Se
 *     devuelve el error y la UI lo muestra.
 */
import { enqueueAction, isProbablyOffline, nuevoOpId } from './offline.js'
import { esFalloDeRed } from './erroresUsuario.js'
import { guardarPedido, mapearLineasPedido } from './pedido.js'

/**
 * @param {{ ejecutivoId?: string, clienteKey?: string, nombreCliente?: string, lineas?: Array<any>, nota?: string, estado?: string, fuente?: string }} opts
 * @returns {Promise<{ ok: boolean, encolado?: boolean, data?: any, client_op_id?: string, error?: any }>}
 */
export async function guardarPedidoTerreno(opts = {}) {
  const items = mapearLineasPedido(opts.lineas)
  if (!items.length) return { ok: false, error: { message: 'El pedido no tiene líneas' } }

  const opId = nuevoOpId()

  const encolar = () => {
    // El payload replica lo que handlePedido lee: lineas YA mapeadas
    // (fuente única con el RPC), para que el reintento suba exactamente
    // lo mismo que habría subido el request original.
    enqueueAction({
      type: 'pedido',
      payload: {
        ejecutivoId: opts.ejecutivoId || null,
        clienteKey: opts.clienteKey || null,
        nombreCliente: opts.nombreCliente || null,
        lineas: items,
        nota: opts.nota || null,
        estado: opts.estado || 'borrador',
        fuente: 'field_app_offline',
      },
      client_op_id: opId,
    })
    return { ok: true, encolado: true, client_op_id: opId }
  }

  if (isProbablyOffline()) return encolar()

  const { data, error } = await guardarPedido({
    ejecutivoId: opts.ejecutivoId,
    clienteKey: opts.clienteKey,
    nombreCliente: opts.nombreCliente,
    lineas: opts.lineas,
    nota: opts.nota,
    estado: opts.estado,
    fuente: opts.fuente,
  })
  if (!error) return { ok: true, encolado: false, data }

  const texto = String(error?.message || error || '')
  // Red caída o esquema que todavía no existe: el pedido no se puede
  // perder. El outbox reintenta con backoff.
  if (esFalloDeRed(error) || /column|schema cache|42703|PGRST204/i.test(texto)) {
    return encolar()
  }
  // Permiso: reintentar no lo arregla — que una persona lo vea.
  if (/permission|42501|row-level|not authorized|jwt/i.test(texto)) {
    return { ok: false, error }
  }
  // Desconocido: ante la duda, en cola. Mejor un agotado visible que
  // un pedido evaporado.
  return encolar()
}
