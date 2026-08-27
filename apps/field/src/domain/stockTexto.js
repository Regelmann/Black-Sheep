/**
 * Lectura del stock de una línea de pedido.
 *
 * Vive aparte de PedidoSheet.jsx porque decide dos cosas que el vendedor
 * usa para comprometerse con un cliente: el número que ve y si el producto
 * sale marcado como crítico.
 *
 * EL BUG QUE LO MOTIVÓ
 * `Number(s.stock_operativo)` sobre una fila sin esa columna da NaN.
 *   · en pantalla: "stock NaN"
 *   · peor: `NaN <= 0` es false, así que un producto sin dato de stock
 *     NO se marcaba como crítico y se veía como disponible.
 *
 * Un vendedor que promete mercadería que no existe pierde el pedido y la
 * confianza del cliente. "Sin dato" y "hay stock" no son lo mismo.
 */

/**
 * Cantidad de stock utilizable, o null si no hay dato confiable.
 * @param {any} fila
 * @returns {number|null}
 */
export function stockKg(fila) {
  if (!fila) return null
  const bruto = fila.stock_operativo
  if (bruto === null || bruto === undefined || bruto === '') return null
  const v = Number(bruto)
  return Number.isFinite(v) ? v : null
}

/**
 * Texto para mostrar. Sin dato NO se inventa un número.
 * @param {any} fila
 * @param {string} [unidad]
 */
export function textoStock(fila, unidad = 'kg') {
  const kg = stockKg(fila)
  if (kg === null) return 'stock sin dato'
  return `stock ${kg.toLocaleString('es-CL')} ${unidad}`.trimEnd()
}

/**
 * ¿Hay que advertir al vendedor antes de que comprometa este producto?
 * Sin dato se advierte: es más barato verificar que prometer de más.
 * @param {any} fila
 */
export function esCritico(fila) {
  const estado = String(fila?.estado_stock || '').toUpperCase()
  if (estado.includes('CRIT')) return true
  const kg = stockKg(fila)
  if (kg === null) return true
  return kg <= 0
}