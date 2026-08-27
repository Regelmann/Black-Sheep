/**
 * Qué acciones están disponibles en el sheet de pedido según su estado.
 *
 * Existe aparte del componente para poder probarlo sin React (no hay
 * jsdom en el proyecto) y porque la regla es de negocio, no de pintura:
 * un pedido sin líneas no se despacha, no se manda por WhatsApp y no
 * genera PDF.
 *
 * El bug que lo motivó: con el pedido vacío los cuatro botones estaban
 * habilitados. Tocar "Enviar a bodega" llamaba al backend, que devolvía
 * el string "Sin líneas", y el vendedor recibía un recuadro rojo de
 * error por haber tocado un botón que la app le ofrecía como válido.
 * Un botón que no se puede usar no se ofrece.
 */

/**
 * @param {object} o
 * @param {Array}  o.lineas   líneas del pedido
 * @param {boolean} o.busy    hay una operación en curso
 * @returns {{puedeEnviar:boolean, puedeGuardar:boolean, puedePdf:boolean,
 *            puedeWhatsApp:boolean, motivo:string|null}}
 */
export function accionesPedido({ lineas = [], busy = false } = {}) {
  // Misma condición que aplica guardarPedido() en lib/pedido.js: una
  // línea sin cantidad o sin producto no cuenta.
  const validas = (lineas || []).filter(
    (l) => Number(l?.cantidad) > 0 && (l?.nombre || l?.sku),
  )
  const vacio = validas.length === 0

  const motivo = vacio
    ? 'Agregá al menos un producto para enviar el pedido'
    : null

  const habilitado = !vacio && !busy
  return {
    lineasValidas: validas.length,
    puedeEnviar: habilitado,
    puedeGuardar: habilitado,
    puedePdf: habilitado,
    puedeWhatsApp: habilitado,
    motivo,
  }
}