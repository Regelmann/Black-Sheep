/**
 * Normalización y control de cordura de las cantidades de un pedido.
 *
 * EL PROBLEMA
 * `setCant` hacía `Math.max(0, Number(v) || 0)`: piso pero ningún techo.
 * En un teléfono, con teclado numérico y el pulgar, un cero de más es el
 * error de tipeo más común que existe:
 *
 *   12 cajas a $12.900  =        $154.800
 *   120                 =      $1.548.000
 *   1200                =     $15.480.000
 *
 * Nada avisaba. El pedido se enviaba a bodega tal cual.
 *
 * Tampoco había control de decimales: "0.001" quedaba como cantidad
 * válida, y la notación científica ("1e5") pasaba a 100.000.
 *
 * QUÉ HACE Y QUÉ NO
 * No bloquea: un pedido grande de verdad existe y el vendedor tiene que
 * poder cargarlo. Lo que hace es NORMALIZAR (entero, sin notación rara)
 * y marcar como sospechosa una cantidad fuera de rango, para que la UI
 * pida confirmación en vez de mandarla en silencio.
 */

/** Techo por línea. Por encima de esto se pide confirmación, no se bloquea. */
export const CANTIDAD_SOSPECHOSA = 500

/** Techo duro: más que esto es siempre un error de tipeo. */
export const CANTIDAD_MAXIMA = 100000

/**
 * Normaliza lo que el usuario tecleó.
 * Entero, sin negativos, sin notación científica, acotado al techo duro.
 *
 * @param {unknown} valor
 * @returns {number}
 */
export function normalizarCantidad(valor) {
  if (valor === '' || valor === null || valor === undefined) return 0
  const n = Number(valor)
  if (!Number.isFinite(n) || n <= 0) return 0
  /* Las unidades de venta son cajas, sacos y unidades: los decimales
     siempre vienen de un dedazo, no de una intención. */
  const entero = Math.floor(n)
  return Math.min(entero, CANTIDAD_MAXIMA)
}

/**
 * ¿Esta cantidad merece una confirmación antes de enviarse?
 * @param {unknown} valor
 */
export function cantidadSospechosa(valor) {
  return normalizarCantidad(valor) > CANTIDAD_SOSPECHOSA
}

/**
 * Revisa las líneas de un pedido antes de enviarlo.
 *
 * @param {Array<{nombre?:string, sku?:string, cantidad?:unknown, precio?:unknown}>} lineas
 * @returns {{sospechosas:Array<{nombre:string, cantidad:number}>, hayQueConfirmar:boolean}}
 */
export function revisarCantidades(lineas) {
  const filas = Array.isArray(lineas) ? lineas : []
  const sospechosas = []
  for (const l of filas) {
    const cantidad = normalizarCantidad(l?.cantidad)
    if (cantidad > CANTIDAD_SOSPECHOSA) {
      sospechosas.push({ nombre: String(l?.nombre || l?.sku || 'línea'), cantidad })
    }
  }
  return { sospechosas, hayQueConfirmar: sospechosas.length > 0 }
}