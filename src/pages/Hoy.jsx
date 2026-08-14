import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { money, DataAsOfBanner } from '../components.jsx'
import { useEjecutivo } from '../App.jsx'
import { computeConsistentMetrics } from '../lib/metrics'

function limpiaEstado(e) {
  return (e || '').replace(/^\d+_?/, '').replace(/_/g, ' ')
}

const TYPE_META = {
  reponer: { badge: 'REPONER', cls: 'reponer', color: '#c2410c' },
  riesgo: { badge: 'RIESGO', cls: 'riesgo', color: '#dc2626' },
  enfriandose: { badge: 'ENFRIÁNDOSE', cls: 'fuga', color: '#d97706' },
  nuevo: { badge: 'NUEVO', cls: 'reponer', color: '#2563eb' },
  visita: { badge: 'VISITAR', cls: 'reponer', color: '#57534e' },
  pedido: { badge: 'PEDIDO', cls: 'reponer', color: '#0d9488' },
}

export default function Hoy() {
  const nav = useNavigate()
  const { zonaVista, eidVista, nombre } = useEjecutivo() || {}
  const [cartera, setCartera] = useState([])
  const [meta, setMeta] = useState(null)
  const [focos, setFocos] = useState([])
  const [loading, setLoading] = useState(true)
  const [dataAsOf, setDataAsOf] = useState(null)
  const [offline, setOffline] = useState(typeof navigator !== 'undefined' && !navigator.onLine)

  useEffect(() => {
    const on = () => setOffline(false)
    const off = () => setOffline(true)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  useEffect(() => {
    if (!eidVista) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const [cRes, mRes, fRes] = await Promise.all([
          supabase.from('cartera').select('*').eq('ejecutivo_id', eidVista),
          supabase.from('metas').select('*').eq('ejecutivo_id', eidVista).order('mes', { ascending: false }).limit(1),
          supabase.from('focos').select('*').eq('ejecutivo_id', eidVista),
        ])
        if (cancelled) return
        const rows = cRes.data || []
        setCartera(rows)
        setMeta(mRes.data?.[0] || null)
        setFocos(fRes.data || [])
        const snap = rows.map(r => r.fecha_snapshot).filter(Boolean).sort().pop()
        setDataAsOf(snap || mRes.data?.[0]?.fecha_snapshot || null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [eidVista])

  const m = useMemo(() => computeConsistentMetrics(cartera, meta), [cartera, meta])

  const saludo = () => {
    const h = new Date().getHours()
    if (h < 12) return 'Buenos días'
    if (h < 19) return 'Buenas tardes'
    return 'Buenas noches'
  }
  const nombreCorto = (nombre || '').split(' ')[0] || 'equipo'

  if (loading) {
    return (
      <div className="wrap" style={{ paddingTop: 24 }}>
        <div className="skeleton" style={{ height: 120, marginBottom: 12 }} />
        <div className="skeleton" style={{ height: 72, marginBottom: 12 }} />
        <div className="skeleton" style={{ height: 160 }} />
        <p className="muted" style={{ textAlign: 'center', marginTop: 16 }}>Armando tu día…</p>
      </div>
    )
  }

  return (
    <div>
      <div className="page-hero">
        <div className="eyebrow">KeyFoods · Mi día</div>
        <h1>
          {saludo()}, {nombreCorto}
        </h1>
        <p className="sub">
          {zonaVista || '—'} ·{' '}
          {new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'short' })}
          {offline && (
            <span
              style={{
                marginLeft: 8,
                fontSize: 11,
                fontWeight: 700,
                background: '#fef3c7',
                color: '#92400e',
                padding: '2px 8px',
                borderRadius: 999,
              }}
            >
              Offline
            </span>
          )}
        </p>
      </div>

      <div className="wrap">
        {dataAsOf && <DataAsOfBanner fecha={dataAsOf} extra={`${m.totalClientes} clientes`} />}

        {/* Hero venta + meta integrada (antes tab Metas) */}
        <div className="hero-metric">
          <div className="hm-label">Venta del mes</div>
          <div className="hm-value">{money(m.ventaMtd)}</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
            <span
              style={{
                fontSize: 22,
                fontWeight: 800,
                color: m.pct >= 70 ? '#4ade80' : m.pct >= 40 ? '#fbbf24' : '#fb923c',
              }}
            >
              {m.pct}%
            </span>
            <span className="hm-meta">Meta {money(m.metaMensual)}</span>
          </div>
          <div className="progress-bg" style={{ marginTop: 10, background: 'rgba(255,255,255,0.12)' }}>
            <div
              className="progress-fill"
              style={{
                width: Math.min(m.pct, 100) + '%',
                background: m.pct >= 70 ? '#4ade80' : '#fb923c',
              }}
            />
          </div>
          <div className="hm-meta" style={{ marginTop: 10 }}>
            Faltan {money(m.brecha)}
            {m.ritmoDia > 0 && <> · Ritmo {money(m.ritmoDia)}/día</>}
          </div>
        </div>

        {m.metaMensual > 0 && (
          <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div className="card-label" style={{ marginBottom: 4 }}>
                Proyección del mes
              </div>
              <div style={{ fontSize: 20, fontWeight: 800 }}>{money(m.proyeccion)}</div>
            </div>
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                textAlign: 'right',
                color: m.proyeccionDiff >= 0 ? 'var(--green)' : 'var(--red)',
              }}
            >
              {m.proyeccionDiff >= 0 ? '↑' : '↓'} {money(Math.abs(m.proyeccionDiff))}
              <div className="muted" style={{ fontWeight: 600, fontSize: 11 }}>
                {m.proyeccionDiff >= 0 ? 'sobre meta' : 'bajo meta'}
              </div>
            </div>
          </div>
        )}

        {/* Focos del mes (ex-Metas) */}
        {focos.length > 0 && (
          <>
            <div className="section-title">Focos del mes</div>
            {focos.map((f, i) => {
              const vendido = Number(f.vendido_unidad) || 0
              const metaU = Number(f.meta_unidad) || 0
              const p = metaU ? Math.round((vendido / metaU) * 100) : 0
              const unidad = f.unidad_meta || 'KG'
              const atrasado = /ATRAS|SIN/i.test(f.estado_ritmo || '') || (metaU && p < 70)
              return (
                <div key={i} className="card" style={{ padding: '12px 14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <b style={{ fontSize: 15 }}>{f.foco}</b>
                      <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                        {vendido.toLocaleString('es-CL')} / {metaU.toLocaleString('es-CL')} {unidad}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div
                        style={{
                          fontWeight: 800,
                          fontSize: 18,
                          color: atrasado ? 'var(--red)' : 'var(--green)',
                        }}
                      >
                        {p}%
                      </div>
                      {atrasado && (
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--red)' }}>ATRASADO</div>
                      )}
                    </div>
                  </div>
                  <div className="progress-bg" style={{ marginTop: 8 }}>
                    <div
                      className="progress-fill"
                      style={{
                        width: Math.min(p, 100) + '%',
                        background: atrasado ? 'var(--red)' : 'var(--green)',
                      }}
                    />
                  </div>
                </div>
              )
            })}
          </>
        )}

        {/* Day Summary — chips tappable, números consistentes */}
        <div className="section-title">Resumen del día</div>
        <div className="kpi-row" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <button
            type="button"
            className="kpi-tile"
            style={{ textAlign: 'left', border: '1px solid var(--line)', minHeight: 64 }}
            onClick={() => nav('/cartera?filtro=ReponerHoy')}
            aria-label={`${m.reponerHoy} a reponer hoy`}
          >
            <div className="kpi-n t-brand">{m.reponerHoy}</div>
            <div className="kpi-l">Reponer hoy</div>
          </button>
          <button
            type="button"
            className="kpi-tile"
            style={{ textAlign: 'left', border: '1px solid var(--line)', minHeight: 64 }}
            onClick={() => nav('/cartera?filtro=Riesgo')}
            aria-label={`${m.nRiesgo} en riesgo`}
          >
            <div className="kpi-n t-amber">{m.nRiesgo}</div>
            <div className="kpi-l">En riesgo</div>
          </button>
          <button
            type="button"
            className="kpi-tile"
            style={{ textAlign: 'left', border: '1px solid var(--line)', minHeight: 64 }}
            onClick={() => nav('/cartera?filtro=Enfri')}
            aria-label={`${m.nEnfri} enfriándose`}
          >
            <div className="kpi-n t-blue">{m.nEnfri}</div>
            <div className="kpi-l">Enfriándose</div>
          </button>
          <button
            type="button"
            className="kpi-tile"
            style={{ textAlign: 'left', border: '1px solid var(--line)', minHeight: 64 }}
            onClick={() => nav('/cartera?filtro=ActivosMes')}
          >
            <div className="kpi-n" style={{ color: 'var(--green)' }}>
              {m.nActivos}
            </div>
            <div className="kpi-l">Activos mes</div>
          </button>
          <button
            type="button"
            className="kpi-tile"
            style={{ textAlign: 'left', border: '1px solid var(--line)', minHeight: 64 }}
            onClick={() => nav('/cartera?filtro=Nuevos')}
          >
            <div className="kpi-n t-blue">{m.nNuevos}</div>
            <div className="kpi-l">Nuevos mes</div>
          </button>
          <div className="kpi-tile" style={{ minHeight: 64 }}>
            <div className="kpi-n t-red" style={{ fontSize: 14 }}>
              {money(m.ventaRiesgo)}
            </div>
            <div className="kpi-l">Venta en riesgo</div>
          </div>
        </div>

        {/* Action Queue — corazón interactivo */}
        <div className="section-title">Tu día en 30 segundos · Priorizado</div>
        {m.actionQueue.length === 0 && (
          <div className="empty-state card">
            <div className="empty-title">Sin urgencias fuertes</div>
            <p className="muted" style={{ fontSize: 13 }}>
              Revisá el mapa o cartera para armar la ruta del día.
            </p>
            <button
              type="button"
              className="btn btn-primary btn-block"
              style={{ marginTop: 12, minHeight: 48 }}
              onClick={() => nav('/mapa')}
            >
              Ir al mapa
            </button>
          </div>
        )}
        {m.actionQueue.map((item, idx) => {
          const metaT = TYPE_META[item.type] || TYPE_META.visita
          return (
            <div key={item.id || idx} className={`priority-card ${metaT.cls}`}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    letterSpacing: 0.04,
                    color: metaT.color,
                  }}
                >
                  #{idx + 1} · {metaT.badge}
                </div>
                {item.amount > 0 && (
                  <span className="muted" style={{ fontSize: 12, fontWeight: 600 }}>
                    {money(item.amount)}
                  </span>
                )}
              </div>
              <div style={{ fontWeight: 800, fontSize: 17, marginTop: 6, letterSpacing: '-0.02em' }}>
                {item.title}
              </div>
              {item.subtitle && (
                <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                  {item.subtitle}
                </div>
              )}
              {item.oferta && (
                <div
                  style={{
                    marginTop: 10,
                    padding: '8px 10px',
                    borderRadius: 12,
                    background: '#fff7ed',
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#9a3412',
                  }}
                >
                  Ofrecé: {item.oferta}
                </div>
              )}
              <div className="priority-actions" style={{ marginTop: 12 }}>
                {item.whatsapp && (
                  <a href={item.whatsapp} target="_blank" rel="noreferrer" style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>
                    WhatsApp
                  </a>
                )}
                {item.telefono && (
                  <a href={`tel:${item.telefono}`} style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>
                    Llamar
                  </a>
                )}
                <button
                  type="button"
                  className="pa-primary"
                  style={{ minHeight: 44 }}
                  onClick={() => {
                    if (item.clientId) nav(`/visita/${encodeURIComponent(item.clientId)}`)
                    else nav('/mapa')
                  }}
                >
                  {item.ctaLabel}
                </button>
              </div>
            </div>
          )
        })}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8, marginBottom: 24 }}>
          <button type="button" className="btn btn-soft" style={{ minHeight: 48 }} onClick={() => nav('/cartera')}>
            Clientes
          </button>
          <button type="button" className="btn btn-primary" style={{ minHeight: 48 }} onClick={() => nav('/mapa')}>
            Mapa / Ruta
          </button>
        </div>
      </div>
    </div>
  )
}
