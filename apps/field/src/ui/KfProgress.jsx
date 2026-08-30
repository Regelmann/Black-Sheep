/**
 * KfProgress — barra de avance del design system.
 *
 * Existía una importación a `ui/index.jsx` que NUNCA existió: GoalCard la
 * pedía desde V9.0 y el archivo no estaba. No rompía el build porque el
 * componente nunca llegó a cablearse en ninguna página.
 *
 * El guard (regla R1) lo detectó al reestructurar. Se implementa acá.
 */
const TONOS = {
  ok:      'var(--ok-mid, #16a34a)',
  info:    'var(--info, #2563eb)',
  warn:    'var(--warn, #f59e0b)',
  danger:  'var(--danger, #ef4444)',
  neutral: 'var(--ink-3, #78716c)',
}

export function KfProgress({ value = 0, tone = 'neutral', label, showValue = true }) {
  const pct = Math.max(0, Math.min(100, Number(value) || 0))
  const color = TONOS[tone] || TONOS.neutral

  return (
    <div className="kf-progress">
      {(label || showValue) && (
        <div className="kf-progress-head">
          {label && <span className="kf-progress-label" style={{ color }}>{label}</span>}
          {showValue && <span className="kf-progress-value">{Math.round(pct)}%</span>}
        </div>
      )}
      <div
        className="kf-progress-track"
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label || 'Avance'}
      >
        <i style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}

export default KfProgress
