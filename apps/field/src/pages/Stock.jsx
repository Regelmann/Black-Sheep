import { useEffect, useState, useMemo, useCallback } from 'react'
import { productTitle } from '../lib/productDisplay'
import { findBuyersForSku } from '../lib/stockIntel'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { safeAll, safeSelect } from '../lib/query'
import { DataError } from '../components/DataState.jsx'
import { DataAsOfBanner } from '../components.jsx'
import { useEjecutivo } from '../App.jsx'

function fmtNum(n) {
  if (n == null || n === '') return '—'
  const v = Number(n)
  if (isNaN(v)) return '—'
  return v.toLocaleString('es-CL', { maximumFractionDigits: 1 })
}

function unidadHint() {
  return 'kg'
}

export default function Stock() {
  const eje = useEjecutivo()
  const [loading, setLoading] = useState(true)
  const [stock, setStock] = useState([])
  const [carteraStock, setCarteraStock] = useState([])
  const [skuSel, setSkuSel] = useState(null)
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [filtro, setFiltro] = useState('Todos')
  const [orden, setOrden] = useState('foco')
  const [dataAsOf, setDataAsOf] = useState(null)
  const [errStock, setErrStock] = useState(null)
  const [errCartera, setErrCartera] = useState(null)

  const cargar = useCallback(async () => {
    setLoading(true)
    setErrStock(null); setErrCartera(null)
    // Solo la cartera del ejecutivo en vista — NUNCA mezclar zonas.
    const eid = eje?.eidVista
    // Columnas mínimas comprobadas en producción (sin venta_mensual/ciclo_dias/es_bloqueado/razon_social)
    const tries = [
      'cliente_key,nombre_cliente,sku_detalle,venta_mtd,dias_sin_comprar,zona,ejecutivo_id',
      'cliente_key,nombre_cliente,sku_detalle,venta_mtd,dias_sin_comprar,ejecutivo_id',
      'cliente_key,nombre_cliente,sku_detalle,venta_mtd,ejecutivo_id',
      'cliente_key,nombre_cliente,sku_detalle',
    ]
    let carteraRows = []
    let cartErr = null
    for (const cols of tries) {
      let q = supabase.from('cartera').select(cols).limit(3000)
      if (eid) q = q.eq('ejecutivo_id', eid)
      const rCart = await safeSelect(q)
      if (rCart.ok) { carteraRows = rCart.rows || []; cartErr = null; break }
      cartErr = rCart.error
      if (!/column|42703|PGRST204/i.test(String(cartErr?.dev || cartErr?.user || ''))) break
    }
    const rStock = await safeSelect(supabase.from('stock').select('*').order('es_foco_mes', { ascending: false }))
    const r = { stock: rStock.ok ? rStock.rows : [], errors: { stock: rStock.ok ? null : rStock.error, cartera: cartErr } }
    // Doble filtro client-side por si RLS devuelve de más
    if (eid) {
      carteraRows = (carteraRows || []).filter(c => !c.ejecutivo_id || String(c.ejecutivo_id) === String(eid))
    }
    if (eje?.zonaVista) {
      const nz = String(eje.zonaVista).toUpperCase().replace(/[^A-Z0-9]/g, '')
      carteraRows = (carteraRows || []).filter(c => {
        if (!c.zona) return true
        const cz = String(c.zona).toUpperCase().replace(/[^A-Z0-9]/g, '')
        return cz === nz || cz.includes(nz) || nz.includes(cz)
      })
    }
    setStock(r.stock)
    setCarteraStock(carteraRows)
    if (r.errors.stock) setErrStock(r.errors.stock)
    if (cartErr) setErrCartera(cartErr)
    const snap = (r.stock || []).map(s => s.fecha_snapshot).filter(Boolean).sort().pop()
    if (snap) setDataAsOf(snap)
    setLoading(false)
  }, [eje?.eidVista, eje?.zonaVista])

  useEffect(() => { cargar() }, [cargar])

  const stats = useMemo(() => {
    const focos = stock.filter(s => s.es_foco_mes).length
    const neg = stock.filter(s => Number(s.stock_operativo) < 0).length
    const bajo = stock.filter(s => {
      const c = Number(s.cobertura_dias)
      return !isNaN(c) && c >= 0 && c < 7
    }).length
    const alto = stock.filter(s => {
      const c = Number(s.cobertura_dias)
      return !isNaN(c) && c >= 30
    }).length
    const kgCritico = stock
      .filter(s => {
        const c = Number(s.cobertura_dias)
        return Number(s.stock_operativo) < 0 || (!isNaN(c) && c < 7)
      })
      .reduce((a, s) => a + Math.max(0, Number(s.stock_operativo) || 0), 0)
    const kgSobre = stock
      .filter(s => {
        const c = Number(s.cobertura_dias)
        return !isNaN(c) && c >= 30
      })
      .reduce((a, s) => a + (Number(s.stock_operativo) || 0), 0)
    return { focos, neg, bajo, alto, kgCritico, kgSobre }
  }, [stock])

  /** Insights accionables para el ejecutivo */
  const insights = useMemo(() => {
    const out = []
    const criticos = stock
      .filter(s => {
        const c = Number(s.cobertura_dias)
        return (
          Number(s.stock_operativo) < 0 ||
          (!isNaN(c) && c < 7) ||
          /VENCID|CRITIC/i.test(s.estado_stock || '')
        )
      })
      .sort((a, b) => (Number(a.cobertura_dias) || 0) - (Number(b.cobertura_dias) || 0))
      .slice(0, 5)

    const sobres = stock
      .filter(s => {
        const c = Number(s.cobertura_dias)
        return !isNaN(c) && c >= 30
      })
      .sort((a, b) => (Number(b.cobertura_dias) || 0) - (Number(a.cobertura_dias) || 0))
      .slice(0, 5)

    const focosBajos = stock.filter(s => {
      if (!s.es_foco_mes) return false
      const c = Number(s.cobertura_dias)
      return Number(s.stock_operativo) <= 0 || (!isNaN(c) && c < 10)
    })

    if (focosBajos.length) {
      out.push({
        tipo: 'foco',
        title: `${focosBajos.length} focos con stock bajo`,
        items: focosBajos.slice(0, 4).map(s => s.producto_nombre || s.sku_canon),
        accion: 'Proteger · no regalar',
        color: 'var(--danger-dk)',
        bg: 'var(--danger-lt)',
        border: 'var(--danger-lt3)',
      })
    }
    if (sobres.length) {
      out.push({
        tipo: 'sobre',
        title: `${stats.alto} en sobrestock`,
        items: sobres.slice(0, 4).map(s => {
          const n = (s.producto_nombre || s.sku_canon || '').slice(0, 22)
          return `${n} · ${fmtNum(s.cobertura_dias)}d`
        }),
        accion: 'Empujar con oferta en Hoy',
        color: 'var(--brand)',
        bg: 'var(--brand-lt2)',
        border: 'var(--brand-lt6)',
      })
    }
    if (criticos.length && !focosBajos.length) {
      out.push({
        tipo: 'crit',
        title: `${stats.bajo + stats.neg} SKU críticos`,
        items: criticos.slice(0, 4).map(s => s.producto_nombre || s.sku_canon),
        accion: 'No vender agresivo · avisar ops',
        color: 'var(--danger-dk)',
        bg: 'var(--danger-lt)',
        border: 'var(--danger-lt3)',
      })
    }
    if (!out.length) {
      out.push({
        tipo: 'ok',
        title: 'Stock en rango saludable',
        body: 'Sin focos críticos ni sobrestock extremo detectado.',
        accion: 'Seguí el plan de Hoy (reponer + riesgo)',
        color: 'var(--ok)',
        bg: 'var(--ok-lt)',
      })
    }
    return out
  }, [stock, stats])

  const lista = useMemo(() => {
    let rows = stock
    if (filtro === 'Foco') rows = rows.filter(s => s.es_foco_mes)
    if (filtro === 'Critico')
      rows = rows.filter(s => {
        const c = Number(s.cobertura_dias)
        const est = String(s.estado_stock || '').toUpperCase()
        return (
          Number(s.stock_operativo) < 0 ||
          (!isNaN(c) && c < 7) ||
          est.includes('VENCID') ||
          est.includes('CRITIC')
        )
      })
    if (filtro === 'Alto')
      rows = rows.filter(s => {
        const c = Number(s.cobertura_dias)
        return !isNaN(c) && c >= 30
      })
    if (q) {
      const qq = q.toLowerCase()
      rows = rows.filter(
        s =>
          (s.producto_nombre || '').toLowerCase().includes(qq) ||
          (s.sku_canon || '').toLowerCase().includes(qq) ||
          (s.subfamilia || '').toLowerCase().includes(qq)
      )
    }

    // Orden explícito — antes venía sólo por es_foco_mes desde la query.
    const txt = (v) => String(v || '').trim()
    const num = (v) => { const n = Number(v); return isNaN(n) ? Infinity : n }
    const sorters = {
      foco:      (a, b) => (b.es_foco_mes ? 1 : 0) - (a.es_foco_mes ? 1 : 0)
                        || num(a.cobertura_dias) - num(b.cobertura_dias),
      nombre:    (a, b) => txt(a.producto_nombre || a.sku_canon)
                        .localeCompare(txt(b.producto_nombre || b.sku_canon), 'es'),
      categoria: (a, b) => txt(a.subfamilia).localeCompare(txt(b.subfamilia), 'es')
                        || txt(a.producto_nombre).localeCompare(txt(b.producto_nombre), 'es'),
      cobertura: (a, b) => num(a.cobertura_dias) - num(b.cobertura_dias),
      volumen:   (a, b) => num(b.stock_operativo) - num(a.stock_operativo),
    }
    return [...rows].sort(sorters[orden] || sorters.foco)
  }, [stock, q, filtro, orden])

  if (loading) return <div className="bs-spinner">Cargando stock…</div>

  return (
    <div className="bs-page">
      <div className="bs-page-hero">
        <div className="bs-eyebrow">Inventario</div>
        <h1>Stock operativo</h1>
        <p className="sub">{stock.length} SKU · qué empujar y qué no vender agresivo</p>
      </div>

      <div className="wrap bs-page-body">
        {dataAsOf && <DataAsOfBanner fecha={dataAsOf} extra={`${stock.length} SKU`} />}

        <div className="bs-hoy-kpis" style={{ marginBottom: 12 }}>
          {[
            { n: stock.length, l: 'SKU', f: 'Todos' },
            { n: stats.focos, l: 'Foco', f: 'Foco' },
            { n: stats.bajo + stats.neg, l: 'Crítico', f: 'Critico' },
            { n: stats.alto, l: 'Sobrestock', f: 'Alto' },
          ].map(m => (
            <button
              key={m.l}
              type="button"
              className={'bs-hoy-kpi' + (filtro === m.f ? ' active' : '')}
              onClick={() => setFiltro(m.f)}
            >
              <strong>{m.n}</strong>
              <span>{m.l}</span>
            </button>
          ))}
        </div>

        {/* Alertas como chips (mismo lenguaje visual que filtros) */}
        {insights.length > 0 && (
          <div className="bs-chips" style={{ marginBottom: 12 }}>
            {insights.map((ins, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  if (ins.tipo === 'sobre') setFiltro('Alto')
                  else if (ins.tipo === 'foco') setFiltro('Foco')
                  else if (ins.tipo === 'crit') setFiltro('Critico')
                  else setFiltro('Todos')
                }}
                style={{
                  flex: '0 0 auto',
                  borderRadius: 999,
                  padding: '8px 12px',
                  border: `1.5px solid ${ins.color}`,
                  background: ins.bg || 'var(--brand-lt2)',
                  color: ins.color,
                  fontWeight: 800,
                  fontSize: 12,
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {ins.title}
              </button>
            ))}
          </div>
        )}

        <input
          className="search"
          placeholder="Buscar producto o SKU…"
          value={q}
          onChange={e => setQ(e.target.value)}
        />

        <div className="bs-chips">
          {['Todos', 'Foco', 'Critico', 'Alto'].map(f => (
            <button
              key={f}
              type="button"
              onClick={() => setFiltro(f)}
              style={{
                flex: '0 0 auto',
                borderRadius: 999,
                padding: '6px 11px',
                fontSize: 11,
                fontWeight: 700,
                minHeight: 32,
                border: '1.5px solid #e7e0d8',
                background: filtro === f ? 'var(--ink)' : '#fff',
                color: filtro === f ? '#fff' : 'var(--ink-4)',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {f === 'Critico' ? 'Crítico' : f === 'Alto' ? 'Sobrestock' : f}
            </button>
          ))}
        </div>

        {lista.slice(0, 150).map(s => {
          const u = unidadHint()
          const val = Number(s.stock_operativo)
          const cob = Number(s.cobertura_dias)
          const crit = val < 0 || (!isNaN(cob) && cob < 7)
          const alto = !isNaN(cob) && cob >= 30
          let accion = null
          if (val < 0 || /VENCID/i.test(s.estado_stock || '')) accion = { t: 'No ofrecer · revisar inventario', c: 'var(--danger-dk)' }
          else if (crit) accion = { t: 'Proteger stock · solo clientes clave', c: 'var(--danger-dk)' }
          else if (alto) accion = { t: 'Empujar en ruta con oferta', c: 'var(--brand)' }
          else if (s.es_foco_mes) accion = { t: 'FOCO · priorizar en visitas', c: 'var(--navy-2)' }
          return (
            <div
              key={s.id || s.sku_canon}
              style={{
                background: '#fff',
                border: `1px solid ${crit ? 'var(--danger-lt3)' : alto ? 'var(--warn-lt4)' : 'var(--line-soft)'}`,
                borderRadius: 14,
                padding: 14,
                marginBottom: 8,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {(() => {
                    const d = productTitle(s)
                    return (
                      <>
                        <div style={{
                          fontWeight: 700, fontSize: 14, color: 'var(--ink)',
                          lineHeight: 1.25, wordBreak: 'break-word',
                        }}>
                          {d.title}
                          {d.isFallback ? (
                            <span style={{
                              marginLeft: 6, fontSize: 10, fontWeight: 650,
                              color: 'var(--brand)', background: 'var(--brand-lt2)',
                              border: '1px solid #fed7aa', borderRadius: 6,
                              padding: '1px 6px', verticalAlign: 'middle',
                            }}>sin nombre</span>
                          ) : null}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 3 }}>
                          {d.subtitle}
                          {s.es_foco_mes ? ' · FOCO' : ''}
                        </div>
                      </>
                    )
                  })()}
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 16, color: val < 0 ? 'var(--danger)' : 'var(--ink)' }}>
                    {fmtNum(s.stock_operativo)}{' '}
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-3)' }}>{u}</span>
                  </div>
                  {s.cobertura_dias != null && (
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        marginTop: 2,
                        color: crit ? 'var(--danger)' : alto ? 'var(--warn)' : 'var(--ok-dk3)',
                      }}
                    >
                      {fmtNum(s.cobertura_dias)} días cob.
                    </div>
                  )}
                </div>
              </div>
              {accion && (
                <div
                  style={{
                    marginTop: 8,
                    fontSize: 11,
                    fontWeight: 700,
                    color: accion.c,
                    background: 'var(--bg-raised)',
                    display: 'inline-block',
                    padding: '4px 8px',
                    borderRadius: 8,
                  }}
                >
                  → {accion.t}
                </div>
              )}
              <button
                type="button"
                className="bs-stock-buyers-btn"
                onClick={() => setSkuSel(skuSel === (s.sku_canon || s.id) ? null : (s.sku_canon || s.id))}
              >
                {skuSel === (s.sku_canon || s.id) ? 'Ocultar compradores' : 'Encontrar compradores'}
              </button>
              {skuSel === (s.sku_canon || s.id) && (() => {
                const res = findBuyersForSku(s.sku_canon, carteraStock, {
                  productoNombre: s.producto_nombre || productTitle(s).title,
                  ejecutivoId: eje?.eidVista,
                  zona: eje?.zonaVista,
                })
                return (
                  <div className="bs-stock-buyers">
                    <div className="bs-stock-buyers-head">
                      Black Sheep encuentra · {errCartera ? '—' : `${res.totalMatch} clientes`}
                      {res.potencial > 0 && <> · ${Math.round(res.potencial).toLocaleString('es-CL')} potencial</>}
                    </div>
                    {res.enReposicion > 0 && (
                      <p className="bs-stock-buyers-sub">{res.enReposicion} en ventana de reposición</p>
                    )}
                    {errCartera ? (
                      <DataError error={errCartera} onRetry={cargar} compact />
                    ) : res.buyers.length === 0 ? (
                      <p className="bs-stock-buyers-sub">Sin match en cartera con este SKU en historial.</p>
                    ) : (
                      res.buyers.slice(0, 8).map(b => (
                        <button
                          key={b.cliente_key}
                          type="button"
                          className="bs-stock-buyer-row"
                          onClick={() => nav('/visita/' + encodeURIComponent(b.cliente_key))}
                        >
                          <span className="name">{b.nombre || b.cliente_key}</span>
                          <span className="meta">
                            {b.dias > 0 ? `${b.dias}d` : 'hoy'}
                            {b.enReposicion ? ' · reponer' : ''}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                )
              })()}
            </div>
          )
        })}
        {!lista.length && (
          <div style={{ textAlign: 'center', padding: 24, color: 'var(--ink-3)' }}>Sin productos con este filtro.</div>
        )}
      </div>
    </div>
  )
}
