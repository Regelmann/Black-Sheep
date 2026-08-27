/**
 * Decide el tono y el mensaje del panel de venta del mes.
 *
 * Vive aparte de VentaHero.jsx a propósito: es la regla de negocio que
 * decide si al vendedor se le dice "vas bien", "vas mal" o "falta el
 * dato", y tiene que poder probarse sin montar React (no hay jsdom en
 * este proyecto).
 *
 * El caso que motivó extraerlo: con meta 0 el panel mostraba "0%
 * Crítico" y "Meta cumplida · $0 por encima" a la vez, porque
 * `falta = max(0, meta - venta)` da 0 cuando no hay meta.
 */

export const PALETA = {
  SUPERADO: { color: 'var(--ok-mid, #16a34a)',  glow: 'rgba(22,163,74,.30)',   texto: 'Sobre la meta' },
  EN_RITMO: { color: 'var(--ok-mid, #16a34a)',  glow: 'rgba(22,163,74,.30)',   texto: 'En ritmo' },
  ATRASADO: { color: 'var(--warn, #f59e0b)',    glow: 'rgba(245,158,11,.30)',  texto: 'Bajo el ritmo' },
  CRITICO:  { color: 'var(--danger, #ef4444)',  glow: 'rgba(239,68,68,.30)',   texto: 'Crítico' },
  // Sin meta cargada: gris neutro. Ni verde (no hay logro) ni rojo (no
  // hay incumplimiento): simplemente falta el dato.
  SIN_META: { color: 'var(--ink-3, #78716c)',   glow: 'rgba(120,113,108,.20)', texto: 'Sin meta' },
}

/** ¿Hay una meta real contra la que comparar? */
export const sinMetaCargada = (meta) => !(Number(meta) > 0)

/**
 * @param {object} o
 * @param {number} o.venta
 * @param {number} o.meta
 * @param {{status:string, percentage:number, expectedPct:number}} o.goal
 * @param {{restantes:number}} o.dias
 * @returns {{clave:string, tono:object, pie:'SIN_META'|'FALTA'|'CUMPLIDA'}}
 */
export function tonoDeVenta({ venta = 0, meta = 0, goal, dias }) {
  if (sinMetaCargada(meta)) {
    return { clave: 'SIN_META', tono: PALETA.SIN_META, pie: 'SIN_META' }
  }

  // Crítico: se acaba el mes y ni siquiera estás cerca del ritmo.
  const critico =
    goal.status === 'ATRASADO' &&
    dias.restantes <= 4 &&
    goal.percentage < goal.expectedPct * 0.85

  const clave = critico ? 'CRITICO' : goal.status
  const pie = Math.max(0, meta - venta) > 0 ? 'FALTA' : 'CUMPLIDA'
  return { clave, tono: PALETA[clave], pie }
}