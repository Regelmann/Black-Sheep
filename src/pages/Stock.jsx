import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { DataAsOfBanner } from '../components.jsx'
import { useEjecutivo } from '../App.jsx'

function fmtNum(n) {
  if (n == null || n === '') return '—'
  const v = Number(n)
  if (isNaN(v)) return '—'
  return v.toLocaleString('es-CL', { maximumFractionDigits: 1 })
}

/** Intenta detectar unidad a partir del nombre / subfamilia / estado */
function unidadHint(s) {
  // Ciclo limpio publica stock_operativo siempre en KG
  return 'kg'
}

export default function Stock() {
  const [loading, setLoading] = useState(true)
  const [stock, setStock] = useState([])
  const [q, setQ] = useState('')
  const [filtro, setFiltro] = useState('Todos')
  const [dataAsOf, setDataAsOf] = useState(null)
  const [skuSel, setSkuSel] = useState(null)
  const [skuClientes, setSkuClientes] = useState({})
  const eje = useEjecutivo()

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

  async function cargarClientesSku(skuCanon) {
    if (skuSel === skuCanon) { setSkuSel(null); return }
    setSkuSel(skuCanon)
    if (skuClientes[skuCanon]) return
    setSkuClientes(prev => ({ ...prev, [skuCanon]: { loading: true, clientes: [] } }))
    const eid = eje?.eidVista
    try {
      // Buscar en cartera clientes que tienen ese SKU en sus productos_top o sku_detalle
      let q = supabase.from('cartera').select('nombre_cliente,comuna,venta_mtd,sku_detalle,productos_top,cliente_key').limit(300)
      if (eid) q = q.eq('ejecutivo_id', eid)
      const { data } = await q
      const clientes = (data || []).filter(c => {
        const det = (c.sku_detalle || '') + ' ' + (c.productos_top || '')
        return det.includes(skuCanon)
      }).sort((a, b) => (Number(b.venta_mtd) || 0) - (Number(a.venta_mtd) || 0)).slice(0, 20)
      setSkuClientes(prev => ({ ...prev, [skuCanon]: { loading: false, clientes } }))
    } catch {
      setSkuClientes(prev => ({ ...prev, [skuCanon]: { loading: false, clientes: [] } }))
    }
  }

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
    return { focos, neg, bajo, alto }
  }, [stock])

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
          {stock.length} SKU · stock en kilogramos (API Flint) · vencidos / críticos marcados
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
            <div
              key={m.l}
              style={{
                background: '#fff',
                borderRadius: 12,
                padding: '12px 6px',
                textAlign: 'center',
                border: '1px solid #e7e0d8',
              }}
            >
              <div style={{ fontSize: 18, fontWeight: 800, color: m.c }}>{m.n}</div>
              <div style={{ fontSize: 9, fontWeight: 700, color: '#a8a29e', textTransform: 'uppercase' }}>{m.l}</div>
            </div>
          ))}
        </div>

        <input
          className="search"
          placeholder="Buscar producto o SKU…"
          value={q}
          onChange={e => setQ(e.target.value)}
        />

        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', marginBottom: 12 }}>
          {['Todos', 'Foco', 'Critico', 'Alto'].map(f => (
            <button
              key={f}
              type="button"
              onClick={() => setFiltro(f)}
              style={{
                flex: '0 0 auto',
                borderRadius: 999,
                padding: '8px 13px',
                fontSize: 12,
                fontWeight: 700,
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

        <p style={{ fontSize: 11, color: '#78716c', marginBottom: 10 }}>
          Cantidad = stock en <b>unidad de origen</b> (si el SKU es al peso → kg; salsas → lt; cajas → ud).
          Cobertura = días de venta al ritmo actual. Fuente: looker_04_stock_decision_final.
        </p>

        {lista.slice(0, 150).map(s => {
          const u = unidadHint(s)
          const val = Number(s.stock_operativo)
          const cob = Number(s.cobertura_dias)
          const crit = val < 0 || (!isNaN(cob) && cob < 7)
          const alto = !isNaN(cob) && cob >= 30
          return (
            <div
              key={s.id || s.sku_canon}
              style={{
                background: '#fff',
                border: `1px solid ${crit ? '#fecaca' : alto ? '#fde68a' : '#e7e0d8'}`,
                borderRadius: 14,
                padding: 14,
                marginBottom: 8,
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
                alignItems: 'flex-start',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <button
                  type="button"
                  onClick={() => cargarClientesSku(s.sku_canon)}
                  style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#1c1917', lineHeight: 1.3 }}>
                    {s.producto_nombre && s.producto_nombre !== s.sku_canon
                      ? s.producto_nombre
                      : <span style={{ color: '#a8a29e', fontStyle: 'italic' }}>{s.sku_canon}</span>}
                  </div>
                  <div style={{ fontSize: 11, color: '#78716c', marginTop: 3, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <span>{s.sku_canon}</span>
                    {s.subfamilia && <span>· {s.subfamilia}</span>}
                    {s.es_foco_mes && <span style={{ color: '#c2410c', fontWeight: 700 }}>· FOCO</span>}
                    {s.estado_stock && !/^OK$/i.test(s.estado_stock) && <span style={{ color: '#dc2626' }}>· {s.estado_stock}</span>}
                    <span style={{ color: '#c2410c', fontWeight: 600 }}>· Ver clientes {skuSel === s.sku_canon ? '▲' : '▼'}</span>
                  </div>
                </button>
                {skuSel === s.sku_canon && (() => {
                  const det = skuClientes[s.sku_canon]
                  return (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #f5f5f4' }}>
                      {det?.loading && <div style={{ fontSize: 12, color: '#a8a29e' }}>Cargando clientes…</div>}
                      {det && !det.loading && det.clientes.length === 0 && (
                        <div style={{ fontSize: 12, color: '#a8a29e' }}>Sin clientes en cartera que hayan comprado este SKU.</div>
                      )}
                      {(det?.clientes || []).map((c, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0', borderBottom: i < det.clientes.length - 1 ? '1px solid #f9f9f8' : 'none' }}>
                          <div>
                            <span style={{ fontWeight: 600, color: '#1c1917' }}>{c.nombre_cliente}</span>
                            {c.comuna && <span style={{ color: '#a8a29e', marginLeft: 5 }}>{c.comuna}</span>}
                          </div>
                          <span style={{ fontWeight: 700, color: '#c2410c', flexShrink: 0 }}>
                            {c.venta_mtd ? '$' + Number(c.venta_mtd).toLocaleString('es-CL', { maximumFractionDigits: 0 }) : '—'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )
                })()}
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div
                  style={{
                    fontWeight: 800,
                    fontSize: 16,
                    color: val < 0 ? '#dc2626' : '#1c1917',
                  }}
                >
                  {fmtNum(s.stock_operativo)} <span style={{ fontSize: 12, fontWeight: 600, color: '#78716c' }}>{u}</span>
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
          )
        })}
        {!lista.length && (
          <div style={{ textAlign: 'center', padding: 24, color: '#78716c' }}>Sin productos con este filtro.</div>
        )}
      </div>
    </div>
  )
}
