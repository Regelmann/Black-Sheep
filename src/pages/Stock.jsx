import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { DataAsOfBanner } from '../components.jsx'

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
  const [loading, setLoading] = useState(true)
  const [stock, setStock] = useState([])
  const [q, setQ] = useState('')
  const [filtro, setFiltro] = useState('Todos')
  const [dataAsOf, setDataAsOf] = useState(null)

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      const { data } = await supabase.from('stock').select('*').order('es_foco_mes', { ascending: false })
      setStock(data || [])
      const snap = (data || []).map(s => s.fecha_snapshot).filter(Boolean).sort().pop()
      if (snap) setDataAsOf(snap)
      setLoading(false)
    })()
  }, [])

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
        color: '#b91c1c',
        bg: '#fef2f2',
        border: '#fecaca',
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
        color: '#c2410c',
        bg: '#fff7ed',
        border: '#fed7aa',
      })
    }
    if (criticos.length && !focosBajos.length) {
      out.push({
        tipo: 'crit',
        title: `${stats.bajo + stats.neg} SKU críticos`,
        items: criticos.slice(0, 4).map(s => s.producto_nombre || s.sku_canon),
        accion: 'No vender agresivo · avisar ops',
        color: '#b91c1c',
        bg: '#fef2f2',
        border: '#fecaca',
      })
    }
    if (!out.length) {
      out.push({
        tipo: 'ok',
        title: 'Stock en rango saludable',
        body: 'Sin focos críticos ni sobrestock extremo detectado.',
        accion: 'Seguí el plan de Hoy (reponer + riesgo)',
        color: '#15803d',
        bg: '#ecfdf5',
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
    return rows
  }, [stock, q, filtro])

  if (loading) return <div className="spinner">Cargando stock…</div>

  return (
    <div>
      <div
        style={{
          background: 'linear-gradient(145deg, #1c1917 0%, #292524 70%, #44403c 100%)',
          color: '#fff',
          padding: '24px 18px 26px',
          borderRadius: '0 0 22px 22px',
          borderBottom: '3px solid #c2410c',
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 700, color: '#fdba74', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 5 }}>
          Inventario
        </div>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Stock operativo</h1>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: 'rgba(255,255,255,0.75)' }}>
          {stock.length} SKU · kg · qué empujar / qué proteger
        </p>
      </div>

      <div style={{ padding: 14 }}>
        {dataAsOf && <DataAsOfBanner fecha={dataAsOf} extra={`${stock.length} SKU`} />}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 8,
            marginBottom: 12,
          }}
        >
          {[
            { n: stock.length, l: 'SKU', c: '#1c1917' },
            { n: stats.focos, l: 'Foco', c: '#c2410c' },
            { n: stats.bajo + stats.neg, l: 'Crítico', c: '#dc2626' },
            { n: stats.alto, l: 'Sobrestock', c: '#d97706' },
          ].map(m => (
            <button
              key={m.l}
              type="button"
              onClick={() =>
                setFiltro(
                  m.l === 'Foco' ? 'Foco' : m.l === 'Crítico' ? 'Critico' : m.l === 'Sobrestock' ? 'Alto' : 'Todos'
                )
              }
              style={{
                background: '#fff',
                borderRadius: 12,
                padding: '12px 6px',
                textAlign: 'center',
                border: '1px solid #e7e0d8',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              <div style={{ fontSize: 18, fontWeight: 800, color: m.c }}>{m.n}</div>
              <div style={{ fontSize: 9, fontWeight: 700, color: '#a8a29e', textTransform: 'uppercase' }}>{m.l}</div>
            </button>
          ))}
        </div>

        {/* Alertas como chips (mismo lenguaje visual que filtros) */}
        {insights.length > 0 && (
          <div style={{ marginBottom: 12, display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
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
                  background: ins.bg || '#fff7ed',
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

        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 12 }}>
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
                background: filtro === f ? '#1c1917' : '#fff',
                color: filtro === f ? '#fff' : '#57534e',
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
          if (val < 0 || /VENCID/i.test(s.estado_stock || '')) accion = { t: 'No ofrecer · revisar inventario', c: '#b91c1c' }
          else if (crit) accion = { t: 'Proteger stock · solo clientes clave', c: '#b91c1c' }
          else if (alto) accion = { t: 'Empujar en ruta con oferta', c: '#c2410c' }
          else if (s.es_foco_mes) accion = { t: 'FOCO · priorizar en visitas', c: '#1e3a5f' }
          return (
            <div
              key={s.id || s.sku_canon}
              style={{
                background: '#fff',
                border: `1px solid ${crit ? '#fecaca' : alto ? '#fde68a' : '#e7e0d8'}`,
                borderRadius: 14,
                padding: 14,
                marginBottom: 8,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#1c1917' }}>
                    {s.producto_nombre || s.sku_canon}
                  </div>
                  <div style={{ fontSize: 12, color: '#78716c', marginTop: 3 }}>
                    {s.sku_canon}
                    {s.subfamilia ? ` · ${s.subfamilia}` : ''}
                    {s.es_foco_mes ? ' · FOCO' : ''}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 16, color: val < 0 ? '#dc2626' : '#1c1917' }}>
                    {fmtNum(s.stock_operativo)}{' '}
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#78716c' }}>{u}</span>
                  </div>
                  {s.cobertura_dias != null && (
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        marginTop: 2,
                        color: crit ? '#dc2626' : alto ? '#d97706' : '#3f6212',
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
                    background: '#fafaf9',
                    display: 'inline-block',
                    padding: '4px 8px',
                    borderRadius: 8,
                  }}
                >
                  → {accion.t}
                </div>
              )}
            </div>
          )
        })}
        {!lista.length && (
          <div style={{ textAlign: 'center', padding: 24, color: '#78716c' }}>Sin productos con este filtro.</div>
        )}
      </div>
    </div>
  )
}
