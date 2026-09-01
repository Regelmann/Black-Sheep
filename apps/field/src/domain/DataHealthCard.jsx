import { useMemo } from 'react'

/**
 * Data Health — semáforo de confianza de los datos.
 *
 * Cumple la regla de producto: ningún panel muestra un número sin saber
 * de cuándo es ni si la cadena de datos es confiable. Tres estados:
 *   · healthy  → verde, se puede recomendar con datos.
 *   · degraded → ámbar, hay advertencias (mix parcial, stock, etc).
 *   · paused   → rojo, recomendaciones pausadas (cadena rota).
 */
const TONES = {
  ok: {
    dot: 'var(--ok-mid, #16a34a)',
    pct: 'var(--ok-mid, #16a34a)',
  },
  warn: {
    dot: 'var(--warn, #f59e0b)',
    pct: 'var(--warn, #b45309)',
  },
  danger: {
    dot: 'var(--danger, #dc2626)',
    pct: 'var(--danger, #dc2626)',
  },
  muted: {
    dot: 'var(--muted, #a8a29e)',
    pct: 'var(--muted, #a8a29e)',
  },
}

export default function DataHealthCard({ health }) {
  const tone = useMemo(() => {
    if (!health) return 'muted'
    if (health.status === 'healthy') return 'ok'
    if (health.status === 'degraded') return 'warn'
    return 'danger'
  }, [health])

  const colors = TONES[tone] || TONES.muted

  if (!health) {
    return (
      <section
        aria-label="Data Health"
        style={{
          ...base,
          borderColor: 'var(--line, #e7e5e4)',
          background: 'var(--panel, #fafaf9)',
        }}
      >
        <Head colors={colors}>
          <span style={pctStyle(colors)}>—</span>
        </Head>
        <p style={noteStyle}>Sin datos suficientes para evaluar la bajada.</p>
      </section>
    )
  }

  const label =
    health.status === 'healthy' ? 'Saludable'
      : health.status === 'degraded' ? 'Con advertencias'
        : 'Recomendaciones pausadas'

  const issues = health.integrity?.issues || []
  const warnings = health.integrity?.warnings || []
  const maxLines = 4

  return (
    <section
      aria-label="Data Health"
      aria-live="polite"
      style={{
        ...base,
        borderColor: colors.dot,
        background: 'var(--panel, #fafaf9)',
      }}
    >
      <Head colors={colors}>
        <span style={pctStyle(colors)}>{health.health}/100</span>
      </Head>
      <p style={noteStyle}>{label}</p>
      <ul style={listStyle}>
        {health.lines.slice(0, maxLines).map((l, i) => (
          <li key={i} style={liStyle}>{l}</li>
        ))}
        {issues.length > 0 && <li key="issues" style={liStyle}>Bloqueantes: {issues.length}</li>}
        {warnings.length > 0 && <li key="warnings" style={liStyle}>Advertencias: {warnings.length}</li>}
      </ul>
    </section>
  )
}

function Head({ children, colors }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span
        aria-hidden
        style={{
          width: 10,
          height: 10,
          borderRadius: 999,
          background: colors.dot,
        }}
      />
      <strong style={{ fontSize: 13, flex: 1, color: 'var(--ink, #1c1917)' }}>Data Health</strong>
      {children}
    </div>
  )
}

const base = {
  border: '1px solid',
  borderRadius: 14,
  padding: '12px 14px',
  margin: '10px 0',
}

const pctStyle = colors => ({
  fontWeight: 800,
  fontSize: 13,
  color: colors.pct,
})

const noteStyle = {
  margin: '4px 0 0',
  fontSize: 12,
  color: 'var(--ink-2, #57534e)',
}

const listStyle = {
  margin: '8px 0 0',
  padding: 0,
  listStyle: 'none',
  display: 'grid',
  gap: 4,
}

const liStyle = {
  fontSize: 12,
  color: 'var(--ink-2, #57534e)',
  paddingLeft: 10,
  position: 'relative',
}
