/**
 * Porcentajes de participación para los paneles de Gerencia.
 *
 * EL BUG QUE LO MOTIVÓ
 * `Math.round((venta / totalVenta) * 1000) / 10` sin guarda en el
 * denominador:
 *   · total 0 y venta 0 → NaN → la pantalla muestra "NaN%" y el
 *     `width: NaN%` es CSS inválido, así que la barra desaparece.
 *   · total 0 y venta > 0 (dato incompleto, un canal que no cargó) →
 *     Infinity → `Math.min(Infinity, 100)` = 100 → la barra se pinta
 *     LLENA. Un gerente ve 100% de cumplimiento donde en realidad no hay
 *     información.
 *
 * El segundo caso es el grave: no se ve roto, se ve exitoso.
 */

/**
 * Participación de `parte` sobre `total`, con un decimal.
 * Devuelve null cuando no hay base para calcular: quien muestra decide
 * qué poner (un guion), en vez de recibir un número inventado.
 *
 * @param {unknown} parte
 * @param {unknown} total
 * @returns {number|null}
 */
export function participacion(parte, total) {
  const p = Number(parte)
  const t = Number(total)
  if (!Number.isFinite(p) || !Number.isFinite(t)) return null
  if (t <= 0) return null
  const pct = Math.round((p / t) * 1000) / 10
  return Number.isFinite(pct) ? pct : null
}

/**
 * Texto listo para pantalla. Sin base no inventa un número.
 * @param {unknown} parte
 * @param {unknown} total
 */
export function textoParticipacion(parte, total) {
  const pct = participacion(parte, total)
  return pct === null ? '—' : `${pct}%`
}

/**
 * Ancho de barra, acotado a [0,100]. Sin dato la barra no se pinta:
 * mejor vacía que llena por accidente.
 * @param {unknown} parte
 * @param {unknown} total
 */
export function anchoBarra(parte, total) {
  const pct = participacion(parte, total)
  if (pct === null) return '0%'
  return `${Math.max(0, Math.min(pct, 100))}%`
}