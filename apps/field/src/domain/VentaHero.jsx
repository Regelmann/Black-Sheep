/**
 * VentaHero — la venta del mes manda, y el color dice cómo vas.
 *
 * POR QUÉ EL COLOR SALE DEL RITMO Y NO DEL PORCENTAJE
 * ---------------------------------------------------
 * Un 72% no significa nada por sí solo. El día 5 del mes es excelente;
 * el día 28 es un problema. Colorear por porcentaje crudo miente.
 *
 * Se usa calcGoal(), que compara el avance contra la proporción de días
 * HÁBILES ya consumidos. Por eso 72% el día 21 sale verde: vas en ritmo.
 * Esa función ya existía, con 5 tests, y no la estaba usando nadie.
 *
 *   SUPERADO   verde   · 100%+
 *   EN_RITMO   verde   · vas al día
 *   ATRASADO   ámbar   · por debajo del ritmo
 *   CRITICO    rojo    · a menos de 4 días hábiles y bajo el 85% del ritmo
 *
 * El bloque va ARRIBA porque es información pura, no una acción: el
 * tercio superior del teléfono es zona de estiramiento y nunca debe
 * llevar la CTA. Lo que el vendedor toca vive abajo.
 *
 * Números tabulares para que no "salten" al actualizarse.
 */
import { useMemo } from 'react'
import { calcGoal } from '../lib/calculations/goal'

const clp = (n) =>
  '$' + Math.round(Number(n) || 0).toLocaleString('es-CL')

const PALETA = {
  SUPERADO: { color: 'var(--ok-mid, #16a34a)',  glow: 'rgba(22,163,74,.30)',  texto: 'Sobre la meta' },
  EN_RITMO: { color: 'var(--ok-mid, #16a34a)',  glow: 'rgba(22,163,74,.30)',  texto: 'En ritmo' },
  ATRASADO: { color: 'var(--warn, #f59e0b)',    glow: 'rgba(245,158,11,.30)', texto: 'Bajo el ritmo' },
  CRITICO:  { color: 'var(--danger, #ef4444)',  glow: 'rgba(239,68,68,.30)',  texto: 'Crítico' },
}

/** Días hábiles (lun-sáb, como se trabaja en terreno) transcurridos y totales. */
function diasHabiles(hoy = new Date()) {
  const y = hoy.getFullYear(), m = hoy.getMonth()
  const fin = new Date(y, m + 1, 0).getDate()
  let total = 0, pasados = 0
  for (let d = 1; d <= fin; d++) {
    const dow = new Date(y, m, d).getDay()
    if (dow === 0) continue           // domingo no
    total++
    if (d <= hoy.getDate()) pasados++
  }
  return { pasados, total, restantes: Math.max(0, total - pasados) }
}

export function VentaHero({
  venta = 0,
  meta = 0,
  etiqueta = 'Venta del mes',
  zona,
  fecha,
  clientes,
}) {
  const { goal, dias, tono } = useMemo(() => {
    const d = diasHabiles()
    const g = calcGoal({
      sold: venta,
      target: meta,
      unit: 'CLP',
      businessDaysElapsed: d.pasados,
      businessDaysInMonth: d.total,
    })
    // Crítico: se acaba el mes y ni siquiera estás cerca del ritmo.
    const critico =
      g.status === 'ATRASADO' &&
      d.restantes <= 4 &&
      g.percentage < g.expectedPct * 0.85
    return { goal: g, dias: d, tono: PALETA[critico ? 'CRITICO' : g.status] }
  }, [venta, meta])

  const falta = Math.max(0, meta - venta)
  const ritmoDia = dias.restantes > 0 ? falta / dias.restantes : 0
  const ancho = Math.min(100, goal.percentage)

  return (
    <section
      className="bs-venta-hero"
      style={{ '--vh-color': tono.color, '--vh-glow': tono.glow }}
      aria-label={`${etiqueta}: ${clp(venta)}, ${goal.percentage}% de la meta`}
    >
      <header className="bs-venta-top">
        <p className="bs-venta-label">{etiqueta}</p>
        {(fecha || clientes != null) && (
          <p className="bs-venta-stamp">
            {fecha}{clientes != null && ` · ${clientes} clientes`}
          </p>
        )}
      </header>

      <p className="bs-venta-monto">{clp(venta)}</p>

      <div className="bs-venta-linea">
        <span className="bs-venta-pct">{Math.round(goal.percentage)}%</span>
        <span className="bs-venta-estado">{tono.texto}</span>
        <span className="bs-venta-meta">Meta {clp(meta)}</span>
      </div>

      <div
        className="bs-venta-barra"
        role="progressbar"
        aria-valuenow={Math.round(goal.percentage)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <i className="bs-venta-fill" style={{ width: `${ancho}%` }} />
        {/* Marca del ritmo esperado: se ve de un vistazo si vas
            adelante o atrás, sin tener que hacer la cuenta. */}
        {goal.expectedPct > 0 && goal.expectedPct < 100 && (
          <span
            className="bs-venta-marca"
            style={{ left: `${goal.expectedPct}%` }}
            title={`Ritmo esperado: ${Math.round(goal.expectedPct)}%`}
            aria-hidden="true"
          />
        )}
      </div>

      <p className="bs-venta-pie">
        {falta > 0 ? (
          <>
            Faltan <strong>{clp(falta)}</strong>
            {dias.restantes > 0 && <> · {clp(ritmoDia)}/día en {dias.restantes} días</>}
          </>
        ) : (
          <>Meta cumplida · <strong>{clp(venta - meta)}</strong> por encima</>
        )}
      </p>
    </section>
  )
}

export default VentaHero
