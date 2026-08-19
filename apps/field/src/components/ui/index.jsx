export function KfCard({ children, className = '', as: Tag = 'div', ...props }) {
  return <Tag className={`kf-card ${className}`.trim()} {...props}>{children}</Tag>
}

export function KfBadge({ children, tone = 'neutral', className = '' }) {
  return <span className={`kf-badge kf-badge-${tone} ${className}`.trim()}>{children}</span>
}

export function KfMetric({ label, value, detail, tone = 'default', className = '' }) {
  return (
    <div className={`kf-metric kf-metric-${tone} ${className}`.trim()}>
      <div className="kf-metric-label">{label}</div>
      <div className="kf-metric-value">{value}</div>
      {detail ? <div className="kf-metric-detail">{detail}</div> : null}
    </div>
  )
}

export function KfSectionTitle({ eyebrow, title, action }) {
  return (
    <div className="kf-section-head">
      <div>
        {eyebrow ? <div className="kf-section-eyebrow">{eyebrow}</div> : null}
        <h2>{title}</h2>
      </div>
      {action || null}
    </div>
  )
}

export function KfProgress({ value = 0, tone = 'brand', label }) {
  const safe = Math.max(0, Math.min(100, Number(value) || 0))
  return (
    <div className="kf-progress-wrap">
      {label ? <div className="kf-progress-label"><span>{label}</span><strong>{Math.round(safe)}%</strong></div> : null}
      <div className="kf-progress" aria-label={label} role="progressbar" aria-valuenow={safe} aria-valuemin="0" aria-valuemax="100">
        <span className={`kf-progress-fill kf-progress-${tone}`} style={{ width: `${safe}%` }} />
      </div>
    </div>
  )
}
