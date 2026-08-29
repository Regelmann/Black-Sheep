import { useEffect, useMemo, useState } from 'react'
import { ventasRepo, clientesRepo, ejecutivosRepo, stockRepo } from './data/repositories.js'
import { summarizeCanales, summarizeClientes, summarizeVentas, buildCliente360 } from './data/metrics.js'
import './control-center.css'

const money = (v) => Number(v || 0).toLocaleString('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 })
const pct = (v) => v == null ? '—' : `${(v * 100).toFixed(1)}%`

export default function ControlCenter() {
  const [data, setData] = useState({ ventas: [], clientes: [], ejecutivos: [], stock: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [cliente, setCliente] = useState(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true); setError(null)
      try {
        const [ventas, clientes, ejecutivos, stock] = await Promise.all([
          ventasRepo.resumen(),
          clientesRepo.resumen(),
          ejecutivosRepo.listar(),
          stockRepo.listar(),
        ])
        if (alive) setData({ ventas, clientes, ejecutivos, stock })
      } catch (e) {
        if (alive) setError(e)
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [])

  const resumen = useMemo(() => summarizeVentas(data.ventas), [data.ventas])
  const canales = useMemo(() => summarizeCanales(data.ventas.length ? data.ventas : data.clientes), [data.ventas, data.clientes])
  const clientes = useMemo(() => summarizeClientes(data.clientes), [data.clientes])

  if (loading) return <main className="cc"><div className="cc-loading">Cargando Control Center…</div></main>
  if (error) return <main className="cc"><div className="cc-error"><strong>No se pudo cargar el Control Center.</strong><span>{error.message || 'Error de datos'}</span></div></main>

  return (
    <main className="cc">
      <header className="cc-topbar">
        <div><div className="cc-brand">BLACK SHEEP</div><div className="cc-subtitle">CONTROL CENTER</div></div>
        <div className="cc-status"><span className="cc-dot" /> ONLINE</div>
      </header>

      <section className="cc-grid cc-kpis">
        <article><span>VENTA MTD</span><strong>{money(resumen.ventaMtd)}</strong></article>
        <article><span>META MTD</span><strong>{resumen.meta ? money(resumen.meta) : '—'}</strong></article>
        <article><span>CUMPLIMIENTO</span><strong>{pct(resumen.cumplimiento)}</strong></article>
        <article><span>CLIENTES</span><strong>{clientes.total.toLocaleString('es-CL')}</strong></article>
      </section>

      <section className="cc-grid cc-main">
        <article className="cc-panel cc-wide">
          <div className="cc-panel-head"><h2>Pulso comercial</h2><span>MTD</span></div>
          {canales.length ? <div className="cc-bars">{canales.map(c => <div className="cc-bar-row" key={c.canal}>
            <span>{c.canal}</span><div><i style={{ width: `${Math.min(100, c.venta / Math.max(1, canales[0].venta) * 100)}%` }} /></div><b>{money(c.venta)}</b>
          </div>)}</div> : <p className="cc-empty">Sin datos de canal.</p>}
        </article>

        <article className="cc-panel">
          <div className="cc-panel-head"><h2>Clientes</h2></div>
          <div className="cc-stats"><div><b>{clientes.altoRiesgo}</b><span>riesgo alto</span></div><div><b>{clientes.bloqueados}</b><span>bloqueados</span></div><div><b>{clientes.sinCompra}</b><span>sin compra</span></div></div>
        </article>

        <article className="cc-panel cc-wide">
          <div className="cc-panel-head"><h2>Clientes prioritarios</h2><span>{data.clientes.length}</span></div>
          <div className="cc-table">{data.clientes.slice(0, 12).map(c => <button key={c.cliente_key ?? c.id} onClick={() => setCliente(buildCliente360(c))}>
            <span>{c.nombre_cliente ?? c.nombre ?? c.cliente_key}</span><span>{money(c.venta_mtd)}</span><span>{c.estado_fuga ?? '—'}</span>
          </button>)}</div>
        </article>

        <article className="cc-panel">
          <div className="cc-panel-head"><h2>Stock</h2></div>
          <p className="cc-big">{data.stock.length.toLocaleString('es-CL')}</p><p className="cc-muted">registros disponibles</p>
        </article>
      </section>

      {cliente && <div className="cc-modal" role="dialog" aria-modal="true">
        <div className="cc-modal-card"><button className="cc-close" onClick={() => setCliente(null)}>×</button>
          <div className="cc-subtitle">CLIENTE 360</div><h2>{cliente.nombre}</h2>
          <div className="cc-detail-grid"><div><span>VENTA MTD</span><b>{money(cliente.ventaMtd)}</b></div><div><span>PROMEDIO</span><b>{money(cliente.promedioMensual)}</b></div><div><span>VARIACIÓN</span><b>{pct(cliente.variacion)}</b></div><div><span>RIESGO</span><b>{cliente.riesgo || '—'}</b></div></div>
          <div className="cc-actions"><button>Asignar ejecutivo</button><button>Ver catálogo</button><button>Ver pedidos</button><button>Crear acción</button></div>
        </div>
      </div>}
    </main>
  )
}
