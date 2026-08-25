import { useState } from 'react'

const money = v => {
  const n = Number(v) || 0
  if (!n) return null
  return `$${Math.round(n).toLocaleString('es-CL')}`
}

const TYPE_LABEL = {
  order: 'Pedido',
  replenish: 'Reponer',
  protect: 'Rescatar',
  focus: 'Foco',
}

export function DecisionCard({ item, featured = false, onAction }) {
  const [openWhy, setOpenWhy] = useState(false)
  if (!item) return null

  const att = item.attention || 'today'
  const type = item.type || 'replenish'
  const why = Array.isArray(item.why) ? item.why : []
  const evidence = Array.isArray(item.evidence) ? item.evidence : []
  const value = money(item.expectedValue)
  const parts = item.parts

  return (
    <article className={'bs-dc bs-dc--compact' + (featured ? ' is-featured' : '') + ` att-${att}` + ` type-${type}`}>
      <div className="bs-dc-top">
        <span className={`bs-dc-badge att-${att}`}>
          {att === 'now' ? 'AHORA' : att === 'today' ? 'HOY' : 'SEMANA'}
        </span>
        <span className="bs-dc-type">{TYPE_LABEL[type] || type}</span>
        {item.score != null && <span className="bs-dc-score">{item.score}</span>}
        {value && <span className="bs-dc-value">{value}</span>}
      </div>

      <h3 className="bs-dc-title">{item.title}</h3>
      <p className="bs-dc-reason">{item.reason}</p>

      {evidence.length > 0 && (
        <div className="bs-dc-evidence">
          {evidence.map((e, i) => (
            <div key={i} className={'bs-dc-ev ' + (e.tone || 'neutral')}>
              <em>{e.label}</em>
              <strong>{e.value}</strong>
            </div>
          ))}
        </div>
      )}

      {(why.length > 0 || parts) && (
        <div className="bs-dc-why-wrap">
          <button
            type="button"
            className="bs-dc-why-toggle"
            onClick={e => {
              e.stopPropagation()
              setOpenWhy(v => !v)
            }}
          >
            {openWhy ? 'Ocultar detalle' : '¿Por qué?'}
            {item.confidence != null ? ` · ${item.confidence}%` : ''}
          </button>
          {openWhy && (
            <div className="bs-dc-why-body">
              {parts && (
                <div className="bs-dc-parts">
                  {[
                    ['Urgencia', parts.urgencia],
                    ['Valor', parts.valor],
                    ['Prob.', parts.probabilidad],
                    ['Acción', parts.accionable],
                  ].map(([lab, val]) => (
                    <div key={lab}>
                      <em>{lab}</em>
                      <strong>{val}</strong>
                    </div>
                  ))}
                </div>
              )}
              {why.length > 0 && (
                <ul className="bs-dc-why-list">
                  {why.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        className="bs-dc-cta"
        onClick={e => {
          e.stopPropagation()
          onAction?.(item)
        }}
      >
        {item.actionLabel || 'Ir'}
      </button>
    </article>
  )
}

export function DecisionSection({ label, children }) {
  if (!children) return null
  return (
    <div className="bs-dc-section">
      {label && <div className="bs-dc-section-label">{label}</div>}
      <div className="bs-dc-stack">{children}</div>
    </div>
  )
}
