const n = v => Number(v || 0)
const money = v => n(v).toLocaleString('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 })
const pick = (r, keys) => keys.map(k => r?.[k]).find(v => v != null)
const text = v => v == null || v === '' ? '—' : String(v)

export function ControlModules({ section, ventas = [], clientes = [], ejecutivos = [], stock = [], opportunities = [], onClient }) {
  if (section === 'stock') return <StockModule rows={stock} />
  if (section === 'metas') return <GoalsModule rows={ventas} ejecutivos={ejecutivos} />
  if (section === 'alertas') return <AlertsModule clientes={clientes} onClient={onClient} />
  if (section === 'focos') return <FocusModule opportunities={opportunities} onClient={onClient} />
  if (section === 'productos') return <ProductsModule rows={ventas} />
  if (section === 'ejecutivos') return <ChannelPeopleModule ejecutivos={ejecutivos} />
  return <ChannelPeopleModule ejecutivos={ejecutivos} />
}

function Panel({ title, meta, children }) { return <article className="cc-panel cc-full"><div className="cc-panel-head"><h2>{title}</h2><span>{meta ?? ''}</span></div>{children}</article> }
function Table({ heads, rows }) { return <div className="cc-table"><div className="cc-row cc-head">{heads.map(h => <span key={h}>{h}</span>)}</div>{rows.length ? rows : <div className="cc-empty">Sin datos disponibles.</div>}</div> }

function StockModule({ rows }) {
  const mapped = rows.map((r,i) => <div className="cc-row" key={r.id ?? i}><span>{text(pick(r,['producto_nombre','producto','sku','sku_canon']))}</span><span>{text(pick(r,['stock_disponible','disponible','stock','cantidad']))}</span><span>{text(pick(r,['bodega','centro','ubicacion']))}</span><span>{text(pick(r,['estado','status']))}</span></div>)
  return <Panel title="Stock y disponibilidad" meta={`${rows.length} registros`}><Table heads={['Producto','Disponible','Ubicación','Estado']} rows={mapped.slice(0,150)} /></Panel>
}

function GoalsModule({ rows, ejecutivos }) {
  const grouped = new Map()
  for (const r of rows) {
    const id = pick(r,['ejecutivo_id','id_ejecutivo'])
    const key = id ?? pick(r,['ejecutivo_nombre','ejecutivo']) ?? 'Sin ejecutivo'
    const x = grouped.get(String(key)) || { key, nombre: pick(r,['ejecutivo_nombre','ejecutivo']) ?? id ?? 'Sin ejecutivo', venta: 0, meta: 0 }
    x.venta += n(pick(r,['venta_mtd','ventas_mtd','venta']))
    x.meta += n(pick(r,['meta_mtd','meta']))
    grouped.set(String(key), x)
  }
  const rowsOut = [...grouped.values()].map((r,i) => <div className="cc-row" key={r.key ?? i}><span>{text(r.nombre)}</span><span>{money(r.venta)}</span><span>{r.meta ? money(r.meta) : '—'}</span><span>{r.meta ? `${(r.venta/r.meta*100).toFixed(1)}%` : '—'}</span></div>)
  return <Panel title="Metas por ejecutivo" meta={`${ejecutivos.length} ejecutivos`}><Table heads={['Ejecutivo','Venta MTD','Meta','Cumplimiento']} rows={rowsOut} /></Panel>
}

function AlertsModule({ clientes, onClient }) {
  const rows = clientes.filter(r => {
    const risk = String(pick(r,['estado_fuga','riesgo','estado_riesgo']) || '').toLowerCase()
    return risk.includes('alto') || risk.includes('rojo') || risk.includes('crit') || n(pick(r,['dias_sin_comprar','dias_sin_compra'])) >= 30 || Boolean(pick(r,['es_bloqueado','bloqueado']))
  }).sort((a,b) => n(pick(b,['oportunidad_estimada','oportunidad'])) - n(pick(a,['oportunidad_estimada','oportunidad'])))
  const out = rows.slice(0,100).map((r,i) => <button className="cc-row cc-click" key={r.cliente_key ?? r.id ?? i} onClick={() => onClient(r)}><span>{text(pick(r,['nombre_cliente','nombre','razon_social','cliente_key']))}</span><span>{text(pick(r,['estado_fuga','riesgo','estado_riesgo']))}</span><span>{pick(r,['dias_sin_comprar','dias_sin_compra']) != null ? `${pick(r,['dias_sin_comprar','dias_sin_compra'])} días` : '—'}</span><span>{money(pick(r,['oportunidad_estimada','oportunidad']))}</span></button>)
  return <Panel title="Alertas accionables" meta={`${rows.length} detectadas`}><Table heads={['Cliente','Riesgo','Sin compra','Oportunidad']} rows={out} /></Panel>
}

function FocusModule({ opportunities, onClient }) {
  const out = opportunities.map((r,i) => <button className="cc-row cc-click" key={r.id ?? i} onClick={() => onClient(r)}><span>{text(r.nombre)}</span><span>{money(r.oportunidad)}</span><span>{text(r.prioridad)}</span><span>{text(r.ejecutivo)}</span></button>)
  return <Panel title="Focos comerciales" meta="priorizados por oportunidad"><Table heads={['Cliente','Oportunidad','Prioridad','Ejecutivo']} rows={out} /></Panel>
}

function ProductsModule({ rows }) {
  const grouped = new Map()
  for (const r of rows) {
    const key = pick(r,['sku_canon','sku','producto_nombre','producto']) || 'Sin producto'
    const x = grouped.get(String(key)) || { key, nombre: pick(r,['producto_nombre','producto','sku_canon','sku']) || key, venta: 0, cantidad: 0 }
    x.venta += n(pick(r,['venta_mtd','ventas_mtd','venta','venta_neta_clp']))
    x.cantidad += n(pick(r,['cantidad','unidades']))
    grouped.set(String(key), x)
  }
  const out = [...grouped.values()].sort((a,b)=>b.venta-a.venta).slice(0,150).map((r,i)=><div className="cc-row" key={r.key ?? i}><span>{text(r.nombre)}</span><span>{r.cantidad.toLocaleString('es-CL')}</span><span>{money(r.venta)}</span><span>{text(r.key)}</span></div>)
  return <Panel title="Productos" meta={`${grouped.size} referencias`}><Table heads={['Producto','Cantidad','Venta','SKU']} rows={out} /></Panel>
}

function ChannelPeopleModule({ ejecutivos }) {
  const isKAM = e => /kam|key|cadena/i.test(String(e.rol || ''))
  const isTele = e => /tele/i.test(String(e.rol || ''))
  const kam = ejecutivos.filter(isKAM), tele = ejecutivos.filter(isTele), terreno = ejecutivos.filter(e => !isKAM(e) && !isTele(e))
  const group = (title, rows) => <div className="cc-submodule"><h3>{title}</h3><Table heads={['Nombre','Zona','Rol']} rows={rows.map((e,i)=><div className="cc-row" key={e.id ?? i}><span>{text(e.nombre)}</span><span>{text(e.zona)}</span><span>{text(e.rol)}</span></div>)} /></div>
  return <Panel title="Ejecutivos por canal" meta={`${ejecutivos.length} personas`}>{group('KAM / Cadenas',kam)}{group('Televenta',tele)}{group('Terreno',terreno)}</Panel>
}
