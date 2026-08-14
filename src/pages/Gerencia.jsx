import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { money , DataAsOfBanner} from '../components.jsx'

function fmtStock(n) {
  if (n == null || n === '') return '—'
  const v = Number(n)
  if (isNaN(v)) return '—'
  const r = Math.round(v * 100) / 100
  return r.toLocaleString('es-CL', { maximumFractionDigits: 1 })
}

function parseSkuDetalle(text) {
  if (!text) return []
  return String(text)
    .split(/\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const p = line.split('||')
      // V1.4: nombre||prom_ud||ud_mtd||prom_clp||clp_mtd||ultima||ciclo_dias||n_compras
      if (p.length >= 5) {
        const cicloRaw = p[6]
        const cicloDias =
          cicloRaw !== undefined && cicloRaw !== '' && !isNaN(Number(cicloRaw))
            ? Number(cicloRaw)
            : null
        return {
          nombre: p[0],
          promUd: Number(p[1]) || 0,
          udMtd: Number(p[2]) || 0,
          promClp: Number(p[3]) || 0,
          clpMtd: Number(p[4]) || 0,
          ultima: p[5] || null,
          cicloDias,
          nCompras: p[7] !== undefined && p[7] !== '' ? Number(p[7]) || 0 : null,
        }
      }
      if (p.length >= 3) {
        return {
          nombre: p[0],
          promUd: Number(p[1]) || 0,
          udMtd: Number(p[1]) || 0,
          promClp: Number(p[2]) || 0,
          clpMtd: Number(p[2]) || 0,
          ultima: null,
          cicloDias: null,
          nCompras: null,
        }
      }
      return { nombre: p[0], promUd: 0, udMtd: 0, promClp: 0, clpMtd: 0, ultima: null, cicloDias: null, nCompras: null }
    })
}


/**
 * Ciclo REAL (mediana de gaps entre compras desde bajada V1.4).
 * No inventa frecuencia desde unidades/mes.
 */
function cicloReposicion(s) {
  let diasUltima = null
  if (s.ultima) {
    const d = new Date(String(s.ultima).slice(0, 10) + 'T12:00:00')
    if (!isNaN(d.getTime())) {
      diasUltima = Math.max(0, Math.round((Date.now() - d.getTime()) / 86400000))
    }
  }
  const cicloEst =
    s.cicloDias != null && !isNaN(Number(s.cicloDias)) && Number(s.cicloDias) > 0
      ? Math.round(Number(s.cicloDias))
      : null
  let recompra = null
  if (diasUltima != null && cicloEst != null) {
    const delta = diasUltima - cicloEst
    if (delta >= 3) recompra = { label: `Debería comprar ya · atrasa ${delta}d`, tone: 'bad' }
    else if (delta >= 0) recompra = { label: 'Hoy debería reponer', tone: 'warn' }
    else if (delta === -1) recompra = { label: 'Mañana debería reponer', tone: 'ok' }
    else recompra = { label: `Próxima ~${Math.abs(delta)}d`, tone: 'muted' }
  } else if (diasUltima != null) {
    recompra = { label: `Sin compra hace ${diasUltima}d`, tone: diasUltima >= 21 ? 'bad' : 'warn' }
  }
  return { diasUltima, cicloEst, recompra }
}

function exportCsv(nombre, cabeceras, filas) {
  const cab = cabeceras.join(',')
  const body = filas.map(r => r.map(x => `"${String(x ?? '').replace(/"/g, "'")}"`).join(',')).join('\n')
  const blob = new Blob(['\ufeff' + cab + '\n' + body], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  a.click()
  URL.revokeObjectURL(url)
}

function barColor(pct) {
  if (pct >= 100) return '#16a34a'
  if (pct >= 80) return '#2563eb'
  if (pct >= 50) return '#f59e0b'
  return '#ef4444'
}

function mesLabel(m) {
  const s = String(m || '')
  const p = s.slice(0, 7)
  const [y, mo] = p.split('-')
  const nombres = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  const mi = Number(mo)
  return nombres[mi] ? `${nombres[mi]} ${String(y).slice(2)}` : s.slice(0, 7)
}

const ZONAS_TERRENO = new Set(['NOR-ORIENTE', 'NOR-PONIENTE', 'ZONA SUR'])

function esTerreno(nombre) {
  return ZONAS_TERRENO.has(String(nombre || '').toUpperCase().trim())
}

function esSinAsignar(nombre) {
  const n = String(nombre || '').toUpperCase()
  return n.includes('NO_ASIGN') || n.includes('SIN ASIGN') || n.includes('SIN_ASIGN')
}

function canalDeCliente(d) {
  return String(d?.ejecutivo || d?.canal || d?.zona || d?.zona_canal || '').toUpperCase().trim()
}

export default function Gerencia({ esGerente }) {
  const [dataAsOf, setDataAsOf] = useState(null)
  const [loading, setLoading] = useState(true)
  const [gerencia, setGerencia] = useState([])
  const [tendencia, setTendencia] = useState([])
  const [topProd, setTopProd] = useState([])
  const [stockLento, setStockLento] = useState([])
  const [mesSel, setMesSel] = useState(null)
  const [error, setError] = useState(null)
  const [tab, setTab] = useState('zonas') // zonas | productos | stock
  const [detalleCli, setDetalleCli] = useState([])
  const [canalSel, setCanalSel] = useState(null)
  const [cliSel, setCliSel] = useState(null) // cliente_key expandido
  const [cliSku, setCliSku] = useState({}) // { [cliente_key]: { skus, oferta, loading } }

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const [{ data: g }, { data: t }, { data: stock }, { data: det }] = await Promise.all([
          supabase.from('gerencia').select('*'),
          supabase.from('tendencia').select('*'),
          supabase.from('stock').select('*').limit(500),
          supabase.from('gerencia_clientes').select('*').order('venta_mtd', { ascending: false }).limit(800),
        ])
        const detN = (det || []).map(d => ({
          ...d,
          ejecutivo: d.ejecutivo || d.canal || d.zona || null,
          canal: d.canal || d.ejecutivo || d.zona || null,
          nombre_cliente: d.nombre_cliente || d.nombre || d.cliente_key,
        }))
        setDetalleCli(detN)
        const rows = (g || []).filter(r => r.ejecutivo && !String(r.ejecutivo).startsWith('_')).slice().sort((a, b) => (Number(b.venta_mtd) || 0) - (Number(a.venta_mtd) || 0))
        const snaps = rows.map(r => r.fecha_snapshot).filter(Boolean)
        if (snaps.length) setDataAsOf([...snaps].sort().pop())
        setGerencia(rows)
        setTendencia((t || []).slice().sort((a, b) => String(a.mes).localeCompare(String(b.mes))))
        if (!rows.length) setError('Sin filas en gerencia. Corré bajada v8.10+.')

        // Top productos: usar stock con venta/foco si existe, si no ordenar por stock_operativo bajo
        const sk = stock || []
        // Top: focos primero, luego cualquier SKU con stock
        const focos = sk.filter(s => s.es_foco_mes || s.es_foco || /foco/i.test(String(s.estado_stock || s.decision || '')))
        const top = (focos.length ? focos : sk)
          .slice()
          .sort((a, b) => {
            const fa = (a.es_foco_mes || a.es_foco) ? 1 : 0
            const fb = (b.es_foco_mes || b.es_foco) ? 1 : 0
            if (fb !== fa) return fb - fa
            return Number(b.stock_operativo || 0) - Number(a.stock_operativo || 0)
          })
          .slice(0, 15)
        setTopProd(top)

        const lento = sk
          .filter(s => {
            const cob = Number(s.cobertura_dias)
            const stk = Number(s.stock_operativo || s.stock || 0)
            const est = String(s.estado_stock || s.decision || s.estado || '')
            if (stk <= 0) return false
            if (!isNaN(cob) && cob >= 21) return true
            if (/sobre|exceso|lento|parado|alto|critico_alto|sobrestock|sin.?mov|muerto|obsoleto/i.test(est)) return true
            // Sin cobertura: candidatos por stock alto (unidad origen)
            if (isNaN(cob) && stk >= 30) return true
            return false
          })
          .sort((a, b) => {
            const ca = Number(a.cobertura_dias)
            const cb = Number(b.cobertura_dias)
            if (!isNaN(cb) && !isNaN(ca) && cb !== ca) return cb - ca
            return Number(b.stock_operativo || 0) - Number(a.stock_operativo || 0)
          })
          .slice(0, 25)
        setStockLento(lento)
      } catch (e) {
        setError(String(e.message || e))
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const terreno = useMemo(() => gerencia.filter(g => esTerreno(g.ejecutivo)), [gerencia])
  const otros = useMemo(() => gerencia.filter(g => !esTerreno(g.ejecutivo)), [gerencia])

  // Total real del mes = suma de TODAS las filas (una sola fuente si bajada está bien)
  const totalVenta = useMemo(() => gerencia.reduce((s, x) => s + (Number(x.venta_mtd) || 0), 0), [gerencia])
  const totalMetaTerreno = useMemo(() => terreno.reduce((s, x) => s + (Number(x.meta_mensual) || 0), 0), [terreno])
  const ventaTerreno = useMemo(() => terreno.reduce((s, x) => s + (Number(x.venta_mtd) || 0), 0), [terreno])
  const pctTerreno = totalMetaTerreno ? Math.round((ventaTerreno / totalMetaTerreno) * 100) : 0
  const noAsignado = useMemo(
    () => gerencia.filter(g => esSinAsignar(g.ejecutivo)).reduce((s, x) => s + (Number(x.venta_mtd) || 0), 0),
    [gerencia]
  )

  const participacion = useMemo(() => {
    if (!totalVenta) return []
    return gerencia
      .map(g => {
        const venta = Number(g.venta_mtd) || 0
        return {
          ejecutivo: g.ejecutivo || '—',
          venta,
          pct: Math.round((venta / totalVenta) * 1000) / 10,
          terreno: esTerreno(g.ejecutivo),
          meta: Number(g.meta_mensual) || 0,
          clientes: Number(g.clientes_mtd || 0) || null,
        }
      })
      .sort((a, b) => b.venta - a.venta)
  }, [gerencia, totalVenta])

  const maxMes = useMemo(() => Math.max(1, ...tendencia.map(t => Number(t.venta_clp) || 0)), [tendencia])
  const anioVenta = useMemo(() => tendencia.reduce((s, t) => s + (Number(t.venta_clp) || 0), 0), [tendencia])
  const mesSelRow = tendencia.find(x => x.mes === mesSel)


  async function cargarSkuCliente(clienteKey) {
    if (!clienteKey) return
    if (cliSel === clienteKey) {
      setCliSel(null)
      return
    }
    setCliSel(clienteKey)
    if (cliSku[clienteKey]?.skus) return
    setCliSku(prev => ({ ...prev, [clienteKey]: { loading: true, skus: [], oferta: null } }))
    const { data } = await supabase
      .from('cartera')
      .select('sku_detalle,oferta_real,productos_top,venta_mtd,venta_mensual,dias_sin_comprar,ultima_compra')
      .eq('cliente_key', clienteKey)
      .limit(1)
    const row = data?.[0]
    setCliSku(prev => ({
      ...prev,
      [clienteKey]: {
        loading: false,
        skus: parseSkuDetalle(row?.sku_detalle),
        oferta: row?.oferta_real || null,
        productos_top: row?.productos_top || null,
        venta_mtd: row?.venta_mtd,
        dias_sin_comprar: row?.dias_sin_comprar,
        ultima_compra: row?.ultima_compra,
      },
    }))
  }

  if (loading) return <div className="spinner">Cargando gerencia…</div>
  if (!esGerente) {
    return (
      <div className="wrap">
        {dataAsOf && <DataAsOfBanner fecha={dataAsOf} />}
        <div className="card center">
          <p className="muted">Sección solo para gerencia.</p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div style={{
          background: 'linear-gradient(145deg, #1c1917 0%, #292524 70%, #44403c 100%)',
          color: '#fff',
          padding: '26px 20px 28px',
          borderRadius: '0 0 24px 24px',
          boxShadow: '0 8px 24px rgba(28,25,23,0.25)', borderBottom: '3px solid #c2410c',
        }}>
        <div style={{
            fontSize: 12, fontWeight: 700, letterSpacing: '0.06em',
            textTransform: 'uppercase', color: '#fdba74', marginBottom: 6,
          }}>Vista gerencial</div>
        <h1>Resultado del mes</h1>
        <p>Venta total · terreno · canales</p>
      </div>
      <div className="wrap">
        {error && (
          <div className="card" style={{ borderLeft: '4px solid #f59e0b', fontSize: 13 }}>
            {error}
          </div>
        )}

        {/* KPI global */}
        <div className="card">
          <div className="card-label">Mes en curso · venta total compañía</div>
          <div style={{ marginTop: 8 }}>
            <div className="muted" style={{ fontSize: 10, fontWeight: 700 }}>VENDIDO TOTAL (todos los canales)</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: '#2563eb' }}>{money(totalVenta)}</div>
          </div>
          <div style={{ marginTop: 12, padding: '10px 12px', background: '#f8fafc', borderRadius: 12 }}>
            <div className="muted" style={{ fontSize: 10, fontWeight: 700 }}>Solo terreno (3 zonas con meta)</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 13 }}>
              <span>
                <b>{money(ventaTerreno)}</b> / {money(totalMetaTerreno)} · {pctTerreno}%
              </span>
              <span className="muted">brecha terreno {money(Math.max(0, totalMetaTerreno - ventaTerreno))}</span>
            </div>
            <div className="progress-bg" style={{ marginTop: 8 }}>
              <div
                className="progress-fill"
                style={{ width: Math.min(pctTerreno, 100) + '%', background: barColor(pctTerreno) }}
              />
            </div>
          </div>
          {noAsignado > 0 && (
            <div
              style={{
                marginTop: 10,
                padding: '8px 10px',
                background: '#fef3c7',
                borderRadius: 10,
                fontSize: 12,
                color: '#92400e',
              }}
            >
              <b>{money(noAsignado)}</b> ({Math.round((noAsignado / Math.max(totalVenta, 1)) * 100)}%) sin
              zona en maestra. Completar columna de asignación baja el “NO_ASIGNADOS” y sube el peso real de
              cada ejecutivo.
            </div>
          )}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, margin: '12px 0', overflowX: 'auto' }}>
          {[
            { id: 'zonas', label: 'Zonas / canales' },
            { id: 'productos', label: 'Top productos' },
            { id: 'stock', label: 'Stock lento' },
          ].map(t => (
            <button
              key={t.id}
              type="button"
              className={'chip' + (tab === t.id ? ' active' : '')}
              onClick={() => setTab(t.id)}
              style={{
                padding: '8px 14px',
                borderRadius: 20,
                border: tab === t.id ? '2px solid #1e3a5f' : '1px solid #e2e8f0',
                background: tab === t.id ? '#1e3a5f' : '#fff',
                color: tab === t.id ? '#fff' : '#475569',
                fontWeight: 700,
                fontSize: 12,
                whiteSpace: 'nowrap',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'zonas' && (
          <>
            <div className="card">
              <div className="card-label">Peso en la venta del mes (100% = total real)</div>
              {participacion.map(p => (
                <div key={p.ejecutivo} style={{ marginTop: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span style={{ fontWeight: 700 }}>
                      {p.ejecutivo}
                      {p.terreno ? (
                        <span className="muted" style={{ fontWeight: 500, marginLeft: 6 }}>
                          terreno
                        </span>
                      ) : null}
                    </span>
                    <span>
                      <b>{p.pct}%</b> · {money(p.venta)}
                    </span>
                  </div>
                  <div className="progress-bg" style={{ marginTop: 4 }}>
                    <div
                      className="progress-fill"
                      style={{
                        width: Math.min(p.pct, 100) + '%',
                        background: p.terreno ? '#2563eb' : esSinAsignar(p.ejecutivo) ? '#f59e0b' : '#94a3b8',
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <h3 className="section-title">Terreno (con meta)</h3>
            {terreno.map(g => {
              const venta = Number(g.venta_mtd) || 0
              const meta = Number(g.meta_mensual) || 0
              const p = meta ? Math.round((venta / meta) * 100) : 0
              const color = barColor(p)
              const open = canalSel === g.ejecutivo
              const cliZona = detalleCli.filter(
                d => canalDeCliente(d) === String(g.ejecutivo).toUpperCase().trim()
              )
              return (
                <div key={g.ejecutivo || g.id} className="card">
                  <button
                    type="button"
                    onClick={() => setCanalSel(open ? null : g.ejecutivo)}
                    style={{
                      width: '100%', textAlign: 'left', background: 'none', border: 'none',
                      padding: 0, cursor: 'pointer', fontFamily: 'inherit', color: 'inherit',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <b>{g.ejecutivo}</b>
                      <span style={{ color, fontWeight: 800 }}>{p}% {open ? '▲' : '▼'}</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 8, fontSize: 12 }}>
                      <div>
                        <div className="muted">Venta</div>
                        <div style={{ fontWeight: 700 }}>{money(venta)}</div>
                      </div>
                      <div>
                        <div className="muted">Meta</div>
                        <div style={{ fontWeight: 700 }}>{money(meta)}</div>
                      </div>
                      <div>
                        <div className="muted">Clientes MTD</div>
                        <div style={{ fontWeight: 700 }}>{cliZona.length || '—'}</div>
                      </div>
                    </div>
                    <div className="progress-bg" style={{ marginTop: 8 }}>
                      <div className="progress-fill" style={{ width: Math.min(p, 100) + '%', background: color }} />
                    </div>
                  </button>
                  {g.accion && (() => {
                    const partes = String(g.accion).split(' · ')
                    const top = partes.find(p => p.startsWith('TOP:'))
                    const resto = partes.filter(p => !p.startsWith('TOP:')).join(' · ')
                    return (
                      <div style={{ marginTop: 8 }}>
                        {resto && <div className="muted" style={{ fontSize: 12 }}>{resto}</div>}
                        {top && (
                          <div style={{ fontSize: 11, color: '#78716c', marginTop: 4, lineHeight: 1.5 }}>
                            <b>Top SKU:</b> {top.replace('TOP: ', '').split(' | ').slice(0, 3).join(' · ')}
                          </div>
                        )}
                      </div>
                    )
                  })()}
                  {open && (
                    <div style={{ marginTop: 10, borderTop: '1px solid #e2e8f0', paddingTop: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, gap: 8 }}>
                        <div className="muted" style={{ fontSize: 11 }}>
                          Clientes del mes · % de la venta de la zona
                        </div>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          style={{ fontSize: 11, padding: '4px 10px' }}
                          onClick={() => {
                            const rows = cliZona.map(d => {
                              const det = cliSku[d.cliente_key]
                              return [
                                d.nombre_cliente,
                                d.comuna,
                                d.cliente_key,
                                d.venta_mtd,
                                venta ? Math.round((Number(d.venta_mtd) / venta) * 1000) / 10 : 0,
                                det?.skus?.length || '',
                                (det?.skus || []).map(s => s.nombre).join(' | '),
                              ]
                            })
                            exportCsv(
                              `gerencia_${String(g.ejecutivo || 'zona').replace(/\s+/g, '_')}.csv`,
                              ['nombre', 'comuna', 'cliente_key', 'venta_mtd', 'pct_zona', 'n_sku', 'skus'],
                              rows
                            )
                          }}
                        >
                          Excel CSV
                        </button>
                      </div>
                      {cliZona.slice(0, 50).map(d => {
                        const pctCli = venta ? Math.round((Number(d.venta_mtd) / venta) * 1000) / 10 : 0
                        const openCli = cliSel === d.cliente_key
                        const det = cliSku[d.cliente_key]
                        return (
                          <div
                            key={d.cliente_key}
                            style={{
                              background: openCli ? '#fff7ed' : '#fff',
                              border: openCli ? '1.5px solid #fdba74' : '1px solid #e7e5e4',
                              borderRadius: 12,
                              padding: '10px 12px',
                              marginBottom: 8,
                              boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                            }}
                          >
                            <button
                              type="button"
                              onClick={() => cargarSkuCliente(d.cliente_key)}
                              style={{
                                width: '100%', display: 'flex', justifyContent: 'space-between', gap: 8,
                                fontSize: 12, padding: 0, border: 'none', background: 'none',
                                cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                              }}
                            >
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontWeight: 600, color: '#1c1917' }}>{d.nombre_cliente || d.cliente_key}</div>
                                <div className="muted">
                                  {d.comuna || '—'} · {pctCli}% de la zona
                                  {det?.skus?.length ? ` · ${det.skus.length} SKU` : ''}
                                  {' · '}{openCli ? '▲' : '▼ mix'}
                                </div>
                              </div>
                              <div style={{ fontWeight: 700, whiteSpace: 'nowrap', color: '#c2410c' }}>{money(d.venta_mtd)}</div>
                            </button>
                            {openCli && (
                              <div style={{ padding: '0 0 10px 4px', fontSize: 12 }}>
                                {det?.loading && <div className="muted">Cargando mix…</div>}
                                {det?.ultima_compra && (
                                  <div className="muted" style={{ marginBottom: 4 }}>
                                    Última compra: {det.ultima_compra}
                                    {det.dias_sin_comprar != null ? ` · ${det.dias_sin_comprar}d` : ''}
                                  </div>
                                )}
                                {det?.oferta && (
                                  <div style={{ background: '#fff7ed', padding: '6px 8px', borderRadius: 8, marginBottom: 6, color: '#9a3412' }}>
                                    <b>Ofrecé:</b> {det.oferta}
                                  </div>
                                )}
                                {(det?.skus || []).slice(0, 10).map((s, i) => {
                                  const pct = s.promClp > 0 ? Math.round((s.clpMtd / s.promClp) * 100) : s.clpMtd > 0 ? 100 : 0
                                  const falta = Math.max(0, s.promUd - s.udMtd)
                                  const { recompra, cicloEst, diasUltima } = cicloReposicion(s)
                                  const toneColor = { bad: '#b91c1c', warn: '#b45309', ok: '#15803d', muted: '#57534e' }[recompra?.tone || 'muted']
                                  return (
                                    <div key={i} style={{ padding: '6px 0', borderBottom: '1px solid #f5f5f4' }}>
                                      <div style={{ fontWeight: 600 }}>{s.nombre}</div>
                                      <div className="muted" style={{ fontSize: 11 }}>
                                        Prom {fmtStock(s.promUd)} ud · {money(s.promClp)} → mes {fmtStock(s.udMtd)} ud · {money(s.clpMtd)} ({pct}%)
                                      </div>
                                      {falta > 0 && (
                                        <div style={{ fontSize: 11, color: '#b45309' }}>Faltan ~{fmtStock(falta)} ud a su ritmo</div>
                                      )}
                                      {(diasUltima != null || cicloEst != null) && (
                                        <div style={{ fontSize: 11, color: toneColor, fontWeight: 600, marginTop: 2 }}>
                                          {diasUltima != null && <span>Última hace {diasUltima}d</span>}
                                          {diasUltima != null && cicloEst != null && ' · '}
                                          {cicloEst != null && <span>Ciclo ~{cicloEst}d</span>}
                                          {recompra && <span> · {recompra.label}</span>}
                                        </div>
                                      )}
                                    </div>
                                  )
                                })}
                                {!det?.loading && !(det?.skus || []).length && (
                                  <div className="muted">Sin sku_detalle en cartera para este cliente.</div>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })}
                      {!cliZona.length && (
                        <p className="muted" style={{ fontSize: 12 }}>Sin clientes listados para esta zona.</p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}

            <h3 className="section-title">Otros canales / sin asignar</h3>
            {otros.map(g => {
              const venta = Number(g.venta_mtd) || 0
              const pct = totalVenta ? Math.round((venta / totalVenta) * 1000) / 10 : 0
              const open = canalSel === g.ejecutivo
              return (
                <div key={g.ejecutivo || g.id} className="card">
                  <button
                    type="button"
                    onClick={() => setCanalSel(open ? null : g.ejecutivo)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <b>{g.ejecutivo}</b>
                      <span className="muted">{pct}% · {open ? '▲' : '▼'}</span>
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 800, marginTop: 4, color: '#0f172a' }}>
                      {money(venta)}
                    </div>
                  </button>
                  {g.accion && (() => {
                    const partes = String(g.accion).split(' · ')
                    const top = partes.find(p => p.startsWith('TOP:'))
                    const resto = partes.filter(p => !p.startsWith('TOP:')).join(' · ')
                    return (
                      <div style={{ marginTop: 6 }}>
                        {resto && <div className="muted" style={{ fontSize: 12 }}>{resto}</div>}
                        {top && (
                          <div style={{ fontSize: 11, color: '#78716c', marginTop: 4, lineHeight: 1.5 }}>
                            <b>Top SKU:</b> {top.replace('TOP: ', '').split(' | ').slice(0, 3).join(' · ')}
                          </div>
                        )}
                      </div>
                    )
                  })()}
                  {open && (
                    <div style={{ marginTop: 10, borderTop: '1px solid #e2e8f0', paddingTop: 8 }}>
                      <div className="muted" style={{ fontSize: 11, marginBottom: 6 }}>
                        Clientes (para actualizar maestra) · toca canal de nuevo para cerrar
                      </div>
                      {detalleCli
                        .filter(d => canalDeCliente(d) === String(g.ejecutivo).toUpperCase().trim())
                        .slice(0, 40)
                        .map(d => (
                          <div
                            key={d.cliente_key}
                            style={{
                              background: cliSel === d.cliente_key ? '#fff7ed' : '#fff',
                              border: cliSel === d.cliente_key ? '1.5px solid #fdba74' : '1px solid #e7e5e4',
                              borderRadius: 12,
                              padding: '10px 12px',
                              marginBottom: 8,
                              boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                            }}
                          >
                            <button
                              type="button"
                              onClick={() => cargarSkuCliente(d.cliente_key)}
                              style={{
                                width: '100%',
                                display: 'flex',
                                justifyContent: 'space-between',
                                fontSize: 12,
                                padding: 0,
                                gap: 8,
                                border: 'none',
                                background: 'none',
                                cursor: 'pointer',
                                textAlign: 'left',
                                fontFamily: 'inherit',
                              }}
                            >
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontWeight: 600, color: '#1c1917' }}>{d.nombre_cliente || d.cliente_key}</div>
                                <div className="muted">
                                  {d.cliente_key} · {d.comuna || '—'}
                                  {cliSel === d.cliente_key ? ' · ▲' : ' · ▼ mix'}
                                </div>
                              </div>
                              <div style={{ fontWeight: 700, whiteSpace: 'nowrap', color: '#c2410c' }}>{money(d.venta_mtd)}</div>
                            </button>
                            {cliSel === d.cliente_key && (
                              <div style={{ padding: '0 0 10px 4px', fontSize: 12 }}>
                                {cliSku[d.cliente_key]?.loading && (
                                  <div className="muted">Cargando mix…</div>
                                )}
                                {cliSku[d.cliente_key]?.oferta && (
                                  <div style={{ background: '#fff7ed', padding: '6px 8px', borderRadius: 8, marginBottom: 6, color: '#9a3412' }}>
                                    <b>Ofrecé:</b> {cliSku[d.cliente_key].oferta}
                                  </div>
                                )}
                                {(cliSku[d.cliente_key]?.skus || []).slice(0, 10).map((s, i) => {
                                  const pct = s.promClp > 0 ? Math.round((s.clpMtd / s.promClp) * 100) : s.clpMtd > 0 ? 100 : 0
                                  const falta = Math.max(0, s.promUd - s.udMtd)
                                  const { recompra, cicloEst, diasUltima } = cicloReposicion(s)
                                  const toneColor = { bad: '#b91c1c', warn: '#b45309', ok: '#15803d', muted: '#57534e' }[recompra?.tone || 'muted']
                                  return (
                                    <div key={i} style={{ padding: '6px 0', borderBottom: '1px solid #f5f5f4' }}>
                                      <div style={{ fontWeight: 600 }}>{s.nombre}</div>
                                      <div className="muted" style={{ fontSize: 11 }}>
                                        Prom {fmtStock(s.promUd)} ud · {money(s.promClp)} → este mes {fmtStock(s.udMtd)} ud · {money(s.clpMtd)} ({pct}%)
                                      </div>
                                      {falta > 0 && (
                                        <div style={{ fontSize: 11, color: '#b45309' }}>Faltan ~{fmtStock(falta)} ud a su ritmo</div>
                                      )}
                                      {(diasUltima != null || cicloEst != null) && (
                                        <div style={{ fontSize: 11, color: toneColor, fontWeight: 600, marginTop: 2 }}>
                                          {diasUltima != null && <span>Última hace {diasUltima}d</span>}
                                          {diasUltima != null && cicloEst != null && ' · '}
                                          {cicloEst != null && <span>Ciclo ~{cicloEst}d</span>}
                                          {recompra && <span> · {recompra.label}</span>}
                                        </div>
                                      )}
                                    </div>
                                  )
                                })}
                                {!cliSku[d.cliente_key]?.loading && !(cliSku[d.cliente_key]?.skus || []).length && (
                                  <div className="muted">Sin sku_detalle en cartera para este cliente.</div>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      {!detalleCli.filter(d => canalDeCliente(d) === String(g.ejecutivo).toUpperCase().trim()).length && (
                        <p className="muted" style={{ fontSize: 12 }}>
                          Sin clientes en este canal. Si acabás de subir el ciclo, verificá columna ejecutivo en gerencia_clientes.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </>
        )}

        {tab === 'productos' && (
          <div className="card">
            <div className="card-label">Foco / productos prioritarios del mes</div>
            <p className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
              Desde stock con foco o con venta del mes. Para ranking real por margen hace falta columna de
              margen en gold.
            </p>
            {!topProd.length && (
              <p className="muted">Sin datos de productos. Corré bajada con stock/focos.</p>
            )}
            {topProd.map((s, i) => (
              <div
                key={s.sku_canon || s.id || i}
                style={{
                  padding: '10px 0',
                  borderBottom: '1px solid #f1f5f9',
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 10,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>
                    {s.producto_nombre || s.sku_canon || 'SKU'}
                  </div>
                  <div className="muted" style={{ fontSize: 11 }}>
                    {s.sku_canon}
                    {s.es_foco || /foco/i.test(s.decision || '') ? ' · FOCO' : ''}
                  </div>
                </div>
                <div style={{ textAlign: 'right', fontSize: 12, whiteSpace: 'nowrap' }}>
                  <div>
                    Stock <b>{fmtStock(s.stock_operativo ?? s.stock)}</b>
                  </div>
                  <div className="muted">
                    Cobertura {s.cobertura_dias != null ? `${fmtStock(s.cobertura_dias)}d` : '—'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'stock' && (
          <div className="card">
            <div className="card-label">Stock lento / sobrestock → candidatos a oferta</div>
            <p className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
              Alta cobertura o decisión de exceso. Ideal para empujar en ruta y cartera.
            </p>
            {!stockLento.length && (
              <p className="muted">No hay candidatos claros a sobrestock. Si cobertura_dias viene vacía en stock, la bajada debe llenarla desde looker_04.</p>
            )}
            {stockLento.map((s, i) => (
              <div
                key={s.sku_canon || i}
                style={{
                  padding: '10px 0',
                  borderBottom: '1px solid #f1f5f9',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 13 }}>{s.producto_nombre || s.sku_canon}</div>
                <div className="muted" style={{ fontSize: 12 }}>
                  Stock {fmtStock(s.stock_operativo)} · Cobertura{' '}
                  {s.cobertura_dias != null ? `${fmtStock(s.cobertura_dias)} días` : '—'} ·{' '}
                  {s.decision || 'sin decisión'}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tendencia */}
        <div className="card" style={{ marginTop: 12 }}>
          <div className="card-label">Tendencia mensual</div>
          <p className="muted" style={{ fontSize: 11, marginBottom: 8 }}>
            Tocá un mes · Año visible: {money(anioVenta)}
          </p>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 140, paddingTop: 8 }}>
            {tendencia.map(t => {
              const val = Number(t.venta_clp) || 0
              const hPx = Math.max(6, Math.round((val / maxMes) * 110))
              const active = mesSel === t.mes
              const isBest = val > 0 && val === maxMes
              const minPos = Math.min(...tendencia.map(x => Number(x.venta_clp) || 0).filter(v => v > 0))
              const isWorst = val > 0 && val === minPos && tendencia.filter(x => Number(x.venta_clp) > 0).length > 1
              let barBg = '#93c5fd'
              if (active) barBg = '#1e3a5f'
              else if (isBest) barBg = '#16a34a'
              else if (isWorst) barBg = '#ef4444'
              else if (!val) barBg = '#e2e8f0'
              return (
                <button
                  key={String(t.mes)}
                  type="button"
                  onClick={() => setMesSel(t.mes === mesSel ? null : t.mes)}
                  style={{
                    flex: 1,
                    height: 140,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    gap: 4,
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                  }}
                >
                  <div
                    style={{
                      width: '100%',
                      height: hPx,
                      background: barBg,
                      borderRadius: 4,
                      minHeight: 4,
                    }}
                  />
                  <span style={{ fontSize: 9, color: isBest ? '#16a34a' : isWorst ? '#ef4444' : '#64748b', fontWeight: isBest || isWorst ? 700 : 400 }}>
                    {mesLabel(t.mes).split(' ')[0]}
                  </span>
                </button>
              )
            })}
          </div>
          {!tendencia.length && (
            <p className="muted" style={{ fontSize: 12 }}>Sin tendencia. Corré la bajada (tabla tendencia).</p>
          )}
          {mesSelRow && (
            <div style={{ marginTop: 12, fontSize: 13 }}>
              <b>{mesLabel(mesSelRow.mes)}</b>: {money(mesSelRow.venta_clp)}
              {mesSelRow.clientes_activos != null && (
                <span className="muted"> · {mesSelRow.clientes_activos} clientes activos</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
