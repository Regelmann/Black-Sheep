import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import PedidoSheet from '../domain/PedidoSheet.jsx'
import HistorialPedidos from '../domain/HistorialPedidos.jsx'
import OfertaClienteSheet from '../domain/OfertaClienteSheet.jsx'
import Customer360Sheet from '../domain/Customer360Sheet.jsx'
import { saveOfflineSnapshot, loadOfflineSnapshot, isProbablyOffline } from '../lib/offline.js'
import { FilterBar, SearchField, StatGrid } from '../domain/FilterBar.jsx'
import { ClientActionBar } from '../domain/ClientActionBar.jsx'
import { PageShell } from '../shells/PageShell.jsx'
import NotaModal from '../domain/NotaModal.jsx'
import { money, DataAsOfBanner } from '../components.jsx'
import { useEjecutivo } from '../App.jsx'
import { ZoneChip } from '../domain/ZonePicker.jsx'
import { parseSkuDetalle, pctRitmo, clpEfectivo } from '../lib/coach.js'
import { decideClient } from '../lib/decisionEngine.js'
import {
  esActivoMes,
  esNuevoMes,
  esRecuperadoMes,
  cicloReposicion,
  skusAReponer,
  clienteTocaReponer,
  computeConsistentMetrics,
} from '../lib/metrics.js'

function estadoInfo(estado) {
  const e = (estado || '').toLowerCase()
  if (e.includes('activ')) return { cls: 'b-green' }
  if (e.includes('enfri')) return { cls: 'b-amber' }
  if (e.includes('riesgo')) return { cls: 'b-orange' }
  if (e.includes('dormi')) return { cls: 'b-gray' }
  if (e.includes('fug')) return { cls: 'b-red' }
  if (e.includes('nunca')) return { cls: 'b-gray' }
  return { cls: 'b-gray' }
}
const limpiaEstado = e => (e || 's/estado').replace(/^\d+_?/, '').replace(/_/g, ' ')
const limpiaOferta = t => (t ? String(t).replace(/_/g, ' ').replace(/\s+/g, ' ').trim() : '')
function nombreCliente(c) { return c?.razon_social || c?.nombre_razon || c?.nombre_cliente || c?.nombre_comercial || c?.nombre || '—' }
function mapsUrl(c) {
  if (c.lat != null && c.lng != null) return `https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}`
  if (c.direccion) return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(c.direccion)}`
  if (c.nombre_cliente) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([c.nombre_cliente, c.comuna].filter(Boolean).join(' '))}`
  return null
}
function alertaCliente(c) {
  const dias = Number(c.dias_sin_comprar), mtd = Number(c.venta_mtd) || 0, prom = Number(c.venta_mensual) || 0
  const oferta = (c.oferta_real || '').split('·')[0]?.replace(/^Foco:\s*/i, '').trim()
  if (c.es_bloqueado) return { tone: 'bad', title: 'Bloqueado', body: 'No gestionar venta hasta desbloquear.' }
  if (/FUGADO|DORMIDO/i.test(c.estado_fuga || '')) return { tone: 'bad', title: 'Recuperar', body: oferta ? `Lleva ${dias || '—'}d sin comprar. Entrar con: ${oferta}` : `Lleva ${dias || '—'}d sin comprar. Agendá visita de recuperación.` }
  if (/RIESGO|ENFRIANDO/i.test(c.estado_fuga || '') || (!isNaN(dias) && dias >= 21)) return { tone: 'warn', title: 'Hoy deberías contactarlo', body: oferta ? `${dias}d sin compra. Ofrecé hoy: ${oferta}` : `${dias}d sin compra. Confirmá pedido o visita.` }
  if (prom > 0 && mtd < prom * 0.5 && mtd >= 0) return { tone: 'warn', title: 'Va bajo su promedio', body: oferta ? `Lleva ${money(mtd)} de ~${money(prom)}/mes. Cerrar gap ~${money(prom - mtd)} con: ${oferta}` : `Lleva ${money(mtd)} de ~${money(prom)} promedio. Faltan ~${money(prom - mtd)} al ritmo habitual.` }
  if (oferta) return { tone: 'ok', title: 'Siguiente producto', body: `En la visita priorizá: ${oferta}` }
  return null
}
const PAGE = 40

export default function Cartera({ session }) {
  const eje = useEjecutivo()
  const [searchParams] = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [clientes, setClientes] = useState([])
  const [dataAsOf, setDataAsOf] = useState(null)
  const [showAdvFiltros, setShowAdvFiltros] = useState(false)
  const [advComuna, setAdvComuna] = useState('')
  const [advDias, setAdvDias] = useState('')
  const [advVentaMin, setAdvVentaMin] = useState('')
  const [advSoloTel, setAdvSoloTel] = useState(false)
  const [advOrden, setAdvOrden] = useState('venta')
  const [filtro, setFiltro] = useState(() => { const f = searchParams.get('filtro'); if (!f) return 'Todos'; if (f === 'Riesgo') return 'RIESGO'; if (f === 'Enfri') return 'ENFRI'; return f })
  const [q, setQ] = useState(() => searchParams.get('q') || '')
  const [notaDe, setNotaDe] = useState(null)
  const [pedidoCliente, setPedidoCliente] = useState(null)
  const [ofertaCliente, setOfertaCliente] = useState(null)
  const [customer360, setCustomer360] = useState(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [expandido, setExpandido] = useState(null)
  const [show, setShow] = useState(PAGE)
  const [skuOpen, setSkuOpen] = useState({})

  async function cargar() {
    setLoading(true)
    const eid = eje?.eidVista || session.user.id
    const { data, error } = await supabase.from('cartera').select('*').eq('ejecutivo_id', eid).order('venta_mtd', { ascending: false, nullsFirst: false })
    if (error) console.error('cartera error', error)
    setClientes(data || [])
    const snaps = (data || []).map(r => r.fecha_snapshot).filter(Boolean)
    if (snaps.length) setDataAsOf([...snaps].sort().at(-1))
    else { const off = loadOfflineSnapshot(); setDataAsOf(off?.savedAt ? String(off.savedAt).slice(0, 10) : null) }
    try { saveOfflineSnapshot({ tipo: 'cartera', clientes: data || [], savedAt: new Date().toISOString() }) } catch (_) { void _ }
    setLoading(false)
  }
  useEffect(() => { if (eje?.eidVista) cargar() }, [eje?.eidVista])

  async function bloquear(cliente, motivo) {
    const key = cliente.cliente_key, id = cliente.id
    setClientes(prev => prev.map(c => ((id && c.id === id) || (key && c.cliente_key === key)) ? { ...c, es_bloqueado: true, bloqueo_motivo: motivo } : c))
    let q = supabase.from('cartera').update({ es_bloqueado: true }); if (id) q = q.eq('id', id); else if (key) q = q.eq('cliente_key', key); else return
    const { error } = await q
    if (error) { setClientes(prev => prev.map(c => ((id && c.id === id) || (key && c.cliente_key === key)) ? { ...c, es_bloqueado: false } : c)); alert('No se pudo bloquear: ' + (error.message || 'permiso / red')); return }
    try { await supabase.from('notas_cliente').insert({ ejecutivo_id: session.user.id, cliente_key: key, nombre_local: cliente.nombre_cliente || cliente.razon_social, tipo: motivo === 'deuda' ? 'bloqueo_deuda' : 'bloqueo_cerrado', texto: motivo === 'deuda' ? 'Bloqueado por deuda' : 'Cerrado / sin actividad' }) } catch { /* nota opcional */ }
  }
  async function desbloquear(cliente) {
    const key = cliente.cliente_key, id = cliente.id
    setClientes(prev => prev.map(c => ((id && c.id === id) || (key && c.cliente_key === key)) ? { ...c, es_bloqueado: false, bloqueo_motivo: null } : c))
    let q = supabase.from('cartera').update({ es_bloqueado: false }); if (id) q = q.eq('id', id); else if (key) q = q.eq('cliente_key', key); else return
    const { error } = await q
    if (error) { setClientes(prev => prev.map(c => ((id && c.id === id) || (key && c.cliente_key === key)) ? { ...c, es_bloqueado: true } : c)); alert('No se pudo desbloquear: ' + (error.message || 'permiso / red')) }
  }

  const orden = ['1_ACTIVO','2_ENFRIANDOSE','3_EN_RIESGO','4_DORMIDO','5_FUGADO','0_NUNCA_COMPRO']
  const resumen = useMemo(() => { const r = {}; clientes.forEach(c => { if (c.estado_fuga) r[c.estado_fuga] = (r[c.estado_fuga] || 0) + 1 }); return r }, [clientes])
  const estadosOrd = Object.keys(resumen).sort((a,b) => orden.indexOf(a) - orden.indexOf(b))
  const nNuevos = clientes.filter(esNuevoMes).length, nRecuperados = clientes.filter(esRecuperadoMes).length, nActivosMes = clientes.filter(c => Number(c.venta_mtd) > 0).length, nSinVentaMes = clientes.filter(c => !(Number(c.venta_mtd) > 0)).length, nBloqueados = clientes.filter(c => c.es_bloqueado).length
  const comunasOpts = useMemo(() => Array.from(new Set(clientes.map(c => String(c.comuna || '').trim().toUpperCase()).filter(Boolean))).sort(), [clientes])
  const nAdvActivos = [advComuna, advDias, advVentaMin !== '' ? advVentaMin : '', advSoloTel ? '1' : '', advOrden !== 'venta' ? advOrden : ''].filter(Boolean).length
  const reponerHoy = useMemo(() => { try { return clientes.map(c => { const skus = skusAReponer(c); return skus.length ? { ...c, _reponer: skus, _urgencia: skus.some(s => s.tone === 'bad') ? 2 : 1 } : null }).filter(Boolean).sort((a,b) => b._urgencia - a._urgencia || (Number(b.venta_mensual)||0) - (Number(a.venta_mensual)||0)) } catch { return [] } }, [clientes])
  const lista = useMemo(() => {
    let rows = clientes
    if (filtro === 'Bloqueados') rows = rows.filter(c => c.es_bloqueado)
    else if (filtro === 'Nuevos') rows = rows.filter(esNuevoMes)
    else if (filtro === 'Recuperados') rows = rows.filter(esRecuperadoMes)
    else if (filtro === 'ActivosMes') rows = rows.filter(c => Number(c.venta_mtd) > 0)
    else if (filtro === 'SinVentaMes') rows = rows.filter(c => !(Number(c.venta_mtd) > 0))
    else if (filtro === 'ReponerHoy') rows = rows.filter(clienteTocaReponer)
    else if (filtro === 'RIESGO') rows = rows.filter(c => /RIESGO/i.test(c.estado_fuga || ''))
    else if (filtro === 'ENFRI') rows = rows.filter(c => /ENFRI/i.test(c.estado_fuga || ''))
    else if (filtro === 'CerrarMeta') rows = rows.filter(c => !c.es_bloqueado && (clienteTocaReponer(c) || /RIESGO|ENFRI|FUGA|DORMIDO/i.test(c.estado_fuga || '') || ((Number(c.venta_mensual)||0) >= 200000 && (Number(c.venta_mtd)||0) < (Number(c.venta_mensual)||0)*.5)))
    else if (filtro === 'Foco') { const focoQ=(q||searchParams.get('q')||'').toLowerCase().trim(); if(focoQ){const tokens=focoQ.split(/\s+/).filter(t=>t.length>2); rows=rows.filter(c=>tokens.some(t=>[c.sku_detalle,c.oferta_real,c.productos_top,c.nombre_cliente].map(x=>String(x||'').toLowerCase()).join(' ').includes(t))) } }
    else if (filtro !== 'Todos') rows = rows.filter(c => c.estado_fuga === filtro)
    if (q && filtro !== 'Foco') { const tokens=q.toLowerCase().trim().split(/\s+/).filter(Boolean); rows=rows.filter(c=>tokens.every(t=>[c.nombre_cliente,c.comuna,c.cliente_key,c.direccion,c.razon_social,c.segmento,c.oferta_real,c.sku_detalle].map(x=>String(x||'').toLowerCase()).join(' ').includes(t))) }
    if (advComuna) rows=rows.filter(c=>String(c.comuna||'').toUpperCase()===advComuna)
    if (advDias) rows=rows.filter(c=>{const d=Number(c.dias_sin_comprar); if(!Number.isFinite(d)) return advDias==='60+'; if(advDias==='0-7')return d>=0&&d<=7;if(advDias==='8-30')return d>=8&&d<=30;if(advDias==='31-60')return d>=31&&d<=60;if(advDias==='60+')return d>60;return true})
    if (advVentaMin !== '' && advVentaMin != null) rows=rows.filter(c=>(Number(c.venta_mtd)||0)>=(Number(advVentaMin)||0))
    if (advSoloTel) rows=rows.filter(c=>String(c.telefono||c.link_whatsapp||'').replace(/\D/g,'').length>=8)
    return [...rows].sort((a,b)=>{if(advOrden==='nombre')return String(a.nombre_cliente||'').localeCompare(String(b.nombre_cliente||''),'es');if(advOrden==='dias'){const da=Number(a.dias_sin_comprar),db=Number(b.dias_sin_comprar),va=Number.isFinite(da)?da:9999,vb=Number.isFinite(db)?db:9999;if(vb!==va)return vb-va}if(filtro==='Foco'||filtro==='CerrarMeta'){const score=c=>{let s=0;if(clienteTocaReponer(c))s+=50;if(/RIESGO/i.test(c.estado_fuga||''))s+=30;if(/ENFRI/i.test(c.estado_fuga||''))s+=20;if(/FUGA|DORMIDO/i.test(c.estado_fuga||''))s+=15;const mtd=Number(c.venta_mtd)||0,prom=Number(c.venta_mensual)||0;if(prom>0&&mtd<prom*.5)s+=25;s+=Math.min(30,Math.log10(Math.max(prom,1))*5);return s};const d=score(b)-score(a);if(d)return d}const va=Number(a.venta_mtd)||0,vb=Number(b.venta_mtd)||0;if(vb!==va)return vb-va;return (Number(b.venta_mensual)||0)-(Number(a.venta_mensual)||0)})
  }, [clientes,filtro,q,searchParams,advComuna,advDias,advVentaMin,advSoloTel,advOrden])

  function exportarCSV(modo) {
    let base=clientes,fname='cartera'; if(modo===true||modo==='bloqueados'){base=clientes.filter(c=>c.es_bloqueado);fname='bloqueados'}else if(modo==='fugados'){base=clientes.filter(c=>/FUGA|RIESGO|DORMIDO|ENFRI/i.test(String(c.estado_fuga||'')));fname='riesgo_fugados'}else if(modo==='reponer'){base=clientes.filter(clienteTocaReponer);fname='reponer_hoy'}else if(modo==='con_venta'){base=clientes.filter(c=>Number(c.venta_mtd)>0);fname='con_venta_mes'}else{base=lista.length?lista:clientes;fname=filtro==='Todos'?'cartera':'cartera_'+String(filtro).replace(/\s+/g,'_')}
    if(!base.length){alert('No hay clientes para exportar.');return}
    const cab=['nombre','cliente_key','comuna','estado','bloqueado','venta_mtd','venta_promedio_mensual','dias_sin_comprar','oferta','productos_top','sku_detalle','telefono','contacto','fecha_snapshot','direccion'].join(',')
    const filas=base.map(c=>[c.nombre_cliente,c.cliente_key,c.comuna,limpiaEstado(c.estado_fuga),c.es_bloqueado?'SI':'NO',c.venta_mtd,c.venta_mensual,c.dias_sin_comprar,c.oferta_real,c.productos_top,c.sku_detalle,c.telefono,c.persona_contacto,c.fecha_snapshot,c.direccion].map(x=>`"${(x??'').toString().replace(/"/g,"'")}"`).join(',')).join('\n')
    const blob=new Blob(['\ufeff'+cab+'\n'+filas],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=fname+'_'+new Date().toISOString().slice(0,10)+'.csv';a.click();URL.revokeObjectURL(url)
  }

  function abrirCustomer360(c) { setCustomer360(c) }
  function contactar(c) {
    const raw = String(c.link_whatsapp || c.telefono || '').trim()
    if (raw && /^https?:\/\//i.test(raw)) window.open(raw, '_blank', 'noopener,noreferrer')
    else if (raw) window.open(`https://wa.me/${raw.replace(/\D/g, '')}`, '_blank', 'noopener,noreferrer')
  }

  return (
    <PageShell eyebrow="Clientes" titulo="Mi cartera" subtitulo={`${clientes.length} en zona · ${nActivosMes} con venta este mes · ${nNuevos} nuevos`} sello={dataAsOf ? `Datos al ${String(dataAsOf).slice(0,10)}` : null} loading={loading}>
      <div className="wrap">
        {dataAsOf && <DataAsOfBanner fecha={dataAsOf} extra={`${clientes.length} clientes · zona activa`} />}
        <StatGrid cols={4} items={[{label:'Con venta mes',value:nActivosMes,tone:'ok',active:filtro==='ActivosMes',onClick:()=>{setFiltro(filtro==='ActivosMes'?'Todos':'ActivosMes');setShow(PAGE)}},{label:'Sin venta mes',value:nSinVentaMes,tone:'warn',active:filtro==='SinVentaMes',onClick:()=>{setFiltro(filtro==='SinVentaMes'?'Todos':'SinVentaMes');setShow(PAGE)}},{label:'Nuevos mes',value:nNuevos,tone:'info',active:filtro==='Nuevos',onClick:()=>{setFiltro(filtro==='Nuevos'?'Todos':'Nuevos');setShow(PAGE)}},...estadosOrd.filter(e=>/RIESGO|FUGADO|DORMIDO|ENFRIANDO/i.test(e)).map(e=>({label:limpiaEstado(e),value:resumen[e],tone:/FUGADO/i.test(e)?'danger':'warn',active:filtro===e,onClick:()=>{setFiltro(filtro===e?'Todos':e);setShow(PAGE)}}))]}/>
        <p className="muted" style={{fontSize:11,margin:'4px 0 8px'}}>Con venta mes = facturó en el mes en curso. Salud (riesgo/fugado) es histórico.</p>
        <SearchField value={q} placeholder="Buscar cliente o comuna…" onChange={v=>{setQ(v);setShow(PAGE)}} />
        <FilterBar ariaLabel="Filtrar cartera" value={filtro} onChange={v=>{setFiltro(v);setShow(PAGE)}} options={[{value:'Todos',label:'Todos'},...(nBloqueados>0?[{value:'Bloqueados',label:'Bloqueados',count:nBloqueados,tone:'danger'}]:[]),{value:'Nuevos',label:'Nuevos',count:nNuevos},...(nRecuperados>0?[{value:'Recuperados',label:'Recuperados',count:nRecuperados,tone:'ok'}]:[]),{value:'ReponerHoy',label:'Reponer',count:reponerHoy.length,tone:'warn'}]} trailing={null}/>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',margin:'8px 0 12px'}}><div style={{fontSize:12,color:'var(--ink-3)',fontWeight:600}}>{Math.min(show,lista.length)} de {lista.length}</div></div>
        {lista.slice(0,show).map(c=>{
          const info=estadoInfo(c.estado_fuga), cardKey=c.id||c.cliente_key, abierto=expandido===cardKey, nav=mapsUrl(c), skus=parseSkuDetalle(c.sku_detalle), aReponer=skusAReponer(c), nSkuMix=skus.length, mtd=Number(c.venta_mtd)||0,prom=Number(c.venta_mensual)||0,pct=pctRitmo(mtd,prom),pctBar=pct!=null?Math.min(100,Math.max(0,pct)):0,ofertaTxt=limpiaOferta(c.oferta_real),topReponer=aReponer.slice(0,2),decision=decideClient(c)
          return <div key={cardKey} style={{background:'#fff',border:c.es_bloqueado?'1.5px solid #fecaca':'1px solid #ebe6e0',borderRadius:14,marginBottom:7,overflow:'hidden',boxShadow:abierto?'0 8px 24px rgba(26,22,20,.08)':'0 1px 2px rgba(26,22,20,.04)'}}>
            <div style={{display:'flex',alignItems:'center',gap:12,padding:'11px 12px',cursor:'pointer'}} onClick={()=>setExpandido(abierto?null:cardKey)}>
              <div style={{flex:1,minWidth:0}}><div style={{fontWeight:750,fontSize:14,color:'var(--ink)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{nombreCliente(c)}</div><div style={{marginTop:4,display:'flex',alignItems:'center',gap:5,flexWrap:'wrap'}}><span className={'badge '+info.cls}>{limpiaEstado(c.estado_fuga)}</span>{c.es_bloqueado&&<span className="badge b-red">Bloqueado</span>}{esNuevoMes(c)&&<span className="badge b-blue">Nuevo</span>}{aReponer.length>0&&<span className="badge" style={{background:'var(--danger-lt)',color:'var(--danger-dk)'}}>Reponer {aReponer.length}</span>}{decision&&<span className="badge" style={{background:decision.attention==='now'?'#fee2e2':'#fff7ed',color:decision.attention==='now'?'#b91c1c':'#9a3412'}}>Acción {decision.score}</span>}<span style={{fontSize:12,color:'var(--muted)'}}>{c.comuna}</span></div></div>
              <div style={{textAlign:'right',flexShrink:0}}><div style={{fontWeight:800,fontSize:16,color:'var(--brand)'}}>{money(mtd>0?mtd:prom)}</div><div style={{fontSize:11,color:'var(--muted)',fontWeight:600}}>{mtd>0?'este mes':'prom. mes'}</div></div><div style={{color:'var(--line-2)',fontSize:18,fontWeight:700,transform:abierto?'rotate(90deg)':'none'}}>›</div>
            </div>
            {abierto&&<div style={{padding:'0 16px 16px'}}>
              {decision&&<div style={{background:'#fff8ef',border:'1px solid #fed7aa',borderRadius:12,padding:'10px 12px',marginBottom:10}}><div style={{fontSize:10,fontWeight:900,color:'var(--brand)',letterSpacing:'.06em'}}>PRÓXIMA ACCIÓN</div><div style={{fontSize:14,fontWeight:800,marginTop:3}}>{decision.actionLabel}</div><div style={{fontSize:12,color:'var(--ink-3)',marginTop:2}}>{decision.reason}</div></div>}
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:12}}><div style={{background:'var(--bg-soft)',borderRadius:12,padding:'12px 14px',border:'1px solid #ebe6e0'}}><div style={{fontSize:10,fontWeight:700,color:'var(--muted)'}}>ESTE MES</div><div style={{fontSize:18,fontWeight:800,marginTop:2}}>{money(mtd)}</div></div><div style={{background:'var(--bg-soft)',borderRadius:12,padding:'12px 14px',border:'1px solid #ebe6e0'}}><div style={{fontSize:10,fontWeight:700,color:'var(--muted)'}}>PROMEDIO</div><div style={{fontSize:18,fontWeight:800,marginTop:2}}>{money(prom)}</div></div></div>
              {pct!=null&&<div style={{marginBottom:14}}><div style={{display:'flex',justifyContent:'space-between',fontSize:12,fontWeight:600,color:'var(--ink-3)',marginBottom:6}}><span>Ritmo del mes</span><span>{pct}%</span></div><div className="progress-bg"><div className="progress-fill" style={{width:pctBar+'%',background:pct>=100?'var(--ok-mid)':pct>=50?'var(--warn)':'var(--danger)'}}/></div></div>}
              {(ofertaTxt||topReponer.length>0)&&<div style={{background:'#fff7ed',border:'1.5px solid #fb923c',borderRadius:12,padding:'12px 14px',marginBottom:12}}><div style={{fontSize:10,fontWeight:800,color:'var(--brand)',letterSpacing:'.06em'}}>OFRECÉ HOY</div><div style={{fontSize:14,fontWeight:600,color:'var(--ink)',lineHeight:1.35}}>{ofertaTxt||topReponer.map(s=>s.nombre).join(' · ')}</div></div>}
              {(c.persona_contacto||c.dias_sin_comprar!=null)&&<div style={{fontSize:12,color:'var(--ink-3)',marginBottom:12}}>{c.persona_contacto&&<span>{c.persona_contacto}</span>}{c.persona_contacto&&c.dias_sin_comprar!=null&&<span> · </span>}{c.dias_sin_comprar!=null&&<span>{Number(c.dias_sin_comprar)===0?'Compró hoy':`Sin comprar ${c.dias_sin_comprar} d`}</span>}</div>}
              <ClientActionBar phone={c.telefono} whatsappUrl={c.link_whatsapp} mapsUrl={nav} onNote={()=>setNotaDe(c)}/>
              <button type="button" onClick={e=>{e.stopPropagation();abrirCustomer360(c)}} style={{width:'100%',marginTop:10,minHeight:48,border:'1px solid #ded8d1',borderRadius:12,background:'#fff',color:'var(--ink)',fontWeight:850,fontSize:13,fontFamily:'inherit',cursor:'pointer'}}>Customer 360 · ver todo</button>
              <button type="button" onClick={e=>{e.stopPropagation();setOfertaCliente(c)}} style={{width:'100%',marginTop:8,minHeight:48,border:0,borderRadius:12,background:'linear-gradient(180deg,#d14a12,#c2410c)',color:'#fff',fontWeight:800,fontSize:14,fontFamily:'inherit',cursor:'pointer'}}>Catálogo / precios del cliente</button>
              <div style={{marginTop:12}}><HistorialPedidos ejecutivoId={eje?.eidVista||session?.user?.id} clienteKey={c.cliente_key} compact defaultDias={30} title="Pedidos de este cliente" onOpenPedido={p=>setPedidoCliente({...c,_pedido:p})}/></div>
              <button type="button" onClick={e=>{e.stopPropagation();setSkuOpen(s=>({...s,[c.cliente_key]:!s[c.cliente_key]}))}} style={{width:'100%',marginTop:10,padding:10,border:0,background:'transparent',color:'var(--muted)',fontWeight:700,fontSize:12,fontFamily:'inherit',cursor:'pointer'}}>{skuOpen[c.cliente_key]?'Ocultar mix ▴':'Ver mix y más ▾'}</button>
              {skuOpen[c.cliente_key]&&<div style={{marginTop:4}}>{aReponer.length>0&&<div style={{background:'#fff7ed',borderRadius:14,padding:'12px 14px',marginBottom:12,border:'1px solid #fed7aa',fontSize:12,lineHeight:1.45}}><div style={{fontWeight:800,color:'var(--brand)',marginBottom:8}}>Reposición · {aReponer.length} SKU</div>{aReponer.slice(0,5).map((s,i)=><div key={i} style={{padding:'6px 0',borderTop:i?'1px solid #f1e7dd':'none'}}><strong>{s.nombre}</strong><div style={{fontSize:11,color:'var(--brand-dk)',marginTop:1}}>{s.recompra?.label||'Reponer'}{s.falta>0?` · falta ${Number(s.falta).toLocaleString('es-CL',{maximumFractionDigits:1})}`:''}</div></div>)}</div>}{skus.filter(s=>s.nombre&&s.nombre.length>2&&!/^\d+$/.test(s.nombre)).length>0?skus.filter(s=>s.nombre&&s.nombre.length>2&&!/^\d+$/.test(s.nombre)).sort((a,b)=>(Number(b.clpMtd)||Number(b.udMtd)||0)-(Number(a.clpMtd)||Number(a.udMtd)||0)).map((s,i)=>{const p=pctRitmo(s.udMtd,s.promUd),barPct=p!=null?Math.min(100,Math.max(0,p)):0,clp=clpEfectivo(s),tieneData=s.udMtd>0||s.promUd>0||clp>0;return <div key={i} style={{padding:'10px 0',borderBottom:'1px solid #f5f5f4',opacity:tieneData?1:.5}}><div style={{display:'flex',justifyContent:'space-between',gap:10}}><div style={{fontSize:13,fontWeight:600,flex:1}}>{s.nombre}</div><span style={{fontWeight:800,fontSize:13}}>{clp>0?money(clp):p!=null?p+'%':'—'}</span></div>{tieneData&&<><div style={{marginTop:5,height:4,borderRadius:999,background:'var(--line-faint)',overflow:'hidden'}}><div style={{width:barPct+'%',height:'100%',background:p==null?'var(--line-2)':p>=100?'var(--ok-mid2)':'var(--warn)'}}/></div><div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'var(--muted)',marginTop:4}}><span>{s.udMtd>0?`${Number(s.udMtd).toLocaleString('es-CL',{maximumFractionDigits:1})} ud este mes`:'Sin compra este mes'}</span><span>{s.promUd>0?`prom ${Number(s.promUd).toLocaleString('es-CL',{maximumFractionDigits:1})} ud`:''}</span></div></>}</div>}) : <div style={{fontSize:12,color:'var(--muted)',padding:10,textAlign:'center'}}>Sin historial de productos.</div>}<div className="cli-bloqueo" style={{marginTop:12}}>{c.es_bloqueado?<button type="button" className="blq-btn blq-off" onClick={()=>desbloquear(c)}>Desbloquear</button>:<><button type="button" className="blq-btn blq-on" onClick={()=>bloquear(c,'cerrado')}>Cerrado</button><button type="button" className="blq-btn blq-on" onClick={()=>bloquear(c,'deuda')}>Deuda</button></>}</div></div>}
            </div>}
          </div>
        })}
        {lista.length>show&&<button className="btn btn-ghost" style={{width:'100%',marginTop:8}} onClick={()=>setShow(s=>s+PAGE)}>Ver más ({lista.length-show})</button>}
        {!lista.length&&<div style={{background:'#fff',border:'1px solid #ebe6df',borderRadius:16,padding:'28px 20px',textAlign:'center',marginTop:8}}><div style={{fontSize:15,fontWeight:700,color:'var(--ink)',marginBottom:6}}>Nada en este filtro</div><p style={{fontSize:13,color:'var(--ink-3)',margin:'0 0 14px'}}>Probá “Todos” o buscá por nombre / comuna.</p><button type="button" className="filter-btn active" onClick={()=>{setFiltro('Todos');setShow(PAGE);setQ('')}}>Ver toda la cartera</button></div>}
      </div>
      {notaDe&&<NotaModal cliente={notaDe} session={session} onClose={()=>setNotaDe(null)}/>} {ofertaCliente&&<OfertaClienteSheet cliente={ofertaCliente} ejecutivoId={eje?.eidVista||session.user.id} onClose={()=>setOfertaCliente(null)}/>} {pedidoCliente&&<PedidoSheet cliente={pedidoCliente} initialPedido={pedidoCliente._pedido||null} aReponer={skusAReponer(pedidoCliente)} ejecutivoId={eje?.eidVista||session.user.id} ejecutivoNombre={eje?.nombre||eje?.zona} onClose={()=>setPedidoCliente(null)}/>} {customer360&&<Customer360Sheet cliente={customer360} onClose={()=>setCustomer360(null)} onOrder={c=>{setCustomer360(null);setPedidoCliente(c)}} onVisit={c=>{setCustomer360(null);window.location.assign(`/visita/${encodeURIComponent(String(c.cliente_key||c.id))}`)}} onContact={contactar} onCatalog={c=>{setCustomer360(null);setOfertaCliente(c)}}/>}
    </PageShell>
  )
}
