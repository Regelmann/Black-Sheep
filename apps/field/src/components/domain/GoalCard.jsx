/**
 * GoalCard — meta de foco (pollo, etc.) con calcGoal.
 */
import { calcGoal } from '../../lib/calculations/goal'
import { KfProgress } from '../ui/index.jsx'

export function GoalCard({
  title,
  sold,
  target,
  unit = 'KG',
  isFocus = false,
  businessDaysElapsed,
  businessDaysInMonth,
  onWhyClick,
  onViewClients,
}) {
  const g = calcGoal({
    sold,
    target,
    unit,
    businessDaysElapsed,
    businessDaysInMonth,
  })

  const statusLabel =
    g.status === 'SUPERADO' ? 'Superado' : g.status === 'EN_RITMO' ? 'En ritmo' : 'Atrasado'
  const statusTone =
    g.status === 'SUPERADO' ? 'ok' : g.status === 'EN_RITMO' ? 'brand' : 'warn'

  return (
    <article className="bs-goal-card" data-status={g.status}>
      <header className="bs-goal-head">
        <div>
          {isFocus && <span className="bs-goal-badge">HOY · Foco</span>}
          <h3 className="bs-goal-title">{title}</h3>
          <p className="bs-goal-sub">
            {g.percentage}% meta · faltan {g.formattedRemaining}
            {g.expectedPct != null && (
              <span className="bs-goal-pace"> · ritmo día {g.expectedPct}%</span>
            )}
          </p>
        </div>
        <div className={`bs-goal-pct is-${statusTone}`}>{Math.round(g.percentage)}</div>
      </header>

      <div className="bs-goal-metrics">
        <div className="bs-goal-metric">
          <span className="bs-goal-metric-label">AVANCE</span>
          <strong>{g.percentage}%</strong>
        </div>
        <div className="bs-goal-metric">
          <span className="bs-goal-metric-label">FALTA</span>
          <strong>{g.remaining}</strong>
        </div>
      </div>

      <KfProgress value={Math.min(100, g.percentage)} tone={statusTone} label={statusLabel} />

      {onWhyClick && (
        <button
          type="button"
          className="bs-goal-why"
          onClick={onWhyClick}
          aria-label="Explicar cálculo de la meta"
        >
          ¿Por qué? · {g.percentage}% (ritmo {g.expectedPct}%)
        </button>
      )}

      {onViewClients && (
        <button type="button" className="bs-goal-cta" onClick={onViewClients}>
          Ver clientes
        </button>
      )}
    </article>
  )
}

export default GoalCard
