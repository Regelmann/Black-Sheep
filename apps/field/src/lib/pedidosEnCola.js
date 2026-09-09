/**
 * Pedidos que viven en la cola offline, listos para mostrar.
 *
 * Vive aparte de pedidoOffline.js (que importa supabase vía pedido.js)
 * para poder importarse en tests sin node_modules — el mismo criterio
 * de nota.test.js. Es una función PURA: recibe la cola, devuelve filas.
 *
 * Lo que decide: un pedido tomado sin señal tiene que verse en la lista
 * del día con su estado REAL ("en el teléfono · falta subir"), no
 * desaparecer hasta que haya red. Y uno agotado tiene que verse rojo,
 * porque es plata que no llegó al servidor.
 */

/** @typedef {{ id: string, cliente: string, clienteKey: string|null, lineas: Array<any>, total: number, estado: 'en_cola'|'agotado', intentos: number, ultimoError: string|null, enqueuedAt: string|null }} PedidoEnCola */

/**
 * @param {Array<any>} cola items tal como salen de loadActionQueue()
 * @returns {Array<PedidoEnCola>} filas listas para la UI, en orden de llegada
 */
export function pedidosEnCola(cola = []) {
  const items = Array.isArray(cola) ? cola : []
  return items
    .filter(i => i?.type === 'pedido')
    .map(i => {
      const lineas = Array.isArray(i.payload?.lineas) ? i.payload.lineas : []
      const total = lineas.reduce(
        (a, l) => a + (Number(l.precio) || 0) * (Number(l.cantidad) || 0),
        0
      )
      return {
        id: String(i.id),
        cliente:
          i.payload?.nombreCliente ||
          i.payload?.clienteKey ||
          'Sin nombre de cliente',
        clienteKey: i.payload?.clienteKey || null,
        lineas,
        total: Math.round(total),
        // `agotado` lo marca flushActionQueue tras MAX_INTENTOS fallidos.
        estado: i.agotado ? 'agotado' : 'en_cola',
        intentos: Number(i.attempts) || 0,
        ultimoError: i.lastError ? String(i.lastError) : null,
        enqueuedAt: i.enqueuedAt || null,
      }
    })
}

/** Etiqueta honesta por estado: nunca "guardado" si sigue en el teléfono. */
export function etiquetaEstadoPedido(estado) {
  if (estado === 'agotado') return 'Falló la subida · reintentos agotados'
  return 'En el teléfono · falta subir'
}
