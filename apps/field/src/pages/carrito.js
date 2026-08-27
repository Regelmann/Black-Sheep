/**
 * Totales del carrito del catálogo público.
 *
 * Vive aparte de CatalogoCliente.jsx porque es la única parte de la app
 * que ve el CLIENTE FINAL, no el vendedor, y porque decide una cifra de
 * plata: tiene que poder probarse sin React.
 *
 * El bug que lo motivó: los productos sin precio se muestran como
 * "Consultar" en la lista, pero el total los sumaba como $0. Un carrito
 * con 12 arroz ($15.480), 6 aceites (sin precio) y 10 fideos ($8.900)
 * anunciaba "Total estimado $24.380" — una cifra que el cliente lee como
 * lo que va a pagar, cuando en realidad faltan por cotizar 6 unidades.
 *
 * Un total que miente en el momento de confirmar es un problema
 * comercial, no de interfaz.
 */

/** ¿Esta línea tiene un precio utilizable? */
export const tienePrecio = (linea) => Number(linea?.precio) > 0

/**
 * @param {Array} cart líneas del carrito
 * @returns {{
 *   total: number,            suma de lo que SÍ tiene precio
 *   unidades: number,         unidades totales
 *   lineasSinPrecio: number,  cuántas líneas quedan por cotizar
 *   unidadesSinPrecio: number,
 *   parcial: boolean,         el total no cubre todo el pedido
 *   etiqueta: string          cómo llamar a esa cifra sin mentir
 * }}
 */
export function resumenCarrito(cart = []) {
  const lineas = Array.isArray(cart) ? cart : []

  let total = 0
  let unidades = 0
  let lineasSinPrecio = 0
  let unidadesSinPrecio = 0

  for (const l of lineas) {
    const cantidad = Number(l?.cantidad) || 0
    unidades += cantidad
    if (tienePrecio(l)) {
      total += Number(l.precio) * cantidad
    } else if (cantidad > 0) {
      lineasSinPrecio += 1
      unidadesSinPrecio += cantidad
    }
  }

  const parcial = lineasSinPrecio > 0

  // Sin nada que cotizar, "Total estimado" es honesto. Con líneas sin
  // precio, la cifra sólo cubre parte del pedido y hay que decirlo.
  const etiqueta = !lineas.length
    ? 'Total estimado'
    : total === 0
      ? 'A cotizar'
      : parcial
        ? 'Parcial · falta cotizar'
        : 'Total estimado'

  return { total, unidades, lineasSinPrecio, unidadesSinPrecio, parcial, etiqueta }
}