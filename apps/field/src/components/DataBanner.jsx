/**
 * Banner "Datos al YYYY-MM-DD" — se muestra en Cartera, Metas, Gerencia.
 * Si no hay fecha, no renderiza nada.
 */
export default function DataBanner({ fecha, extra }) {
  if (!fecha && !extra) return null
  const f = fecha ? String(fecha).slice(0, 10) : null
  return (
    <div style={{
      margin:'0 0 10px',
      padding:'8px 12px',
      borderRadius:12,
      background:'linear-gradient(90deg,#fff7ed,#fafaf9)',
      border:'1px solid #fed7aa',
      display:'flex', alignItems:'center', gap:8,
      fontSize:12, color:'var(--brand-dk)', fontWeight:600,
    }}>
      <span style={{ fontSize:14 }}>📅</span>
      <span style={{ flex:1 }}>
        {f ? <>Datos al <b>{f}</b></> : 'Datos de la última bajada'}
        {extra ? <> · {extra}</> : null}
      </span>
    </div>
  )
}
