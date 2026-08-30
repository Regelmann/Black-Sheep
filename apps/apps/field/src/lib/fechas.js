/**
 * Formateo de fechas para pantalla.
 *
 * POR QUÉ EXISTE
 * `new Date(x).toLocaleString('es-CL')` tiene dos modos de fallar que no
 * se parecen entre sí:
 *
 *   · `new Date('basura')` → la pantalla muestra literalmente
 *     "Invalid Date" al vendedor.
 *   · `new Date(null)` → 1970-01-01, que en hora local chilena se
 *     imprime como "12:00 a. m.". Es peor que un error: es una hora
 *     falsa perfectamente creíble junto a un pedido.
 *
 * Los llamadores se protegían con `x ? new Date(x)... : ''`, que cubre
 * null y cadena vacía pero no una fecha malformada — que es justo lo que
 * llega cuando una columna cambia de tipo o un dato viene de un CSV.
 */

/**
 * Convierte a Date sólo si el resultado es una fecha real.
 * @param {unknown} valor
 * @returns {Date|null}
 */
export function fechaValida(valor) {
  if (valor === null || valor === undefined || valor === '') return null
  const d = valor instanceof Date ? valor : new Date(/** @type {any} */ (valor))
  if (Number.isNaN(d.getTime())) return null
  /* 1970 no es una fecha de negocio: sale de `new Date(0)` o de un null
     que se coló como número. Mostrarla como hora de un pedido es peor
     que no mostrar nada. */
  if (d.getUTCFullYear() < 2000) return null
  return d
}

/**
 * Hora corta (14:35). Cadena vacía si no hay fecha usable.
 * @param {unknown} valor
 * @param {string} [fallback]
 */
export function hora(valor, fallback = '') {
  const d = fechaValida(valor)
  if (!d) return fallback
  return d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
}

/**
 * Fecha y hora legibles.
 * @param {unknown} valor
 * @param {string} [fallback]
 */
export function fechaHora(valor, fallback = '') {
  const d = fechaValida(valor)
  if (!d) return fallback
  return d.toLocaleString('es-CL', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

/**
 * Fecha larga (jueves, 27 ago).
 * @param {unknown} valor
 * @param {string} [fallback]
 */
export function fechaLarga(valor, fallback = '') {
  const d = fechaValida(valor)
  if (!d) return fallback
  return d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'short' })
}