/**
 * Días hábiles del mes — fuente única.
 *
 * POR QUÉ EXISTE
 * La proyección de cierre de mes se calculaba de TRES maneras distintas,
 * y las tres se muestran en las mismas pantallas (Hoy y Gerencia):
 *
 *   predictor.js  vtaMtd + (vtaMtd / díasCorridos) * díasCorridosRestantes
 *   calcGoal      ritmo esperado sobre días hábiles reales
 *   metrics.js    (vtaMtd / díasHábiles) * 22   ← 22 fijo
 *
 * Con vtaMtd 4.500.000 al 17 de agosto de 2026 daban 8.205.882 /
 * 8.590.909 / 9.000.000. La tercera anuncia "meta cumplida" y las otras
 * dos no.
 *
 * El error de los días corridos no es parejo: el día 3 de un mes que
 * arranca sábado, la proyección por corridos da 34% de la meta cuando
 * por días hábiles va 70%. El vendedor lee que está fundido justo
 * cuando va en ritmo — y esa lectura cambia a quién visita.
 *
 * Los 22 días fijos son el promedio de un mes cualquiera; los meses
 * reales tienen entre 20 y 23 hábiles.
 *
 * Sin feriados: no hay calendario de festivos en el proyecto y
 * inventarlo sería peor que omitirlo. Sábados y domingos alcanzan para
 * corregir la distorsión grande.
 */

/** @param {Date} d */
const esHabil = (d) => {
  const dow = d.getDay()
  return dow !== 0 && dow !== 6
}

/**
 * Días hábiles de un mes: transcurridos (incluyendo hoy) y totales.
 *
 * @param {Date} [ahora] fecha de referencia; por defecto hoy
 * @returns {{transcurridos:number, totales:number, restantes:number}}
 */
export function diasHabilesDelMes(ahora = new Date()) {
  const base = ahora instanceof Date && !Number.isNaN(ahora.getTime()) ? ahora : new Date()
  const anio = base.getFullYear()
  const mes = base.getMonth()
  const hoy = base.getDate()
  const ultimoDia = new Date(anio, mes + 1, 0).getDate()

  let transcurridos = 0
  let totales = 0
  for (let d = 1; d <= ultimoDia; d++) {
    if (!esHabil(new Date(anio, mes, d))) continue
    totales++
    if (d <= hoy) transcurridos++
  }
  /* Si el mes arranca sábado, el día 1 hay 0 hábiles transcurridos y
     cualquier división por ese número explota. El piso de 1 mantiene el
     ritmo finito; el llamador decide si la cifra es significativa. */
  return {
    transcurridos: Math.max(1, transcurridos),
    totales: Math.max(1, totales),
    restantes: Math.max(0, totales - transcurridos),
  }
}

/**
 * Proyección de cierre de mes al ritmo de días hábiles.
 *
 * Devuelve null cuando no hay base para proyectar, en vez de un número
 * inventado: extrapolar el mes entero desde el primer día produce cifras
 * absurdas (una venta de 500.000 el día 1 proyectaba 15.500.000).
 *
 * @param {number} ventaMtd acumulado del mes
 * @param {Date} [ahora]
 * @param {number} [minimoDias] días hábiles mínimos para que la proyección signifique algo
 * @returns {number|null}
 */
export function proyeccionCierre(ventaMtd, ahora = new Date(), minimoDias = 3) {
  const v = Number(ventaMtd)
  if (!Number.isFinite(v) || v < 0) return null
  const { transcurridos, totales } = diasHabilesDelMes(ahora)
  if (transcurridos < minimoDias) return null
  const ritmo = v / transcurridos
  const proy = ritmo * totales
  return Number.isFinite(proy) ? Math.round(proy) : null
}