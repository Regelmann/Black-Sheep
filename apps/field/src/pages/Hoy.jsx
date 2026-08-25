import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { money, DataAsOfBanner } from '../components.jsx'
import { useEjecutivo } from '../App.jsx'
import { computeConsistentMetrics } from '../lib/metrics'
import { buildRecomendacionesHoy, resumenDia } from '../lib/recomendaciones'
import { listarPedidosHoy } from '../lib/pedido'
import HistorialPedidos from '../components/HistorialPedidos.jsx'
import OrderInbox from '../components/OrderInbox.jsx'
import PedidoSheet from '../components/PedidoSheet.jsx'
import {
  loadActionQueue,
  flushActionQueue,
  clearActionQueue,
  isProbablyOffline,
  loadHoyResultados,
} from '../lib/offline'
import { skusAReponer } from '../lib/coach'
import { buildDecisionFeed, groupByAttention, daySummary } from '../lib/decisionEngine'
import { DecisionCard, DecisionSection } from '../components/DecisionCard.jsx'
import { trackDecision } from '../lib/memory'
import { predict7Days } from '../lib/predictor'

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
  const [showHistorial, setShowHistorial] = useState(false)
  const [pedidoEdit, setPedidoEdit] = useState(null)
  const [prep, setPrep] = useState(null) // item de Action Queue para sheet 10s
  const [hoyRes, setHoyRes] = useState(() => loadHoyResultados())
  const [command, setCommand] = useState('')

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

  const recsHoy = useMemo(() => buildRecomendacionesHoy(cartera, { focos }), [cartera, focos])
  const coaching = useMemo(() => resumenDia(recsHoy, meta), [recsHoy, meta])
  const decisionFeed = useMemo(() => buildDecisionFeed({ cartera, focos, meta, actividad: actividadHoy }), [cartera, focos, meta, actividadHoy])
  const commandResults = useMemo(() => {
    const q = command.trim().toLowerCase()
    const base = q
      ? decisionFeed.filter(d => `${d.title} ${d.reason} ${(d.why || []).join(' ')}`.toLowerCase().includes(q))
      : decisionFeed
    return base.slice(0, 8)
  }, [command, decisionFeed])
  const byAtt = useMemo(() => groupByAttention(commandResults), [commandResults])
  const pred7 = useMemo(() => predict7Days(cartera, meta, focos), [cartera, meta, focos])
  const diaResumen = useMemo(() => daySummary(commandResults, pred7), [commandResults, pred7])

  function handleDecisionAction(item) {
    trackDecision({
      decisionId: item.id,
      decisionType: item.type,
      attention: item.attention,
      clienteKey: item.clientId,
      ejecutivoId: eidVista,
      accion: 'tap',
    })
    if (item.route) nav(item.route)
    else if (item.clientId)
      openPrep({
        clientId: item.clientId,
        title: item.title,
        raw: item.raw,
        insight: item.reason,
        why: item.why,
        confidence: item.confidence,
      })
  }

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
      <div className="wrap hoy-wrap" style={{ paddingTop: 16 }}>
        <div className="skeleton" style={{ height: 88, borderRadius: 18, marginBottom: 12 }} />
        <div className="skeleton" style={{ height: 120, borderRadius: 18, marginBottom: 12 }} />
        <div className="skeleton" style={{ height: 64, borderRadius: 16, marginBottom: 12 }} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
          <div className="skeleton" style={{ height: 72, borderRadius: 14 }} />
          <div className="skeleton" style={{ height: 72, borderRadius: 14 }} />
          <div className="skeleton" style={{ height: 72, borderRadius: 14 }} />
        </div>
        <div className="skeleton" style={{ height: 96, borderRadius: 16, marginBottom: 10 }} />
        <div className="skeleton" style={{ height: 96, borderRadius: 16, marginBottom: 10 }} />
        <p className="muted" style={{ textAlign: 'center', marginTop: 18, fontWeight: 700 }}>Armando tu día…</p>
      </div>
    )
  }

  const colaN = actividadHoy.colaOffline || 0
  const showOfflineBanner = offline || colaN > 0

  return (
    <div className="bs-page">
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
            <span style={{ display: 'flex', gap: 6 }}>
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
              <button
                type="button"
                onClick={() => {
                  if (confirm('¿Descartar acciones pendientes de la cola offline?')) {
                    clearActionQueue()
                    setActividadHoy(a => ({ ...a, colaOffline: 0 }))
                  }
                }}
                style={{
                  border: '1px solid rgba(255,255,255,0.35)',
                  background: 'transparent',
                  color: '#fff',
                  borderRadius: 8,
                  padding: '4px 10px',
                  fontSize: 11,
                  fontWeight: 700,
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                }}
              >
                Descartar
              </button>
            </span>
          )}
        </div>
      )}

      <div className="page-hero hoy-hero">
        <div className="eyebrow">Black Sheep · One Brain</div>
        <h1>
          {saludo()}, {nombreCorto}
        </h1>
        <p className="sub">
          {zonaVista || '—'} ·{' '}
          {new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'short' })}
        </p>
      </div>

      <div className="wrap hoy-wrap">
        
        {/* ONE BRAIN — una decisión manda */}
        <section className="bs-hoy-action bs-one-brain">
          <div className="bs-hoy-kicker">Tu día</div>
          <h2 className="bs-hoy-title">Siguiente mejor acción</h2>

          {commandResults.length === 0 ? (
            <div className="bs-hoy-empty">
              Sin acciones que justifiquen interrumpirte.
              <button type="button" className="bs-hoy-route" style={{ marginTop: 12 }} onClick={() => nav('/mapa')}>
                Armar ruta
              </button>
            </div>
          ) : (
            <>
              <DecisionCard
                item={commandResults[0]}
                featured
                onAction={handleDecisionAction}
              />

              {commandResults.length > 1 && (
                <details className="bs-hoy-despues">
                  <summary>
                    Después · {commandResults.length - 1} más
                    {commandResults.slice(1).reduce((s, d) => s + (Number(d.expectedValue) || 0), 0) > 0 && (
                      <> · ${Math.round(commandResults.slice(1).reduce((s, d) => s + (Number(d.expectedValue) || 0), 0)).toLocaleString('es-CL')} potencial</>
                    )}
                  </summary>
                  <div className="bs-dc-stack" style={{ marginTop: 10 }}>
                    {commandResults.slice(1).map(d => (
                      <DecisionCard key={d.id} item={d} onAction={handleDecisionAction} />
                    ))}
                  </div>
                </details>
              )}
            </>
          )}

          {diaResumen && (
            <div className="bs-hoy-day-summary">{diaResumen}</div>
          )}

          {/* Predicción secundaria — no compite con la acción */}
          {pred7 && (pred7.ventaEsperada > 0 || pred7.ventaEnRiesgo > 0) && (
            <details className="bs-pred7-secondary">
              <summary>Horizonte 7 días</summary>
              <div className="bs-pred7-grid" style={{ marginTop: 10 }}>
                {pred7.ventaEsperada > 0 && (
                  <div className="bs-pred7-cell ok">
                    <strong>{money(pred7.ventaEsperada)}</strong>
                    <span>Esperada</span>
                  </div>
                )}
                {pred7.ventaEnRiesgo > 0 && (
                  <div className="bs-pred7-cell risk">
                    <strong>{money(pred7.ventaEnRiesgo)}</strong>
                    <span>Riesgo</span>
                  </div>
                )}
                {pred7.oportunidad > 0 && (
                  <div className="bs-pred7-cell opp">
                    <strong>{money(pred7.oportunidad)}</strong>
                    <span>Oport.</span>
                  </div>
                )}
              </div>
              {pred7.resumen && <p className="bs-pred7-hint">{pred7.resumen}</p>}
            </details>
          )}


          {/* Focos del mes — avance SKU */}
          {Array.isArray(focos) && focos.length > 0 && (
            <div className="bs-hoy-focos" style={{ marginTop: 12 }}>
              <div className="bs-hoy-focos-title">Focos del mes</div>
              {focos.slice(0, 6).map((f, i) => {
                const metaU = Number(f.meta_unidad) || 0
                const vend = Number(f.vendido_unidad) || 0
                const pct = f.pct_avance != null
                  ? Number(f.pct_avance)
                  : (metaU > 0 ? Math.round((vend / metaU) * 100) : 0)
                const bar = Math.max(0, Math.min(100, pct))
                return (
                  <div key={f.id || i} className="bs-hoy-foco-row">
                    <div className="bs-hoy-foco-head">
                      <strong>{f.foco || 'Foco'}</strong>
                      <span>{bar}%</span>
                    </div>
                    <div className="bs-hoy-foco-bar"><i style={{ width: bar + '%' }} /></div>
                    <div className="bs-hoy-foco-meta">
                      {vend.toLocaleString('es-CL')} / {metaU.toLocaleString('es-CL')} {f.unidad_meta || 'ud'}
                      {f.estado_ritmo ? ` · ${String(f.estado_ritmo)}` : ''}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <button type="button" className="bs-hoy-route" onClick={() => nav('/mapa')}>
            Armar ruta del día
          </button>
        </section>




        {dataAsOf && <DataAsOfBanner fecha={dataAsOf} extra={`${m.totalClientes} clientes`} />}

        {/* Compact metrics — no Excel wall */}
        <div className="bs-hoy-strip">
          <div className="bs-hoy-strip-main">
            <span className="bs-hoy-strip-label">Venta mes</span>
            <strong>{money(m.ventaMtd)}</strong>
            <span className={'bs-hoy-strip-pct ' + (m.pct >= 70 ? 'ok' : m.pct >= 40 ? 'mid' : 'low')}>{m.pct}%</span>
          </div>
          <div className="bs-hoy-strip-meta">
            Meta {money(m.metaMensual)} · Faltan {money(m.brecha)}
            {m.ritmoDia > 0 ? ` · ${money(m.ritmoDia)}/día` : ''}
          </div>
          <div className="bs-hoy-strip-bar">
            <i style={{ width: Math.min(m.pct, 100) + '%' }} />
          </div>
        </div>

        <div className="bs-hoy-kpis">
          <button type="button" className="bs-hoy-kpi" onClick={() => nav('/cartera?filtro=ReponerHoy')}>
            <strong>{m.reponerHoy ?? '—'}</strong>
            <span>Reponer</span>
          </button>
          <button type="button" className="bs-hoy-kpi" onClick={() => nav('/cartera?filtro=RIESGO')}>
            <strong>{m.nRiesgo ?? '—'}</strong>
            <span>Riesgo</span>
          </button>
          <button type="button" className="bs-hoy-kpi" onClick={() => nav('/cartera?filtro=Nuevos')}>
            <strong>{m.nNuevos ?? '—'}</strong>
            <span>Nuevos</span>
          </button>
          <button type="button" className="bs-hoy-kpi ghost" onClick={() => setShowHistorial(v => !v)}>
            <strong>{actividadHoy.visitas || 0}</strong>
            <span>Visitas</span>
          </button>
        </div>

        {showHistorial && (
          <div className="card bs-hoy-hist">
            <div className="card-label">Actividad de hoy</div>
            <p className="muted" style={{ fontSize: 13, margin: '8px 0 0' }}>
              Visitas {actividadHoy.visitas || 0}
              {actividadHoy.colaOffline > 0 ? ` · ${actividadHoy.colaOffline} en cola offline` : ''}
              {actividadHoy.pedidos ? ` · ${actividadHoy.pedidos} pedidos` : ''}
            </p>
          </div>
        )}

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
