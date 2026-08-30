import { useEffect, useMemo, useState, useCallback } from 'react'
import { ventasRepo, clientesRepo, ejecutivosRepo, stockRepo, catalogoRepo, pedidosRepo } from './data/repositories.js'
import { assignExecutive } from './data/actions.js'
import { summarizeCanales, summarizeClientes, summarizeVentas, buildCliente360, buildOpportunities } from './data/metrics.js'
import { filterRows, uniqueValues } from './data/selectors.js'
import { ControlModules } from './ControlModules.jsx'
import './control-center.css'

const money = (v) => Number(v || 0).toLocaleString('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 })
const pct = (v) => v == null ? '—' : `${(v * 100).toFixed(1)}%`
const label = (v) => v == null || v === '' ? '—' : String(v)

export default function ControlCenter() {
  const [section, setSection] = useState('overview')
  const [filters, setFilters] = useState({ canal: 'all', zona: 'all', ejecutivoId: 'all' })
  const [data, setData] = useState({ ventas: [], clientes: [], ejecutivos: [], stock: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [cliente, setCliente] = useState(null)
  const [clienteKey, setClienteKey] = useState(null)
  const [actionState, setActionState] = useState({ busy: false, message: null, error: null })

  const loadData = useCallback(async () => {
    const [ventas, clientes, ejecutivos, stock] = await Promise.all([ventasRepo.resumen(), clientesRepo.resumen(), ejecutivosRepo.listar(), stockRepo.listar()])
    setData({ ventas, clientes, ejecutivos, stock })
  }, [])

  useEffect(() => {
    let alive = true
    setLoading(true)
    loadData().catch(e => alive && setError(e)).finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [loadData])

  const filteredClientes = useMemo(() => filterRows(data.clientes, filters), [data.clientes, filters])
  const filteredVentas = useMemo(() => filterRows(data.ventas, filters), [data.ventas, filters])
  const resumen = useMemo(() => summarizeVentas(filteredVentas), [filteredVentas])
  const canales = useMemo(() => summarizeCanales(filteredVentas.length ? filteredVentas : filteredClientes), [filteredVentas, filteredClientes])
  const clientes = useMemo(() => summarizeClientes(filteredClientes), [filteredClientes])
  const opportunities = useMemo(() => buildOpportunities(filteredClientes).sort((a,b) => b.oportunidad - a.oportunidad).slice(0, 50), [filteredClientes])
  const zonas = useMemo(() => uniqueValues(data.clientes, ['zona','zona_nombre']), [data.clientes])
  const canalesDisponibles = useMemo(() => uniqueValues(data.clientes, ['canal','canal_nombre','tipo_canal']), [data.clientes])

  const openClient = (row) => {
    const c = buildCliente360(row)
    setCliente(c)
    setClienteKey(c.id ?? row?.cliente_key ?? row?.cliente_id ?? null)
  }

  const bulkAssign = async (clienteKeys, ejecutivoId) => {
    setActionState({ busy: true, message: null, error: null })
    let ok = 0
    try {
      for (const key of clienteKeys) {
        await assignExecutive({ clienteKey: key, ejecutivoId })
        ok += 1
      }
      await loadData()
      setActionState({ busy: false, message: `${ok} cliente${ok === 1 ? '' : 's'} reasignado${ok === 1 ? '' : 's'} correctamente.`, error: null })
    } catch (e) {
      setActionState({ busy: false, message: ok ? `${ok} reasignado${ok === 1 ? '' : 's'} antes del error.` : null, error: e.message || 'No se pudo reasignar la cartera.' })
    }
  }

  const assignFrom360 = async (key, ejecutivoId) => {
    if (!key || !ejecutivoId) return
    setActionState({ busy: true, message: null, error: null })
    try {
      await assignExecutive({ clienteKey: key, ejecutivoId })
      await loadData()
      setActionState({ busy: false, message: 'Ejecutivo reasignado correctamente.', error: null })
      setCliente(prev => prev ? { ...prev, ejecutivo: data.ejecutivos.find(e => String(e.id) === String(ejecutivoId))?.nombre || prev.ejecutivo } : prev)
    } catch (e) {
      setActionState({ busy: false, message: null, error: e.message || 'No se pudo reasignar el ejecutivo.' })
    }
  }

  if (loading) return <main className="cc"><div className="cc-loading">Cargando Control Center…</div></main>
  if (error) return <main className="cc"><div className="cc-error"><strong>No se pudo cargar el Control Center.</strong><span>{error.message || 'Error de datos'}</span></div></main>

  const nav = [['overview','Overview'],['ventas','Ventas'],['ejecutivos','Ejecutivos'],['clientes','Clientes'],['productos','Productos'],['stock','Stock'],['metas','Metas'],['focos','Focos'],['alertas','Alertas'],['oportunidades','Oportunidades']]

  return <main className="cc">
    <aside className="cc-sidebar"><div className="cc-brand">BLACK SHEEP</div><div className="cc-subtitle">CONTROL CENTER</div><nav>{nav.map(([id,name]) => <button className={section === id ? 'active' : ''} key={id} onClick={() => setSection(id)}>{name}</button>)}</nav><div className="cc-side-foot">V13.0 · Management</div></aside>
    <div className="cc-workspace">
      <header className="cc-topbar"><div><div className="cc-eyebrow">AGOSTO 2026</div><h1>{nav.find(x => x[0] === section)?.[1] || 'Overview'}</h1></div><div className="cc-status"><span className="cc-dot" /> ONLINE</div></header>
      <div className="cc-filters"><select value={filters.zona} onChange={e => setFilters(f => ({ ...f, zona: e.target.value }))}><option value="all">Todas las zonas</option>{zonas.map(x => <option key={x}>{x}</option>)}</select><select value={filters.canal} onChange={e => setFilters(f => ({ ...f, canal: e.target.value }))}><option value="all">Todos los canales</option>{canalesDisponibles.map(x => <option key={x}>{x}</option>)}</select><select value={filters.ejecutivoId} onChange={e => setFilters(f => ({ ...f, ejecutivoId: e.target.value }))}><option value="all">Todos los ejecutivos</option>{data.ejecutivos.map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select><button onClick={() => setFilters({ canal:'all', zona:'all', ejecutivoId:'all' })}>Limpiar</button></div>
      {actionState.message && <div className="cc-toast">{actionState.message}</div>}{actionState.error && <div className="cc-toast cc-toast-error">{actionState.error}</div>}
      <section className="cc-kpis"><article><span>VENTA MTD</span><strong>{money(resumen.ventaMtd)}</strong></article><article><span>META MTD</span><strong>{resumen.meta ? money(resumen.meta) : '—'}</strong></article><article><span>CUMPLIMIENTO</span><strong>{pct(resumen.cumplimiento)}</strong></article><article><span>CLIENTES</span><strong>{clientes.total.toLocaleString('es-CL')}</strong></article></section>
      {section === 'overview' && <Overview canales={canales} clientes={clientes} stock={data.stock} opportunities={opportunities} onClient={openClient} />}
      {section === 'ventas' && <SimpleTable title="Ventas por canal" rows={canales} columns={['canal','venta','cumplimiento']} moneyKeys={['venta']} />}
      {section === 'clientes' && <ClientTable rows={filteredClientes} onClient={openClient} />}
      {section === 'oportunidades' && <OpportunityTable rows={opportunities} onClient={openClient} />}
      {['ejecutivos','productos','stock','metas','focos','alertas'].includes(section) && <ControlModules section={section} ventas={filteredVentas} clientes={filteredClientes} ejecutivos={data.ejecutivos} stock={data.stock} opportunities={opportunities} onClient={openClient} onBulkAssign={bulkAssign} />}
    </div>
    {cliente && <Client360 cliente={cliente} clienteKey={clienteKey} ejecutivos={data.ejecutivos} busy={actionState.busy} onAssign={assignFrom360} onClose={() => { setCliente(null); setClienteKey(null) }} />}
  </main>
}

function Overview({ canales, clientes, stock, opportunities, onClient }) { return <div className="cc-content-grid"><article className="cc-panel cc-span-2"><div className="cc-panel-head"><h2>Pulso comercial</h2><span>MTD</span></div>{canales.length ? <div className="cc-bars">{canales.map(c => <div className="cc-bar-row" key={c.canal}><span>{c.canal}</span><div><i style={{ width: `${Math.min(100, c.venta / Math.max(1, canales[0].venta) * 100)}%` }} /></div><b>{money(c.venta)}</b></div>) : <p className="cc-empty">Sin datos de canal.</p>}</article><article className="cc-panel"><div className="cc-panel-head"><h2>Alertas</h2></div><div className="cc-alerts"><b>{clientes.altoRiesgo}</b><span>clientes en riesgo alto</span><b>{clientes.bloqueados}</b><span>clientes bloqueados</span><b>{clientes.sinCompra}</b><span>sin compra MTD</span></div></article><article className="cc-panel cc-span-2"><div className="cc-panel-head"><h2>Oportunidades</h2><span>Top 15</span></div><OpportunityTable rows={opportunities.slice(0,8)} onClient={onClient} /></article><article className="cc-panel"><div className="cc-panel-head"><h2>Stock</h2></div><p className="cc-big">{stock.length.toLocaleString('es-CL')}</p><p className="cc-muted">registros</p></article></div> }
function SimpleTable({ title, rows, columns, moneyKeys=[] }) { return <article className="cc-panel cc-full"><div className="cc-panel-head"><h2>{title}</h2><span>{rows.length}</span></div><div className="cc-table cc-data-table"><div className="cc-row cc-head">{columns.map(c => <span key={c}>{c}</span>)}</div>{rows.map((r,i) => <div className="cc-row" key={r.id ?? i}>{columns.map(c => <span key={c}>{moneyKeys.includes(c) ? money(r[c]) : label(r[c])}</span>)}</div>)}</div></article> }
function ClientTable({ rows, onClient }) { return <article className="cc-panel cc-full"><div className="cc-panel-head"><h2>Clientes</h2><span>{rows.length}</span></div><div className="cc-table"><div className="cc-row cc-head"><span>Cliente</span><span>Venta MTD</span><span>Riesgo</span><span>Zona</span></div>{rows.slice(0,100).map(c => <button className="cc-row cc-click" key={c.cliente_key ?? c.id} onClick={() => onClient(c)}><span>{label(c.nombre_cliente ?? c.nombre ?? c.cliente_key)}</span><span>{money(c.venta_mtd)}</span><span>{label(c.estado_fuga ?? c.riesgo)}</span><span>{label(c.zona)}</span></button>)}</div></article> }
function OpportunityTable({ rows, onClient }) { return <div className="cc-table"><div className="cc-row cc-head"><span>Cliente</span><span>Oportunidad</span><span>Riesgo</span><span>Sin compra</span></div>{rows.map((c,i) => <button className="cc-row cc-click" key={c.id ?? i} onClick={() => onClient(c)}><span>{c.nombre}</span><span>{money(c.oportunidad)}</span><span>{label(c.prioridad)}</span><span>{c.diasSinComprar ? `${c.diasSinComprar} días` : '—'}</span></button>)}</div> }

function Client360({ cliente, clienteKey, ejecutivos, busy, onAssign, onClose }) {
  const [tab, setTab] = useState('resumen')
  const [mix, setMix] = useState([])
  const [historial, setHistorial] = useState([])
  const [catalogo, setCatalogo] = useState([])
  const [pedidos, setPedidos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedExecutive, setSelectedExecutive] = useState('')
  const [showAssign, setShowAssign] = useState(false)

  useEffect(() => {
    if (!clienteKey) { setLoading(false); return }
    let alive = true
    setLoading(true)
    Promise.allSettled([clientesRepo.mix(clienteKey), clientesRepo.historial(clienteKey), catalogoRepo.cliente(clienteKey), pedidosRepo.cliente(clienteKey)])
      .then(results => { if (!alive) return; const values = results.map(r => r.status === 'fulfilled' ? r.value : []); setMix(values[0]); setHistorial(values[1]); setCatalogo(values[2]); setPedidos(values[3]); if (results.some(r => r.status === 'rejected')) setError('Algunos módulos del cliente no están disponibles.') })
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [clienteKey])

  const productTotals = useMemo(() => { const m = new Map(); for (const r of mix) { const key = r.sku_canon || r.producto_nombre || 'Producto'; const x = m.get(key) || { nombre: r.producto_nombre || key, cantidad: 0, venta: 0 }; x.cantidad += Number(r.cantidad || 0); x.venta += Number(r.venta_neta_clp || 0); m.set(key, x) } return [...m.values()].sort((a,b)=>b.venta-a.venta).slice(0,20) }, [mix])

  const confirmAssign = async () => {
    if (!selectedExecutive || !clienteKey) return
    await onAssign(clienteKey, selectedExecutive)
    setShowAssign(false)
  }

  return <div className="cc-modal" role="dialog" aria-modal="true"><div className="cc-modal-card"><button className="cc-close" onClick={onClose}>×</button><div className="cc-subtitle">CLIENTE 360</div><h2>{cliente.nombre}</h2><div className="cc-detail-grid"><div><span>VENTA MTD</span><b>{money(cliente.ventaMtd)}</b></div><div><span>PROMEDIO</span><b>{money(cliente.promedioMensual)}</b></div><div><span>VARIACIÓN</span><b>{pct(cliente.variacion)}</b></div><div><span>RIESGO</span><b>{label(cliente.riesgo)}</b></div><div><span>SIN COMPRA</span><b>{cliente.diasSinComprar ? `${cliente.diasSinComprar} días` : '—'}</b></div><div><span>CANAL</span><b>{label(cliente.canal)}</b></div><div><span>EJECUTIVO</span><b>{label(cliente.ejecutivo)}</b></div><div><span>ZONA</span><b>{label(cliente.zona)}</b></div></div><div className="cc-tabs">{[['resumen','Resumen'],['mix','Mix'],['historial','Historial'],['catalogo','Catálogo B2B'],['pedidos','Pedidos']].map(([id,name])=><button className={tab===id?'active':''} key={id} onClick={()=>setTab(id)}>{name}</button>)}</div>{loading ? <p className="cc-empty">Cargando información del cliente…</p> : error && <p className="cc-empty">{error}</p>}{tab==='resumen' && <div className="cc-detail-section"><h3>Oportunidad comercial</h3><p>Usa el riesgo, frecuencia y mix para priorizar la siguiente acción comercial.</p><div className="cc-actions"><button onClick={() => setTab('catalogo')}>Ver catálogo</button><button onClick={() => setTab('pedidos')}>Ver pedidos</button><button onClick={() => setShowAssign(true)}>Asignar ejecutivo</button><button disabled>Crear acción</button></div>{showAssign && <div className="cc-inline-action"><span>Nuevo ejecutivo</span><select value={selectedExecutive} onChange={e => setSelectedExecutive(e.target.value)} disabled={busy}><option value="">Seleccionar…</option>{ejecutivos.map(e => <option key={e.id} value={e.id}>{e.nombre} · {label(e.zona)}</option>)}</select><button onClick={confirmAssign} disabled={busy || !selectedExecutive}>{busy ? 'Guardando…' : 'Confirmar reasignación'}</button><button onClick={() => setShowAssign(false)} disabled={busy}>Cancelar</button></div>}</div>}{tab==='mix' && <Table heads={['Producto','Cantidad','Venta','SKU']} rows={productTotals.map((r,i)=><div className="cc-row" key={i}><span>{r.nombre}</span><span>{r.cantidad.toLocaleString('es-CL')}</span><span>{money(r.venta)}</span><span>—</span></div>)} />}{tab==='historial' && <Table heads={['Fecha','Producto','Cantidad','Venta']} rows={historial.slice(0,80).map((r,i)=><div className="cc-row" key={i}><span>{label(r.fecha)}</span><span>{label(r.producto_nombre || r.sku_canon)}</span><span>{label(r.cantidad)}</span><span>{money(r.venta_neta_clp)}</span></div>)} />}{tab==='catalogo' && <Table heads={['Producto','Precio','Stock','Estado']} rows={catalogo.slice(0,100).map((r,i)=><div className="cc-row" key={i}><span>{label(r.producto_nombre || r.nombre || r.sku)}</span><span>{money(r.precio_cliente ?? r.precio)}</span><span>{label(r.stock ?? r.stock_disponible)}</span><span>{label(r.estado)}</span></div>)} />}{tab==='pedidos' && <Table heads={['Pedido','Fecha','Estado','Total']} rows={pedidos.slice(0,80).map((r,i)=><div className="cc-row" key={i}><span>{label(r.numero_pedido || r.id || r.codigo)}</span><span>{label(r.created_at || r.fecha)}</span><span>{label(r.estado || r.status)}</span><span>{money(r.total || r.total_clp)}</span></div>)} /></div></div>
}

function Table({ heads, rows }) { return <div className="cc-table"><div className="cc-row cc-head">{heads.map(h=><span key={h}>{h}</span>)}</div>{rows.length ? rows : <div className="cc-empty">Sin datos disponibles.</div>}</div> }
