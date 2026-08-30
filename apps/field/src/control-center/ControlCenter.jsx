import { useEffect, useState } from 'react'
import { catalogPerformanceRepo } from './data/repositories.js'

const money = v => Number(v || 0).toLocaleString('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 })
const pct = v => v == null ? '—' : `${(Number(v) * 100).toFixed(1)}%`
const label = v => v == null || v === '' ? '—' : String(v)

function B2BPerformance({ data, loading, onRefresh }) {
  return <section className="cc-b2b-performance"><div className="cc-section-head"><div><span className="cc-subtitle">CANAL B2B</span><h2>Performance del catálogo</h2></div><button onClick={onRefresh} disabled={loading}>{loading ? 'Actualizando…' : 'Actualizar'}</button></div><div className="cc-kpis"><div><span>CATÁLOGOS ACTIVOS</span><b>{data ? data.activeCatalogs.toLocaleString('es-CL') : '—'}</b></div><div><span>PEDIDOS</span><b>{data ? data.orders.toLocaleString('es-CL') : '—'}</b></div><div><span>CLIENTES COMPRADORES</span><b>{data ? data.orderingClients.toLocaleString('es-CL') : '—'}</b></div><div><span>VENTA</span><b>{data ? money(data.sales) : '—'}</b></div><div><span>TICKET PROMEDIO</span><b>{data ? money(data.avgTicket) : '—'}</b></div><div><span>RECOMPRA</span><b>{data ? pct(data.repurchaseRate) : '—'}</b></div><div><span>CLIENTES RECUPERADOS</span><b>{data ? data.recoveredClients.toLocaleString('es-CL') : '—'}</b></div></div><div className="cc-b2b-status"><span>{data ? `${data.completedOrders} pedidos efectivos · ${data.pendingOrders} pendientes` : 'Cargando métricas…'}</span><span>{data?.source ? `Fuente: ${data.source}` : ''}</span></div></section>}

function RiskQueue({ rows, loading, onRefresh, onOpen }) {
  return <section className="cc-risk-queue"><div className="cc-section-head"><div><span className="cc-subtitle">ACCIÓN GERENCIAL</span><h2>Clientes en riesgo</h2><p>Prioridad comercial basada en riesgo, días sin compra y caída de venta.</p></div><button onClick={onRefresh} disabled={loading}>{loading ? 'Actualizando…' : 'Actualizar'}</button></div>{rows.length ? <><div className="cc-risk-table"><div className="cc-risk-head"><span>CLIENTE</span><span>EJECUTIVO</span><span>RIESGO</span><span>SIN COMPRA</span><span>VENTA MTD</span><span>VARIACIÓN</span><span>ACCIÓN</span></div>{rows.map((c,i)=><div className="cc-risk-row" key={c.id || c.cliente_key || i}><span><b>{label(c.nombre || c.razon_social)}</b><small>{label(c.cliente_key || c.rut)}</small></span><span>{label(c.ejecutivo || c.ejecutivo_nombre)}</span><span>{label(c.riesgo)}</span><span>{Number(c.dias_sin_comprar ?? c.diasSinComprar ?? 0).toLocaleString('es-CL')} días</span><span>{money(c.venta_mtd ?? c.ventaMtd)}</span><span>{pct(c.variacion ?? c.variacion_mtd)}</span><button onClick={()=>onOpen(c)}>Ver 360°</button></div>)}</div><div className="cc-risk-footer"><b>{rows.length}</b> clientes requieren revisión <span>Seleccionar / asignar / crear acción en el siguiente nivel.</span></div></> : <div className="cc-empty">No hay clientes que cumplan los criterios actuales de riesgo.</div>}</section>}

export default function ControlCenter(){
  const [performance,setPerformance]=useState(null)
  const [performanceLoading,setPerformanceLoading]=useState(true)
  const [risks,setRisks]=useState([])
  const [riskLoading,setRiskLoading]=useState(true)
  const loadPerformance=async()=>{setPerformanceLoading(true);try{setPerformance(await catalogPerformanceRepo.resumen())}catch(_){setPerformance(null)}finally{setPerformanceLoading(false)}}
  const loadRisks=async()=>{setRiskLoading(true);try{setRisks(await catalogPerformanceRepo.riskQueue())}catch(_){setRisks([])}finally{setRiskLoading(false)}}
  useEffect(()=>{loadPerformance();loadRisks()},[])
  return <main className="control-center"><B2BPerformance data={performance} loading={performanceLoading} onRefresh={loadPerformance}/><RiskQueue rows={risks} loading={riskLoading} onRefresh={loadRisks} onOpen={()=>{}}/><div className="cc-main-content"><h1>Control Center</h1><p>Decidir y administrar con datos comerciales conectados.</p></div></main>
}
