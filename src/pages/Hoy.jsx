import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { money, DataAsOfBanner } from '../components.jsx'
import { useEjecutivo } from '../App.jsx'
import { parseSkuDetalle } from '../lib/coach'

function limpiaEstado(e) {
  return (e || '').replace(/^\d+_?/, '').replace(/_/g, ' ')
}

function scorePrioridad(c) {
  const dias = Number(c.dias_sin_comprar) || 0
  const mtd = Number(c.venta_mtd) || 0
  const hist = Number(c.venta_mensual) || Number(c.venta_historica) || 0
  const ef = String(c.estado_fuga || '')
  let s = 0
  if (/RIESGO/i.test(ef)) s += 80
  else if (/ENFRI/i.test(ef)) s += 55
  else if (/FUGADO|DORMIDO/i.test(ef)) s += 40
  if (dias >= 45) s += 30
  else if (dias >= 28) s += 20
  else if (dias >= 21) s += 12
  // potencial = hist sin mtd (venta en riesgo)
  if (hist > mtd) s += Math.min(25, Math.round((hist - mtd) / 50000))
  return s
}

function ofertaCorta(oferta) {
  if (!oferta) return null
  const t = String(oferta).replace(/_/g, ' ')
  // tomar primer producto legible
  const m = t.match(/(?:Foco|Ofrece|Ofrecé)[:\s]+([^·|]+)/i)
  if (m) return m[1].trim().slice(0, 48)
  return t.split(/[·|]/)[0].trim().slice(0, 48)
}

export default function Hoy() {
  const nav = useNavigate()
  const { zonaVista, eidVista, nombre } = useEjecutivo() || {}
  const [cartera, setCartera] = useState([])
  const [meta, setMeta] = useState(null)
  const [focos, setFocos] = useState([])
  const [loading, setLoading] = useState(true)
  const [dataAsOf, setDataAsOf] = useState(null)

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
    return () => { cancelled = true }
  }, [eidVista])

  const ventaMtd = useMemo(
    () => cartera.reduce((s, c) => s + (Number(c.venta_mtd) || 0), 0),
    [cartera]
  )
  const metaMensual = Number(meta?.meta_mensual) || 0
  const pct = metaMensual ? Math.round((ventaMtd / metaMensual) * 100) : 0
  const brecha = Math.max(0, metaMensual - ventaMtd)

  // proyección simple: ritmo actual * días mes (aprox 22 hábiles)
  const dia = new Date().getDate()
  const diasHabilesEst = Math.max(1, Math.min(22, Math.round((dia / 30) * 22)))
  const ritmoDia = diasHabilesEst > 0 ? ventaMtd / diasHabilesEst : 0
  const proyeccion = ritmoDia * 22
  const proyeccionDiff = metaMensual ? proyeccion - metaMensual : 0

  const nRiesgo = cartera.filter(c => /RIESGO/i.test(c.estado_fuga || '')).length
  const nEnfri = cartera.filter(c => /ENFRI/i.test(c.estado_fuga || '')).length
  const nReponer = cartera.filter(c => {
    const skus = parseSkuDetalle(c.sku_detalle)
    return skus.some(s => {
      const ciclo = Number(s.ciclo) || 0
      const dias = Number(c.dias_sin_comprar)
      if (!ciclo || dias == null) return false
      return dias >= ciclo * 0.9
    })
  }).length
  const ventaRiesgo = cartera
    .filter(c => /RIESGO|ENFRI|FUGADO|DORMIDO/i.test(c.estado_fuga || ''))
    .reduce((s, c) => s + (Number(c.venta_mensual) || Number(c.venta_historica) / 12 || 0), 0)

  const prioridades = useMemo(() => {
    return [...cartera]
      .map(c => ({ ...c, _score: scorePrioridad(c) }))
      .filter(c => c._score >= 40)
      .sort((a, b) => b._score - a._score)
      .slice(0, 5)
  }, [cartera])

  const saludo = () => {
    const h = new Date().getHours()
    if (h < 12) return 'Buenos días'
    if (h < 19) return 'Buenas tardes'
    return 'Buenas noches'
  }
  const nombreCorto = (nombre || '').split(' ')[0] || 'equipo'

  if (loading) return <div className="spinner">Armando tu día…</div>

  return (
    <div>
      <div className="page-hero">
        <div className="eyebrow">KeyFoods · Mi día</div>
        <h1>{saludo()}, {nombreCorto}</h1>
        <p className="sub">
          {zonaVista || '—'} ·{' '}
          {new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'short' })}
        </p>
      </div>

      <div className="wrap">
        {dataAsOf && <DataAsOfBanner fecha={dataAsOf} extra={`${cartera.length} clientes`} />}

        {/* Hero venta */}
        <div className="hero-metric">
          <div className="hm-label">Venta del mes</div>
          <div className="hm-value">{money(ventaMtd)}</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
            <span style={{ fontSize: 22, fontWeight: 800, color: pct >= 70 ? '#4ade80' : pct >= 40 ? '#fbbf24' : '#fb923c' }}>
              {pct}%
            </span>
            <span className="hm-meta">
              Meta {money(metaMensual)}
            </span>
          </div>
          <div className="progress-bg" style={{ marginTop: 10, background: 'rgba(255,255,255,0.12)' }}>
            <div
              className="progress-fill"
              style={{
                width: Math.min(pct, 100) + '%',
                background: pct >= 70 ? '#4ade80' : '#fb923c',
              }}
            />
          </div>
          <div className="hm-meta" style={{ marginTop: 10 }}>
            Faltan {money(brecha)}
            {ritmoDia > 0 && <> · Ritmo {money(ritmoDia)}/día</>}
          </div>
        </div>

        {/* Proyección */}
        {metaMensual > 0 && (
          <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div className="card-label" style={{ marginBottom: 4 }}>Proyección del mes</div>
              <div style={{ fontSize: 20, fontWeight: 800 }}>{money(proyeccion)}</div>
            </div>
            <div style={{
              fontSize: 13, fontWeight: 700, textAlign: 'right',
              color: proyeccionDiff >= 0 ? 'var(--green)' : 'var(--red)',
            }}>
              {proyeccionDiff >= 0 ? '↑' : '↓'} {money(Math.abs(proyeccionDiff))}
              <div className="muted" style={{ fontWeight: 600, fontSize: 11 }}>
                {proyeccionDiff >= 0 ? 'sobre meta' : 'bajo meta'}
              </div>
            </div>
          </div>
        )}

        <div className="section-title">Tu día en 30 segundos</div>
        <div className="kpi-row">
          <button type="button" className="kpi-tile" style={{ textAlign: 'left', border: '1px solid var(--line)' }}
            onClick={() => nav('/mapa')}>
            <div className="kpi-n t-brand">{nReponer}</div>
            <div className="kpi-l">Reponer hoy</div>
          </button>
          <button type="button" className="kpi-tile" style={{ textAlign: 'left', border: '1px solid var(--line)' }}
            onClick={() => nav('/cartera')}>
            <div className="kpi-n t-amber">{nRiesgo}</div>
            <div className="kpi-l">Riesgo recuperar</div>
          </button>
          <button type="button" className="kpi-tile" style={{ textAlign: 'left', border: '1px solid var(--line)' }}
            onClick={() => nav('/cartera')}>
            <div className="kpi-n t-blue">{nEnfri}</div>
            <div className="kpi-l">Enfriándose</div>
          </button>
          <div className="kpi-tile">
            <div className="kpi-n t-red">{money(ventaRiesgo).replace('$', '$')}</div>
            <div className="kpi-l">Venta en riesgo</div>
          </div>
        </div>

        {/* Focos del mes resumidos */}
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
                      <div style={{
                        fontWeight: 800, fontSize: 18,
                        color: atrasado ? 'var(--red)' : 'var(--green)',
                      }}>{p}%</div>
                      {atrasado && (
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--red)' }}>
                          ATRASADO
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="progress-bg" style={{ marginTop: 8 }}>
                    <div className="progress-fill" style={{
                      width: Math.min(p, 100) + '%',
                      background: atrasado ? 'var(--red)' : 'var(--green)',
                    }} />
                  </div>
                  {atrasado && metaU > vendido && (
                    <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                      Brecha {(metaU - vendido).toLocaleString('es-CL')} {unidad} · tocá Metas para plan de cierre
                    </div>
                  )}
                </div>
              )
            })}
          </>
        )}

        <div className="section-title">Próxima mejor acción</div>
        {prioridades.length === 0 && (
          <div className="empty-state card">
            <div className="empty-title">Sin urgencias fuertes</div>
            <p className="muted" style={{ fontSize: 13 }}>
              Revisá el mapa o cartera para armar la ruta del día.
            </p>
            <button type="button" className="btn btn-primary btn-block" style={{ marginTop: 12 }}
              onClick={() => nav('/mapa')}>
              Ir al mapa
            </button>
          </div>
        )}
        {prioridades.map((c, idx) => {
          const ef = limpiaEstado(c.estado_fuga)
          const oferta = ofertaCorta(c.oferta_real)
          const dias = Number(c.dias_sin_comprar)
          const cls = /FUGADO/i.test(c.estado_fuga || '') ? 'fuga'
            : /RIESGO/i.test(c.estado_fuga || '') ? 'riesgo'
            : 'reponer'
          const accion = /RIESGO|FUGADO|DORMIDO/i.test(c.estado_fuga || '')
            ? 'RECUPERAR HOY'
            : /ENFRI/i.test(c.estado_fuga || '')
            ? 'REACTIVAR'
            : 'VISITAR'
          return (
            <div key={c.cliente_key || idx} className={`priority-card ${cls}`}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.04, color: 'var(--brand)' }}>
                  PRIORIDAD {idx + 1}
                </div>
                <span className={`badge ${/RIESGO/i.test(c.estado_fuga || '') ? 'b-orange' : /FUGADO/i.test(c.estado_fuga || '') ? 'b-red' : 'b-amber'}`}>
                  {ef || '—'}
                </span>
              </div>
              <div style={{ fontWeight: 800, fontSize: 17, marginTop: 6, letterSpacing: '-0.02em' }}>
                {c.nombre_cliente || c.cliente_key}
              </div>
              <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                {c.comuna || '—'}
                {dias != null && dias < 999 && <> · hace {dias}d sin comprar</>}
              </div>
              <div style={{
                marginTop: 10, padding: '8px 10px', borderRadius: 12,
                background: '#fff7ed', fontSize: 13, fontWeight: 700, color: '#9a3412',
              }}>
                {accion}
                {oferta && <div style={{ fontWeight: 600, marginTop: 4, color: '#57534e' }}>Ofrecé: {oferta}</div>}
              </div>
              <div className="priority-actions">
                {c.link_whatsapp && (
                  <a href={c.link_whatsapp} target="_blank" rel="noreferrer">WhatsApp</a>
                )}
                {c.telefono && (
                  <a href={`tel:${c.telefono}`}>Llamar</a>
                )}
                <button
                  type="button"
                  className="pa-primary"
                  onClick={() => nav('/mapa')}
                >
                  Visitar
                </button>
              </div>
            </div>
          )
        })}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8, marginBottom: 20 }}>
          <button type="button" className="btn btn-soft" onClick={() => nav('/cartera')}>
            Clientes
          </button>
          <button type="button" className="btn btn-primary" onClick={() => nav('/mapa')}>
            Mapa / Ruta
          </button>
        </div>
      </div>
    </div>
  )
}
