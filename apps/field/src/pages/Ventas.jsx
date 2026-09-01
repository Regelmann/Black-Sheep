import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { money } from '../components.jsx'
import PageShell from '../shells/PageShell.jsx'
import { DataEmpty } from '../ui/DataState.jsx'

function n(v) { const x = Number(v); return Number.isFinite(x) ? x : 0 }
function fmtKg(v) { return `${Math.round(n(v)).toLocaleString('es-CL')} kg` }
function pct(v) { return v == null || !Number.isFinite(Number(v)) ? '—' : `${Number(v).toFixed(1)}%` }
function deltaPct(current, previous) {
  const c = n(current), p = n(previous)
  if (!p) return null
  return ((c - p) / Math.abs(p)) * 100
}
function fmtDelta(v) {
  if (v == null || !Number.isFinite(v)) return '—'
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`
}

const tabs = [
  ['resumen', 'Resumen'],
  ['pedidos', 'Pedidos'],
  ['pendientes', 'Pendientes'],
  ['clientes', 'Clientes'],
  ['productos', 'Productos'],
  ['vendedores', 'Vendedores'],
  ['calidad', 'Calidad'],
]

export default function Ventas() {
  const [tab, setTab] = useState('resumen')
  const [months, setMonths] = useState([])
  const [clients, setClients] = useState([])
  const [products, setProducts] = useState([])
  const [orders, setOrders] = useState([])
  const [pending, setPending] = useState([])
  const [sellers, setSellers] = useState([])
  const [quality, setQuality] = useState(null)
  const [selectedMonth, setSelectedMonth] = useState('')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  async function load() {
    setLoading(true)
    setError(null)
    const qs = [
      supabase.from('v_ventas_resumen_mensual').select('*').order('mes', { ascending: false }).limit(24),
      supabase.from('v_ventas_cliente').select('*').order('venta_neta_real', { ascending: false }).limit(200),
      supabase.from('v_ventas_producto').select('*').order('venta_neta_real', { ascending: false }).limit(200),
      supabase.from('v_ventas_pedido_factura').select('*').order('fecha_digitacion', { ascending: false }).limit(300),
      supabase.from('v_ventas_pedidos_pendientes').select('*').order('fecha_entrega_solicitada', { ascending: true }).limit(300),
      supabase.from('v_ventas_vendedor').select('*').order('venta_neta_real', { ascending: false }).limit(100),
      supabase.from('v_ventas_calidad').select('*').maybeSingle(),
    ]
    const rs = await Promise.all(qs)
    const bad = rs.find(r => r.error)
    if (bad?.error) {
      setError({ user: bad.error.message || 'No se pudo leer el modelo de ventas.' })
      setLoading(false)
      return
    }
    const m = rs[0].data || []
    setMonths(m)
    setClients(rs[1].data || [])
    setProducts(rs[2].data || [])
    setOrders(rs[3].data || [])
    setPending(rs[4].data || [])
    setSellers(rs[5].data || [])
    setQuality(rs[6].data || null)
    setSelectedMonth(prev => prev || m[0]?.mes || '')
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const selectedIndex = Math.max(0, months.findIndex(r => r.mes === selectedMonth))
  const selected = months[selectedIndex] || months[0] || {}
  const previous = months[selectedIndex + 1] || {}

  const totals = useMemo(() => ({
    pedido: n(selected.pedido_neto),
    factura: n(selected.facturado_neto),
    nc: n(selected.nc_neto),
    neta: n(selected.venta_neta_real),
    kgPedido: n(selected.kg_pedido),
    kg: n(selected.kg_facturados),
    fill: selected.fill_rate_kg,
  }), [selected])

  const filteredClients = useMemo(() => filterRows(clients, query, ['nombre_cliente', 'cliente_master_key']), [clients, query])
  const filteredProducts = useMemo(() => filterRows(products, query, ['producto', 'producto_master_key']), [products, query])
  const filteredOrders = useMemo(() => filterRows(orders, query, ['num_pedido', 'folio_factura', 'folio_nc', 'vendedor', 'cliente_master_key']), [orders, query])
  const filteredPending = useMemo(() => filterRows(pending, query, ['num_pedido', 'vendedor', 'cliente_master_key']), [pending, query])
  const filteredSellers = useMemo(() => filterRows(sellers, query, ['vendedor']), [sellers, query])

  const stats = (
    <div className="bs-statgrid" style={{ '--sg-cols': 4 }} aria-label={`Indicadores de ${selected.mes || 'ventas'}`}>
      <Kpi label="Venta neta" value={money(totals.neta)} delta={deltaPct(totals.neta, previous.venta_neta_real)} />
      <Kpi label="Facturado" value={money(totals.factura)} delta={deltaPct(totals.factura, previous.facturado_neto)} />
      <Kpi label="NC" value={money(totals.nc)} delta={deltaPct(totals.nc, previous.nc_neto)} inverse />
      <Kpi label="Fill Rate" value={pct(totals.fill)} />
      <Kpi label="Kg pedidos" value={fmtKg(totals.kgPedido)} />
      <Kpi label="Kg facturados" value={fmtKg(totals.kg)} />
      <Kpi label="Pedidos pendientes" value={pending.length.toLocaleString('es-CL')} />
      <Kpi label="Clientes" value={n(selected.clientes_facturados).toLocaleString('es-CL')} />
    </div>
  )

  const controls = (
    <div className="bs-filterbar" aria-label="Filtros de ventas">
      <label className="bs-filterbar-label" htmlFor="ventas-month">Periodo</label>
      <select id="ventas-month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} aria-label="Periodo de ventas">
        {months.map(r => <option key={r.mes} value={r.mes}>{r.mes}</option>)}
      </select>
      <input className="bs-search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar cliente, producto, pedido o vendedor…" aria-label="Buscar en ventas" />
      {query && <button type="button" className="bs-chip" onClick={() => setQuery('')}>Limpiar</button>}
    </div>
  )

  const body = <>
    <nav className="bs-filterbar" role="tablist" aria-label="Secciones de ventas" style={{ overflowX: 'auto' }}>
      {tabs.map(([id, label]) => <button key={id} type="button" className={tab === id ? 'bs-chip is-on' : 'bs-chip'} onClick={() => setTab(id)} role="tab" aria-selected={tab === id}>{label}</button>)}
    </nav>
    {tab === 'resumen' && <Summary months={months} selected={selected} clients={clients} products={products} sellers={sellers} />}
    {tab === 'pedidos' && <OrdersTable rows={filteredOrders} />}
    {tab === 'pendientes' && <PendingTable rows={filteredPending} />}
    {tab === 'clientes' && <RankingTable title="Clientes" rows={filteredClients} name="nombre_cliente" />}
    {tab === 'productos' && <RankingTable title="Productos" rows={filteredProducts} name="producto" />}
    {tab === 'vendedores' && <RankingTable title="Vendedores" rows={filteredSellers} name="vendedor" />}
    {tab === 'calidad' && <Quality quality={quality} />}
  </>

  return <PageShell
    eyebrow="VENTAS · CICLO ÚNICO"
    titulo="Pedido → Factura → NC → Venta neta"
    subtitulo="Una sola lectura para saber qué pasó, qué cambió y dónde actuar."
    sello={selected.mes ? `Periodo ${selected.mes}` : null}
    stats={stats}
    filtros={controls}
    loading={loading}
    error={error}
    onRetry={load}
    vacio={!months.length}
    vacioTitulo="Sin datos de ventas"
    vacioDesc="Carga el histórico o el archivo operativo y vuelve a ejecutar el Ciclo Único."
  >{body}</PageShell>
}

function Kpi({ label, value, delta, inverse = false }) {
  const good = delta == null ? '' : ((delta >= 0) !== inverse ? 'is-positive' : 'is-negative')
  return <div className="bs-stat" role="listitem"><span className="bs-stat-label">{label}</span><strong className="bs-stat-value">{value}</strong>{delta != null && <span className={`bs-stat-delta ${good}`}>{fmtDelta(delta)} vs mes anterior</span>}</div>
}

function Summary({ months, selected, clients, products, sellers }) {
  const max = Math.max(...months.map(r => n(r.venta_neta_real)), 1)
  return <>
    <section className="bs-card" style={{ marginBottom: 12 }}>
      <div className="bs-section-head"><div><span className="bs-kicker">TENDENCIA</span><h2>Venta neta mensual</h2></div><span className="muted">Últimos 24 meses</span></div>
      <div className="bs-mini-bars" aria-label="Tendencia de venta neta">
        {[...months].reverse().map(r => <div className="bs-mini-bar" key={r.mes} title={`${r.mes}: ${money(r.venta_neta_real)}`}><div className="bs-mini-bar-fill" style={{ height: `${Math.max(4, (n(r.venta_neta_real) / max) * 100)}%` }} /><span>{String(r.mes).slice(5, 7)}</span></div>)}
      </div>
    </section>
    <div className="bs-report-grid">
      <RankTable title="Top clientes" rows={clients.slice(0, 10)} name="nombre_cliente" />
      <RankTable title="Top productos" rows={products.slice(0, 10)} name="producto" />
      <RankTable title="Top vendedores" rows={sellers.slice(0, 10)} name="vendedor" />
    </div>
    {!months.length && <DataEmpty title="Sin datos de ventas" desc="Carga el histórico o el archivo operativo y vuelve a ejecutar el Ciclo Único." />}
  </>
}

function OrdersTable({ rows }) {
  return <TableCard title="Pedido → Factura → NC" desc="El pedido no se suma como venta. Sirve para medir cumplimiento y Fill Rate."><table><thead><tr><th>Pedido</th><th>Factura</th><th>NC</th><th>Estado</th><th>Entrega</th><th>Kg pedido</th><th>Kg fact.</th><th>Fill</th><th>Vendedor</th><th>Neto</th></tr></thead><tbody>{rows.map((r, i) => <tr key={String(r.documento_key || i)}><td>{r.num_pedido || '—'}</td><td>{r.folio_factura || '—'}</td><td>{r.folio_nc || '—'}</td><td>{r.estado_pedido || '—'}</td><td>{r.fecha_entrega_solicitada || '—'}</td><td>{fmtKg(r.kg_pedido)}</td><td>{fmtKg(r.kg_facturados)}</td><td>{pct(r.fill_rate_kg)}</td><td>{r.vendedor || '—'}</td><td><strong>{money(r.venta_neta_real)}</strong></td></tr>)}</tbody></table></TableCard>
}

function PendingTable({ rows }) {
  return <TableCard title="Pedidos pendientes" desc="Pedidos sin factura ni NC, ordenados por fecha de entrega solicitada."><table><thead><tr><th>Pedido</th><th>Cliente</th><th>Entrega</th><th>Vendedor</th><th>Kg pedido</th><th>Neto pedido</th><th>Estado</th></tr></thead><tbody>{rows.map((r, i) => <tr key={String(r.documento_key || i)}><td>{r.num_pedido || '—'}</td><td>{r.cliente_master_key || '—'}</td><td>{r.fecha_entrega_solicitada || '—'}</td><td>{r.vendedor || '—'}</td><td>{fmtKg(r.kg_pedido)}</td><td>{money(r.pedido_neto)}</td><td>{r.estado_pedido || '—'}</td></tr>)}</tbody></table></TableCard>
}

function RankingTable({ title, rows, name }) {
  const cols = [['Pedido', 'pedido_neto'], ['Facturado', 'facturado_neto'], ['NC', 'nc_neto'], ['Venta neta', 'venta_neta_real'], ['Kg pedido', 'kg_pedido'], ['Kg fact.', 'kg_facturados'], ['Fill', 'fill_rate_kg']]
  return <TableCard title={title} desc="Ordenado por venta neta real."><table><thead><tr><th>{title.slice(0, -1)}</th>{cols.map(([l]) => <th key={l}>{l}</th>)}</tr></thead><tbody>{rows.map((r, i) => <tr key={String(r.cliente_master_key || r.producto_master_key || r.vendedor || i)}><td><strong>{r[name] || '—'}</strong></td>{cols.map(([l, k]) => <td key={k}>{['pedido_neto', 'facturado_neto', 'nc_neto', 'venta_neta_real'].includes(k) ? money(r[k]) : ['kg_pedido', 'kg_facturados'].includes(k) ? fmtKg(r[k]) : pct(r[k])}</td>)}</tr>)}</tbody></table></TableCard>
}

function Quality({ quality }) {
  const cards = [['Hechos operativos', quality?.hechos_operativos], ['Pedidos', quality?.pedidos], ['Facturas', quality?.facturas], ['NC', quality?.notas_credito], ['Documentos', quality?.documentos], ['Clientes sin conciliar', quality?.clientes_sin_conciliar], ['Productos sin conciliar', quality?.productos_sin_conciliar]]
  return <section><div className="bs-card" style={{ marginBottom: 12 }}><span className="bs-kicker">CONFIANZA DE DATOS</span><h2>Calidad de integración</h2><p className="muted">Este panel no oculta errores de carga: muestra dónde revisar antes de tomar una decisión.</p></div><div className="bs-statgrid" style={{ '--sg-cols': 4 }}>{cards.map(([l, v]) => <div className="bs-stat" key={l}><span className="bs-stat-label">{l}</span><strong className="bs-stat-value">{n(v).toLocaleString('es-CL')}</strong></div>)}</div></section>
}

function TableCard({ title, desc, children }) {
  return <section className="bs-card bs-table-card"><div className="bs-section-head"><div><h2>{title}</h2>{desc && <p className="muted">{desc}</p>}</div></div><div className="bs-table-scroll">{children}</div></section>
}

function filterRows(rows, query, fields) {
  const q = String(query || '').trim().toLowerCase()
  if (!q) return rows
  return rows.filter(row => fields.some(field => String(row?.[field] ?? '').toLowerCase().includes(q)))
}
