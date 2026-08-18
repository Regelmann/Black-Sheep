import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { money, DataAsOfBanner } from '../components.jsx'
import { useEjecutivo } from '../App.jsx'
import { computeConsistentMetrics } from '../lib/metrics'
import { listarPedidosHoy } from '../lib/pedido'
import {
  loadActionQueue,
  flushActionQueue,
  isProbablyOffline,
  loadHoyResultados,
} from '../lib/offline'
import { skusAReponer } from '../lib/coach'

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
  const [prep, setPrep] = useState(null) // item de Action Queue para sheet 10s
  const [hoyRes, setHoyRes] = useState(() => loadHoyResultados())

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

  // Refrescar resultados locales al volver a Hoy
  useEffect(() => {
    setHoyRes(loadHoyResultados())
    setActividadHoy(a => ({ ...a, colaOffline: loadActionQueue().length }))
  }, [eidVista, loading])

  function openPrep(item) {
    const raw = item.raw || cartera.find(c => (c.cliente_key || c.id) === item.clientId) || null
    const skus = item.skusRanked || (raw ? skusAReponer(raw) : [])
    setPrep({
      ...item,
      raw,
      skusTop: skus.slice(0, 5).map(s => ({
        nombre: s.nombre,
        label: s.label || s.recompra?.label,
        cicloEst: s.cicloEst,
        diasUltima: s.diasUltima,
        qty: Math.max(1, Math.round(Math.max(0, (Number(s.promUd) || 0) - (Number(s.udMtd) || 0)) || Number(s.promUd) || 1)),
      })),
      insight: item.insight,
      dias: raw ? Number(raw.dias_sin_comprar) : null,
      ultima: raw?.ultima_compra || null,
      estado: raw?.estado_fuga || null,
      comuna: raw?.comuna || null,
      direccion: raw?.direccion || null,
    })
  }

  function goVisita(item) {
    setPrep(null)
    if (item?.clientId) {
      nav(`/visita/${encodeURIComponent(String(item.clientId))}`, {
        state: {
          cliente_key: item.clientId,
          nombre_cliente: item.title,
          comuna: item.raw?.comuna || item.comuna,
          telefono: item.telefono || item.raw?.telefono,
          link_whatsapp: item.whatsapp || item.raw?.link_whatsapp,
          oferta_real: item.oferta || item.raw?.oferta_real,
          sku_detalle: item.raw?.sku_detalle,
          direccion: item.raw?.direccion,
          lat: item.raw?.lat,
          lng: item.raw?.lng,
          venta_mtd: item.raw?.venta_mtd,
          venta_mensual: item.raw?.venta_mensual,
          estado_fuga: item.raw?.estado_fuga,
          fromHoy: true,
        },
      })
    } else nav('/mapa')
  }

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

  const colaN = actividadHoy.colaOffline || 0
  const showOfflineBanner = offline || colaN > 0

  return (
    <div>
      {showOfflineBanner && (
        <div
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 40,
            background: offline ? '#92400e' : '#b45309',
            color: '#fff',
            padding: '8px 14px',
            fontSize: 12,
            fontWeight: 700,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span>
            {offline
              ? `Modo offline · las acciones se guardan en cola`
              : `${colaN} acción(es) pendientes de sincronizar`}
          </span>
          {!offline && colaN > 0 && (
            <button
              type="button"
              onClick={async () => {
                await flushActionQueue({})
                setActividadHoy(a => ({ ...a, colaOffline: loadActionQueue().length }))
              }}
              style={{
                border: '1px solid rgba(255,255,255,0.4)',
                background: 'rgba(255,255,255,0.15)',
                color: '#fff',
                borderRadius: 8,
                padding: '4px 10px',
                fontSize: 11,
                fontWeight: 800,
                fontFamily: 'inherit',
                cursor: 'pointer',
              }}
            >
              Reintentar
            </button>
          )}
        </div>
      )}

      <div className="page-hero hoy-hero">
        <div className="eyebrow">KeyFoods · Mi día</div>
        <h1>
          {saludo()}, {nombreCorto}
        </h1>
        <p className="sub">
          {zonaVista || '—'} ·{' '}
          {new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'short' })}
        </p>
      </div>

      <div className="wrap hoy-wrap">
        {dataAsOf && <DataAsOfBanner fecha={dataAsOf} extra={`${m.totalClientes} clientes`} />}

        {/* Hero venta + meta integrada (antes tab Metas) */}
        <div className="hero-metric hoy-sales-hero">
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
          <button
            type="button"
            className="card"
            onClick={() => nav('/cartera?filtro=CerrarMeta')}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              width: '100%',
              textAlign: 'left',
              cursor: 'pointer',
              fontFamily: 'inherit',
              border: '1px solid #e7e5e4',
            }}
          >
            <div>
              <div className="card-label" style={{ marginBottom: 4 }}>
                Proyección del mes · tocá para actuar
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
                {m.proyeccionDiff >= 0 ? 'sobre meta' : 'cerrar brecha →'}
              </div>
            </div>
          </button>
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
            <div className="section-title hoy-section-title">Focos del mes</div>
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
                <button
                  key={i}
                  type="button"
                  className="card"
                  onClick={() => nav(`/cartera?filtro=Foco&q=${encodeURIComponent(f.foco || '')}`)}
                  style={{
                    padding: '10px 12px',
                    width: '100%',
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    border: '1px solid #e7e5e4',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: '#1c1917' }}>
                        {f.foco}
                        <span style={{ fontSize: 11, fontWeight: 600, color: '#a8a29e', marginLeft: 6 }}>
                          → a quién vender
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: '#78716c', marginTop: 2 }}>
                        <b style={{ color: '#1c1917' }}>{vendido.toLocaleString('es-CL')}</b>
                        {' / '}{metaU.toLocaleString('es-CL')} {unidad}
                        {falta > 0 && <span style={{ color: colorFoco }}> · faltan {falta.toLocaleString('es-CL')} {unidad}</span>}
                      </div>
                      {ritmoNecesario !== null && falta > 0 && (
                        <div style={{ fontSize: 11, color: atrasado ? '#dc2626' : '#78716c', fontWeight: 600, marginTop: 2 }}>
                          {atrasado ? '⚡' : '→'} {ritmoNecesario.toLocaleString('es-CL')} {unidad}/día ({m.diasRestantes}d háb.)
                        </div>
                      )}
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 10 }}>
                      <div style={{ fontWeight: 900, fontSize: 18, color: colorFoco, lineHeight: 1 }}>{p}%</div>
                      <div style={{ fontSize: 9, fontWeight: 700, color: colorFoco, marginTop: 2 }}>
                        {p >= 100 ? 'OK' : atrasado ? 'ATRÁS' : 'RITMO'}
                      </div>
                    </div>
                  </div>
                  <div className="progress-bg" style={{ marginTop: 6 }}>
                    <div
                      className="progress-fill"
                      style={{ width: Math.min(p, 100) + '%', background: colorFoco }}
                    />
                  </div>
                </button>
              )
            })}
          </>
        )}

        {/* Day Summary — 6 métricas en 3x2 */}
        <div className="section-title hoy-section-title">Resumen de cartera</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
          {[
            { n: m.reponerHoy,  l: 'Reponer',    color: '#c2410c', route: '/cartera?filtro=ReponerHoy', bg: '#fff4eb' },
            { n: m.nRiesgo,     l: 'Riesgo',     color: '#dc2626', route: '/cartera?filtro=Riesgo',    bg: '#fef2f2' },
            { n: m.nEnfri,      l: 'Enfriando',  color: '#d97706', route: '/cartera?filtro=Enfri',     bg: '#fffbeb' },
            { n: m.nActivos,    l: 'Activos',    color: '#15803d', route: '/cartera?filtro=ActivosMes', bg: '#f0fdf4' },
            { n: m.nNuevos,     l: 'Nuevos',     color: '#2563eb', route: '/cartera?filtro=Nuevos',    bg: '#eff6ff' },
            { n: m.totalClientes, l: 'Total',    color: '#57534e', route: '/cartera',                   bg: '#fafaf9' },
          ].map(({ n, l, color, route, bg }) => (
            <button key={l} type="button"
              onClick={() => nav(route)}
              style={{
                background: bg, border: `1.5px solid ${color}22`, borderRadius: 14,
                padding: '12px 8px', textAlign: 'center', cursor: 'pointer',
                fontFamily: 'inherit', WebkitTapHighlightColor: 'transparent',
              }}>
              <div style={{ fontSize: 22, fontWeight: 900, color, lineHeight: 1, letterSpacing: '-0.03em' }}>{n}</div>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#a8a29e', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 4 }}>{l}</div>
            </button>
          ))}
        </div>

        {/* Action Queue */}
        <div className="section-title hoy-section-title" style={{ marginBottom: 8 }}>Tu foco de hoy</div>
        <button
          type="button"
          onClick={() => nav('/mapa')}
          style={{
            width: '100%', marginBottom: 10,
            padding: '10px 12px', borderRadius: 12,
            background: 'linear-gradient(135deg, #1c1917 0%, #c2410c 100%)',
            border: 'none', color: '#fff',
            fontWeight: 800, fontSize: 13, fontFamily: 'inherit',
            cursor: 'pointer', textAlign: 'left',
            display: 'flex', alignItems: 'center', gap: 10,
          }}
        >
          <span style={{ fontSize: 18 }}>🎯</span>
          <div style={{ flex: 1 }}>
            <div>Armar ruta del día</div>
            <div style={{ fontWeight: 500, fontSize: 11, opacity: 0.7 }}>GPS · prioridades · km</div>
          </div>
          <span style={{ opacity: 0.8 }}>→</span>
        </button>
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
          const res = hoyRes[item.clientId] || hoyRes[item.id]
          const done = res?.resultado
          const doneLabel =
            done === 'pedido' ? 'Pedido' :
            done === 'no_venta' ? 'No compró' :
            done === 'checkin' || done === 'visitado' ? 'OK' : null
          const doneColor =
            done === 'pedido' ? '#0d9488' :
            done === 'no_venta' ? '#78716c' :
            done ? '#2563eb' : null
          return (
            <div
              key={item.id || idx}
              style={{
                background: done ? '#fafaf9' : '#fff',
                borderRadius: 10,
                border: `1px solid ${metaT.color}22`,
                marginBottom: 6,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 8px 8px 10px',
                opacity: done === 'pedido' || done === 'no_venta' ? 0.78 : 1,
              }}
            >
              <div
                style={{
                  width: 3,
                  alignSelf: 'stretch',
                  borderRadius: 2,
                  background: doneColor || metaT.color,
                  flexShrink: 0,
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{
                    fontSize: 9, fontWeight: 800, letterSpacing: '0.03em',
                    color: metaT.color, textTransform: 'uppercase',
                    background: metaT.color + '12', padding: '1px 5px', borderRadius: 4,
                  }}>
                    {metaT.badge}
                  </span>
                  {doneLabel && (
                    <span style={{ fontSize: 9, fontWeight: 700, color: doneColor }}>✓ {doneLabel}</span>
                  )}
                  {item.amount > 0 && (
                    <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 800, color: '#1c1917', flexShrink: 0 }}>
                      {money(item.amount)}
                    </span>
                  )}
                </div>
                <div style={{
                  fontSize: 13, fontWeight: 800, color: '#1c1917', lineHeight: 1.25,
                  marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {item.title}
                </div>
                {item.subtitle && (
                  <div style={{
                    fontSize: 10, color: '#a8a29e', marginTop: 1,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {item.subtitle}
                  </div>
                )}
                {item.insight && (
                  <div style={{
                    fontSize: 11, color: '#9a3412', marginTop: 2, fontWeight: 650,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    → {item.insight}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                {item.telefono && (
                  <a href={`tel:${item.telefono}`}
                    style={{
                      width: 34, height: 34, borderRadius: 8,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: '#f5f5f4', color: '#57534e', textDecoration: 'none',
                    }}
                    onClick={e => e.stopPropagation()}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
                    </svg>
                  </a>
                )}
                {item.whatsapp && (
                  <a href={item.whatsapp} target="_blank" rel="noreferrer"
                    style={{
                      width: 34, height: 34, borderRadius: 8,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: '#ecfdf5', textDecoration: 'none',
                    }}
                    onClick={e => e.stopPropagation()}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="#15803d">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                      <path d="M12 0C5.373 0 0 5.373 0 12c0 2.122.552 4.106 1.515 5.828L0 24l6.338-1.476A11.954 11.954 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm.029 21.818a9.833 9.833 0 0 1-5.019-1.374l-.36-.214-3.732.979 1.003-3.647-.234-.374A9.862 9.862 0 0 1 2.182 12c0-5.42 4.41-9.818 9.847-9.818 5.437 0 9.847 4.398 9.847 9.818 0 5.42-4.41 9.818-9.847 9.818z"/>
                    </svg>
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => openPrep(item)}
                  style={{
                    border: 'none',
                    background: done ? '#57534e' : metaT.color,
                    color: '#fff',
                    fontSize: 11,
                    fontWeight: 800,
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                    padding: '8px 10px',
                    borderRadius: 8,
                    whiteSpace: 'nowrap',
                    minHeight: 34,
                  }}
                >
                  {done ? 'Ver' : (item.ctaLabel || 'Ir')}
                </button>
              </div>
            </div>
          )
        })}

        {/* Espacio para navbar fijo + safe area (evita que la última card se corte) */}
        <div style={{ height: 'calc(72px + env(safe-area-inset-bottom, 0px))' }} />
      </div>

      {/* Prep de visita 10 s — bottom sheet */}
      {prep && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setPrep(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 400,
            background: 'rgba(28,25,23,0.45)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 480,
              background: '#fff',
              borderRadius: '20px 20px 0 0',
              padding: '16px 18px calc(24px + 72px + env(safe-area-inset-bottom, 0px))',
              boxShadow: '0 -12px 40px rgba(0,0,0,0.18)',
              maxHeight: '85vh',
              overflowY: 'auto',
            }}
          >
            <div style={{ width: 40, height: 4, borderRadius: 999, background: '#e7e5e4', margin: '0 auto 14px' }} />
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', color: '#c2410c', textTransform: 'uppercase' }}>
              Prep de visita · 10 segundos
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#1c1917', marginTop: 4, letterSpacing: '-0.02em' }}>
              {prep.title}
            </div>
            <div style={{ fontSize: 13, color: '#78716c', marginTop: 4 }}>
              {[prep.comuna, prep.dias != null && !isNaN(prep.dias) ? `hace ${prep.dias}d` : null, limpiaEstado(prep.estado)]
                .filter(Boolean)
                .join(' · ')}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 14 }}>
              <div style={{ background: '#fafaf9', borderRadius: 12, padding: '10px 12px', border: '1px solid #f5f5f4' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#a8a29e', textTransform: 'uppercase' }}>Última compra</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#1c1917', marginTop: 2 }}>
                  {prep.ultima || '—'}
                </div>
              </div>
              <div style={{ background: '#fafaf9', borderRadius: 12, padding: '10px 12px', border: '1px solid #f5f5f4' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#a8a29e', textTransform: 'uppercase' }}>Prom / MTD</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#c2410c', marginTop: 2 }}>
                  {money(prep.amount || 0)}
                </div>
              </div>
            </div>

            {prep.insight && (
              <div style={{
                marginTop: 12, padding: '10px 12px', borderRadius: 12,
                background: '#fef2f2', border: '1px solid #fecaca',
                fontSize: 13, fontWeight: 700, color: '#991b1b', lineHeight: 1.4,
              }}>
                Debe llevar hoy: {prep.insight}
              </div>
            )}
            {prep.oferta && (
              <div style={{
                marginTop: 8, padding: '10px 12px', borderRadius: 12,
                background: '#fff7ed', border: '1px solid #fed7aa',
                fontSize: 13, fontWeight: 600, color: '#9a3412', lineHeight: 1.4,
              }}>
                💡 Ofrecé: {prep.oferta}
              </div>
            )}

            {prep.skusTop?.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#78716c', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                  A reponer ahora
                </div>
                {prep.skusTop.map((s, i) => (
                  <div key={i} style={{
                    display: 'flex', gap: 8, alignItems: 'center',
                    padding: '8px 0', borderBottom: '1px solid #f5f5f4',
                  }}>
                    <span style={{
                      width: 22, height: 22, borderRadius: 7, background: '#fef2f2', color: '#b91c1c',
                      fontSize: 11, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    }}>{i + 1}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 650, color: '#1c1917' }}>{s.nombre}</div>
                      <div style={{ fontSize: 11, color: '#78716c', marginTop: 1 }}>
                        {[s.label, s.cicloEst != null ? `ciclo ${s.cicloEst}d` : null, s.qty ? `sugerido ${s.qty}` : null]
                          .filter(Boolean).join(' · ')}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
              <button
                type="button"
                onClick={() => setPrep(null)}
                style={{
                  flex: 1, minHeight: 48, borderRadius: 12, border: '1.5px solid #e7e5e4',
                  background: '#fff', fontWeight: 700, fontSize: 14, fontFamily: 'inherit', cursor: 'pointer',
                }}
              >
                Cerrar
              </button>
              <button
                type="button"
                onClick={() => goVisita(prep)}
                style={{
                  flex: 2, minHeight: 48, borderRadius: 12, border: 'none',
                  background: '#c2410c', color: '#fff', fontWeight: 800, fontSize: 15,
                  fontFamily: 'inherit', cursor: 'pointer',
                }}
              >
                Ir a la visita →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
