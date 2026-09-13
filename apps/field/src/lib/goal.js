/**
 * Cálculo de meta / foco — single source of truth.
 * Determinista y unit-testeable.
 *
 * status:
 *  - SUPERADO  >= 100%
 *  - EN_RITMO  avance >= ritmo esperado por día hábil (o paceThreshold si no hay calendario)
 *  - ATRASADO  por debajo del ritmo
 *
 * Preferir pasar businessDaysElapsed + businessDaysInMonth
 * (ya existen helpers en lib/metrics.js / utils).
 */

/**
 * @param {object} opts
 * @param {number} [opts.sold=0]
 * @param {number} [opts.target=0]
 * @param {string} [opts.unit='KG']
 * @param {number} [opts.paceThreshold=70]  fallback si no hay días hábiles
 * @param {number} [opts.businessDaysElapsed]  días hábiles transcurridos en el mes (incl. hoy)
 * @param {number} [opts.businessDaysInMonth]  días hábiles totales del mes
 */
export function calcGoal({
  sold = 0,
  target = 0,
  unit = 'KG',
  paceThreshold = 70,
  businessDaysElapsed,
  businessDaysInMonth,
} = {}) {
  const s = Number(sold) || 0
  const t = Number(target) || 0
  const percentage = t > 0 ? (s / t) * 100 : 0
  const remaining = Math.max(0, t - s)

  // Ritmo esperado: proporción de mes hábil ya consumida
  let expectedPct = paceThreshold
  const elapsed = Number(businessDaysElapsed)
  const total = Number(businessDaysInMonth)
  if (elapsed > 0 && total > 0) {
    expectedPct = Math.min(100, (elapsed / total) * 100)
  }

  const status =
    percentage >= 100
      ? 'SUPERADO'
      : percentage + 0.05 >= expectedPct // tolerancia mínima de redondeo
        ? 'EN_RITMO'
        : 'ATRASADO'

  const fmt = (n) =>
    Number(n).toLocaleString('es-CL', { maximumFractionDigits: 1 })

  return {
    sold: s,
    target: t,
    unit,
    percentage: Number(Math.min(percentage, 999).toFixed(1)),
    remaining: Number(remaining.toFixed(1)),
    expectedPct: Number(expectedPct.toFixed(1)),
    status,
    formattedSold: `${fmt(s)} ${unit}`,
    formattedTarget: `${fmt(t)} ${unit}`,
    formattedRemaining: `${fmt(remaining)} ${unit}`,
  }
}

export default calcGoal
