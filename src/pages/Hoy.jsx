import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { money, DataAsOfBanner } from '../components.jsx'
import { useEjecutivo } from '../App.jsx'
import { computeConsistentMetrics } from '../lib/metrics'
import { listarPedidosHoy } from '../lib/pedido'
import { loadActionQueue, flushActionQueue, isProbablyOffline } from '../lib/offline'

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
  const [actividadHoy, setActividadHoy] = useState({
    visitas: 0,
    pedidos: 0,
    totalPedidos: 0,
    colaOffline: 0,
  })

  useEffect(() => {
    const on = async () => {
      setOffline(false)
      // Drenar cola offline al recuperar red
      try {
        await flushActionQueue({
          checkin: async item => {
            const { error } = await supabase.from('checkins').insert({
              visita_id: item.payload?.visita_id,
              hora_llegada: item.payload?.hora_llegada,
              lat_real: item.payload?.lat_real,
              lng_real: item.payload?.lng_real,
            })
            return !error
          },
          completar: async item => {
            if (item.payload?.checkin_id && !String(item.payload.checkin_id).startsWith('offline_')) {
              await supabase
                .from('checkins')
                .update({
                  hora_fin: item.payload.hora_fin,
                  resultado: item.payload.resultado,
                })
                .eq('id', item.payload.checkin_id)
            }
            if (item.payload?.visita_id) {
              await supabase
                .from('visitas')
                .update({ estado: 'visitada' })
                .eq('id', item.payload.visita_id)
            }
            return true
          },
          nota: async item => {
            const { error } = await supabase.from('notas_cliente').insert(item.payload || {})
            return !error
          },
          pedido: async () => true, // pedidos ya reintentan en PedidoSheet
        })
      } catch {
        /* silent */
      }
    }
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
        const start = new Date()
        start.setHours(0, 0, 0, 0)
        const [cRes, mRes, fRes, pRes, chRes] = await Promise.all([
          supabase.from('cartera').select('*').eq('ejecutivo_id', eidVista),
          supabase.from('metas').select('*').eq('ejecutivo_id', eidVista).order('mes', { ascending: false }).limit(1),
          supabase.from('focos').select('*').eq('ejecutivo_id', eidVista),
          listarPedidosHoy(eidVista),
          supabase
            .from('checkins')
            .select('id,resultado,hora_llegada')
            .gte('hora_llegada', start.toISOString())
            .limit(100),
        ])
        if (cancelled) return
        const rows = cRes.data || []
        setCartera(rows)
        setMeta(mRes.data?.[0] || null)
        setFocos(fRes.data || [])
        const snap = rows.map(r => r.fecha_snapshot).filter(Boolean).sort().pop()
        setDataAsOf(snap || mRes.data?.[0]?.fecha_snapshot || null)

        const pedidos = pRes?.data || []
        let totalPedidos = 0
        for (const p of pedidos) {
          const lineas = Array.isArray(p.lineas) ? p.lineas : []
          for (const l of lineas) {
            totalPedidos += (Number(l.precio) || 0) * (Number(l.cantidad) || 0)
          }
        }
        const checkins = chRes?.data || []
        setActividadHoy({
          visitas: checkins.length,
          pedidos: pedidos.length,
          totalPedidos: Math.round(totalPedidos),
          colaOffline: loadActionQueue().length,
        })
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

        {/* Actividad de terreno hoy — loop cerrado */}
        <div className="card" style={{ padding: '14px 16px' }}>
          <div className="card-label" style={{ marginBottom: 8 }}>
            Hoy en terreno
            {actividadHoy.colaOffline > 0 && (
              <span style={{ marginLeft: 8, color: '#92400e', fontWeight: 700 }}>
                · {actividadHoy.colaOffline} en cola offline
              </span>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 800 }}>{actividadHoy.visitas}</div>
              <div className="muted" style={{ fontSize: 11, fontWeight: 650 }}>Check-ins</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--brand)' }}>{actividadHoy.pedidos}</div>
              <div className="muted" style={{ fontSize: 11, fontWeight: 650 }}>Pedidos</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 800 }}>{money(actividadHoy.totalPedidos)}</div>
              <div className="muted" style={{ fontSize: 11, fontWeight: 650 }}>Capturado</div>
            </div>
          </div>
        </div>

        {/* Focos del mes (ex-Metas) */}
        {focos.length > 0 && (
          <>
            <div className="section-title">Focos del mes</div>
            {focos.map((f, i) => {
              const vendido = Number(f.vendido_unidad) || 0
              const metaU   = Number(f.meta_unidad) || 0
              const p       = metaU ? Math.round((vendido / metaU) * 100) : 0
              const unidad  = f.unidad_meta || 'KG'
              const falta   = Math.max(0, metaU - vendido)
              const ritmoNecesario = m.diasRestantes > 0
                ? Math.round(falta / m.diasRestantes * 10) / 10
                : null
              const atrasado = /ATRAS|SIN/i.test(f.estado_ritmo || '') || (metaU && p < 70)
              const colorFoco = p >= 100 ? '#15803d' : p >= 70 ? '#2563eb' : p >= 40 ? '#d97706' : '#dc2626'
              return (
                <div key={i} className="card" style={{ padding: '12px 14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 800, color: '#1c1917' }}>{f.foco}</div>
                      <div style={{ fontSize: 12, color: '#78716c', marginTop: 2 }}>
                        <b style={{ color: '#1c1917' }}>{vendido.toLocaleString('es-CL')}</b>
                        {' / '}{metaU.toLocaleString('es-CL')} {unidad}
                        {falta > 0 && <span style={{ color: colorFoco }}> · faltan {falta.toLocaleString('es-CL')} {unidad}</span>}
                      </div>
                      {ritmoNecesario !== null && falta > 0 && (
                        <div style={{ fontSize: 11, color: atrasado ? '#dc2626' : '#78716c', fontWeight: 600, marginTop: 3 }}>
                          {atrasado ? '⚡' : '→'} Necesitás {ritmoNecesario.toLocaleString('es-CL')} {unidad}/día ({m.diasRestantes}d hábiles)
                        </div>
                      )}
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
                      <div style={{ fontWeight: 900, fontSize: 20, color: colorFoco, lineHeight: 1 }}>{p}%</div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: colorFoco, marginTop: 2 }}>
                        {p >= 100 ? 'LOGRADO' : atrasado ? 'ATRASADO' : 'EN RITMO'}
                      </div>
                    </div>
                  </div>
                  <div className="progress-bg" style={{ marginTop: 8 }}>
                    <div
                      className="progress-fill"
                      style={{ width: Math.min(p, 100) + '%', background: colorFoco }}
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
        {m.actionQueue.length > 0 && (
          <p className="muted" style={{ fontSize: 12, margin: '-4px 0 12px', lineHeight: 1.4 }}>
            Empezá por la primera card. Objetivo: primera acción en &lt; 8 s.
          </p>
        )}
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
          const isFirst = idx === 0
          return (
            <div key={item.id || idx} style={{
              background: '#fff',
              borderRadius: 16,
              border: isFirst ? `2px solid ${metaT.color}` : `1.5px solid ${metaT.color}22`,
              borderLeft: `4px solid ${metaT.color}`,
              marginBottom: 10,
              overflow: 'hidden',
              boxShadow: isFirst ? '0 8px 24px rgba(26,22,20,0.10)' : 'none',
              transform: isFirst ? 'scale(1.01)' : 'none',
            }}>
              {/* Header con badge y monto */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px 8px' }}>
                <span style={{
                  fontSize: 10, fontWeight: 800, letterSpacing: '0.06em',
                  color: metaT.color, textTransform: 'uppercase',
                  background: metaT.color + '15', padding: '3px 8px', borderRadius: 6,
                }}>
                  {metaT.badge}
                </span>
                {item.amount > 0 && (
                  <span style={{ fontSize: 14, fontWeight: 800, color: '#1c1917' }}>
                    {money(item.amount)}
                  </span>
                )}
              </div>

              {/* Nombre + subtítulo */}
              <div style={{ padding: '0 14px 10px' }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#1c1917', lineHeight: 1.2, letterSpacing: '-0.01em' }}>
                  {item.title}
                </div>
                {item.subtitle && (
                  <div style={{ fontSize: 12, color: '#78716c', marginTop: 4, lineHeight: 1.4 }}>
                    {item.subtitle}
                  </div>
                )}
                {item.oferta && (
                  <div style={{
                    marginTop: 8, padding: '7px 10px', borderRadius: 10,
                    background: '#fff7ed', fontSize: 12, fontWeight: 600, color: '#9a3412',
                    lineHeight: 1.4,
                  }}>
                    💡 {item.oferta}
                  </div>
                )}
              </div>

              {/* Acciones */}
              <div style={{
                display: 'flex', gap: 0,
                borderTop: '1px solid #f5f5f4',
              }}>
                {item.telefono && (
                  <a href={`tel:${item.telefono}`}
                    style={{
                      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      padding: '11px 8px', textDecoration: 'none',
                      fontSize: 13, fontWeight: 700, color: '#57534e',
                      borderRight: '1px solid #f5f5f4', gap: 5,
                    }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
                    </svg>
                    Llamar
                  </a>
                )}
                {item.whatsapp && (
                  <a href={item.whatsapp} target="_blank" rel="noreferrer"
                    style={{
                      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      padding: '11px 8px', textDecoration: 'none',
                      fontSize: 13, fontWeight: 700, color: '#15803d',
                      borderRight: '1px solid #f5f5f4', gap: 5,
                    }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="#15803d">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                      <path d="M12 0C5.373 0 0 5.373 0 12c0 2.122.552 4.106 1.515 5.828L0 24l6.338-1.476A11.954 11.954 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm.029 21.818a9.833 9.833 0 0 1-5.019-1.374l-.36-.214-3.732.979 1.003-3.647-.234-.374A9.862 9.862 0 0 1 2.182 12c0-5.42 4.41-9.818 9.847-9.818 5.437 0 9.847 4.398 9.847 9.818 0 5.42-4.41 9.818-9.847 9.818z"/>
                    </svg>
                    WA
                  </a>
                )}
                <button type="button"
                  onClick={() => {
                    if (item.clientId) nav(`/visita/${encodeURIComponent(item.clientId)}`)
                    else nav('/mapa')
                  }}
                  style={{
                    flex: 2, padding: '11px 8px', border: 'none',
                    background: metaT.color, color: '#fff',
                    fontSize: 13, fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}>
                  {item.ctaLabel} →
                </button>
              </div>
            </div>
          )
        })}

        <div style={{ height: 8 }} />
      </div>
    </div>
  )
}
