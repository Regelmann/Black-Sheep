import { useNavigate } from 'react-router-dom'
import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { money, DataAsOfBanner } from '../components.jsx'
import { useEjecutivo } from '../App.jsx'
import { parseSkuDetalle, clpEfectivo } from '../lib/coach.js'
import { predict7Days } from '../lib/predictor.js'

/** Fuente de verdad del mix: líneas de venta del cliente (mes + histórico reciente) */
async function mixDesdeVentasLineas(clienteKey) {
  if (!clienteKey) return []
  const { data, error } = await supabase
    .from('ventas_lineas')
    .select('sku_canon,producto_nombre,cantidad,venta_neta_clp,fecha')
    .eq('cliente_key', String(clienteKey))
    .order('fecha', { ascending: false })
    .limit(800)
  if (error || !data?.length) return []
  // Mes de referencia = mes de la venta más reciente del cliente (no reloj del celular)
  let mesRef = new Date().toISOString().slice(0, 7)
  for (const r of data) {
    const f = r.fecha ? String(r.fecha).slice(0, 7) : null
    if (f) { mesRef = f; break }
  }
  const by = new Map()
  for (const r of data) {
    const sk = String(r.sku_canon || '').trim()
    if (!sk) continue
    const cur = by.get(sk) || {
      nombre: r.producto_nombre || sk,
      sku_canon: sk,
      promUd: 0,
      udMtd: 0,
      falta: 0,
      promClp: 0,
      clpMtd: 0,
      ultima: null,
      nCompras: 0,
    }
    const cant = Number(r.cantidad) || 0
    const clp = Number(r.venta_neta_clp) || 0
    const f = r.fecha ? String(r.fecha).slice(0, 10) : null
    if (f && f.startsWith(mesRef)) {
      cur.udMtd += cant
      cur.clpMtd += clp
    }
    cur.promUd += cant
    cur.promClp += clp
    cur.nCompras += 1
    if (!cur.ultima || (f && f > cur.ultima)) cur.ultima = f
    if (r.producto_nombre) cur.nombre = r.producto_nombre
    by.set(sk, cur)
  }
  // Preferir SKUs del mes; si ninguno, devolver histórico completo
  const all = Array.from(by.values())
  const mtd = all.filter(x => (Number(x.clpMtd) || 0) > 0 || (Number(x.udMtd) || 0) > 0)
  const list = (mtd.length ? mtd : all)
    .map(x => ({
      ...x,
      falta: 0,
      promUd: x.nCompras ? x.promUd / Math.max(1, x.nCompras) : x.promUd,
    }))
    .sort((a, b) => (b.clpMtd || 0) - (a.clpMtd || 0) || (b.promClp || 0) - (a.promClp || 0))
  return list
}


function fmtStock(n) {
  if (n == null || n === '') return '—'
  const v = Number(n)
  if (isNaN(v)) return '—'
  const r = Math.round(v * 100) / 100
  return r.toLocaleString('es-CL', { maximumFractionDigits: 1 })
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

function normCanal(s) {
  return String(s || '')
    .toUpperCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/NOR\s+PONIENTE/g, 'NOR-PONIENTE')
    .replace(/NOR\s+ORIENTE/g, 'NOR-ORIENTE')
    .replace(/ZONA\s+SUR/g, 'ZONA SUR')
}

function canalDeCliente(d) {
  return normCanal(d?.ejecutivo || d?.canal || d?.zona || d?.zona_canal || d?.zona_vendedor)
}

export default function Gerencia({ esGerente }) {
  const navAdmin = useNavigate()

  const eje = useEjecutivo() || {}
  const todosEjecutivos = eje.todosEjecutivos || []
  const eidVista = eje.eidVista

  const [dataAsOf, setDataAsOf] = useState(null)
  const [loading, setLoading] = useState(true)
  const [gerencia, setGerencia] = useState([])
  const [tendencia, setTendencia] = useState([])
  const [topProd, setTopProd] = useState([])
  const [stockLento, setStockLento] = useState([])
  const [mesSel, setMesSel] = useState(null)
  const [mesCanales, setMesCanales] = useState(null) // { loading, rows: [{canal, venta, pct}] }

  const [error, setError] = useState(null)
  const [tab, setTab] = useState('zonas') // zonas | productos | stock | actividad
  const [detalleCli, setDetalleCli] = useState([])
  const [canalSel, setCanalSel] = useState(null)
  const [cliSel, setCliSel] = useState(null) // cliente_key expandido
  const [cliSku, setCliSku] = useState({}) // { [cliente_key]: { skus, oferta, loading } }
  const [bloqueados, setBloqueados] = useState([]) // cartera.es_bloqueado para decisión gerencial
  const [carteraCache, setCarteraCache] = useState([]) // mix + bloqueos por zona de terreno
  const [actividad, setActividad] = useState(null) // { loading, rango, checkins, pedidos, notas, stats }
  const [actRango, setActRango] = useState('hoy') // hoy | 7d

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        // IDs de terreno: todos los ejecutivos de zona (gerente) o el actual
        const eids = (todosEjecutivos.length ? todosEjecutivos.map(e => e.id) : [eidVista]).filter(Boolean)

        const carPromises = eids.length
          ? eids.map(id =>
              supabase
                .from('cartera')
                .select(
                  'cliente_key,nombre_cliente,razon_social,comuna,zona,ejecutivo_id,venta_mtd,venta_mensual,dias_sin_comprar,estado_fuga,es_bloqueado,sku_detalle,oferta_real,productos_top'
                )
                .eq('ejecutivo_id', id)
                .limit(800)
            )
          : [
              supabase
                .from('cartera')
                .select(
                  'cliente_key,nombre_cliente,razon_social,comuna,zona,ejecutivo_id,venta_mtd,venta_mensual,dias_sin_comprar,estado_fuga,es_bloqueado,sku_detalle,oferta_real,productos_top'
                )
                .limit(2000),
            ]

        const [{ data: g }, { data: t }, { data: stock }, { data: det }, carResults, { data: notasBlq }] =
          await Promise.all([
            supabase.from('gerencia').select('*'),
            supabase.from('tendencia').select('*'),
            supabase.from('stock').select('sku_canon,producto_nombre,precio_unidad,precio_lista,precio,cobertura_dias,estado_stock,es_foco_mes,stock_operativo').limit(500),
            supabase.from('gerencia_clientes').select('*').order('venta_mtd', { ascending: false }).limit(3000),
            Promise.all(carPromises),
            supabase
              .from('notas_cliente')
              .select('cliente_key,nombre_local,tipo,texto,created_at,creado_en')
              .or('tipo.ilike.%bloqueo%,tipo.ilike.%bloqueo_cerrado%,tipo.ilike.%bloqueo_deuda%')
              .limit(150),
          ])

        // mapa ejecutivo_id → zona (para cuando cartera.zona viene vacía)
        const zonaByEid = {}
        for (const e of todosEjecutivos || []) {
          if (e?.id) zonaByEid[e.id] = e.zona || e.nombre || null
        }
        const carAll = []
        const seenKey = new Set()
        for (const r of carResults || []) {
          for (const row of r?.data || []) {
            const k = row.cliente_key || row.nombre_cliente
            if (k && seenKey.has(k)) continue
            if (k) seenKey.add(k)
            const zona =
              row.zona ||
              zonaByEid[row.ejecutivo_id] ||
              null
            carAll.push({ ...row, zona, ejecutivo: zona })
          }
        }
        setCarteraCache(carAll)

        const isBlq = c =>
          c?.es_bloqueado === true ||
          c?.es_bloqueado === 'true' ||
          c?.es_bloqueado === 1 ||
          c?.es_bloqueado === '1' ||
          String(c?.es_bloqueado || '').toUpperCase() === 'SI' ||
          String(c?.es_bloqueado || '').toUpperCase() === 'S' ||
          !!c?.es_bloqueado
        let blq = carAll.filter(isBlq)
        // Notas de bloqueo como respaldo / complemento
        if ((notasBlq || []).length) {
          const have = new Set(blq.map(b => b.cliente_key || b.nombre_cliente))
          for (const n of notasBlq) {
            const k = n.cliente_key || n.nombre_local
            if (!k || have.has(k)) continue
            have.add(k)
            const fromCar = carAll.find(
              c => c.cliente_key === n.cliente_key || c.nombre_cliente === n.nombre_local
            )
            blq.push(
              fromCar || {
                cliente_key: n.cliente_key,
                nombre_cliente: n.nombre_local || n.cliente_key,
                comuna: null,
                zona: null,
                venta_mtd: 0,
                venta_mensual: 0,
                es_bloqueado: true,
                _desde_nota: true,
                tipo: n.tipo,
              }
            )
          }
        }
        setBloqueados(blq)
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
        // Alerta: SKU de foco sin precio publicado
        const sp = (stockData || []).filter(s => s.es_foco_mes && !(Number(s.precio_unidad||0) > 0 || Number(s.precio_lista||0) > 0 || Number(s.precio||0) > 0))
        if (sp.length) console.warn('[BS] Focos sin precio:', sp.length, sp.slice(0,3).map(s=>s.producto_nombre))
        window.__bs_foco_sin_precio = sp.length
      } catch (e) {
        setError(String(e.message || e))
      } finally {
        setLoading(false)
      }
    })()
  }, [eidVista, todosEjecutivos.map(e => e.id).join("|")])

  /** Clientes del canal: gerencia_clientes + fallback cartera de terreno
   *  gerencia_clientes.ejecutivo = zona ("NOR-ORIENTE")
   *  gerencia.ejecutivo puede ser nombre ("Sebastian Vargas") O zona
   *  → mapear siempre por zona canónica
   */
  const clientesDelCanal = useMemo(() => {
    const byCanal = {}
    const push = (canal, row) => {
      const k = normCanal(canal)
      if (!k) return
      if (!byCanal[k]) byCanal[k] = []
      byCanal[k].push(row)
    }

    // Mapa nombre ejecutivo → zona (para resolver "Sebastian Vargas" → "NOR-ORIENTE")
    const nombreToZona = {}
    for (const e of todosEjecutivos || []) {
      if (e?.nombre && e?.zona) nombreToZona[normCanal(e.nombre)] = normCanal(e.zona)
      if (e?.zona) nombreToZona[normCanal(e.zona)] = normCanal(e.zona)
    }
    const resolverZona = (raw) => {
      const k = normCanal(raw)
      return nombreToZona[k] || k
    }

    for (const d of detalleCli || []) {
      // gerencia_clientes.ejecutivo siempre es la zona
      const zona = resolverZona(d?.ejecutivo || d?.canal || d?.zona)
      push(zona, {
        ...d,
        nombre_cliente: d.nombre_cliente || d.nombre || d.cliente_key,
        venta_mtd: Number(d.venta_mtd) || 0,
        pct_zona: d.pct_zona,
        _src: 'gerencia_clientes',
      })
    }

    // Fallback desde cartera para zonas sin filas en gerencia_clientes
    for (const c of carteraCache || []) {
      const z = resolverZona(c.zona || c.ejecutivo)
      if (!z || !esTerreno(z)) continue
      const list = byCanal[z] || []
      if (list.some(x => x.cliente_key && String(x.cliente_key) === String(c.cliente_key))) continue
      if (!list.length || (c.sku_detalle && !list.find(x => x.cliente_key === c.cliente_key))) {
        push(z, {
          cliente_key: c.cliente_key,
          nombre_cliente: c.nombre_cliente || c.razon_social || c.cliente_key,
          comuna: c.comuna,
          venta_mtd: Number(c.venta_mtd) || 0,
          pct_zona: null,
          sku_detalle: c.sku_detalle,
          oferta_real: c.oferta_real,
          productos_top: c.productos_top,
          _src: 'cartera',
        })
      }
    }
    for (const k of Object.keys(byCanal)) {
      // Solo activos del mes (venta > 0). Evita listar toda la maestra con $0.
      byCanal[k] = byCanal[k]
        .filter(r => (Number(r.venta_mtd) || 0) > 0)
        .sort((a, b) => (Number(b.venta_mtd) || 0) - (Number(a.venta_mtd) || 0))
    }
    return byCanal
  }, [detalleCli, carteraCache, todosEjecutivos])

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

  // Solo últimos 12 meses (evita “año” inflado con histórico largo)

  // Desglose del mes por CANAL DE LA MAESTRA (cliente_key → ejecutivo/zona), NUNCA por VENDEDOR de factura
  useEffect(() => {
    if (!mesSel) {
      setMesCanales(null)
      return
    }
    let cancelled = false
    ;(async () => {
      setMesCanales({ loading: true, rows: [] })
      try {
        // Mapa canónico cliente → canal (maestra / gerencia_clientes)
        const keyToZona = {}
        const put = (ck, z) => {
          if (!ck || !z) return
          const k = String(ck).trim()
          const zz = normCanal(z)
          if (!k || !zz) return
          keyToZona[k] = zz
          const base = k.replace(/-.*$/, '')
          if (base && base !== k) keyToZona[base] = zz
          if (!k.endsWith('-C')) keyToZona[k + '-C'] = zz
        }
        for (const d of detalleCli || []) {
          put(d.cliente_key, d.ejecutivo || d.canal || d.zona)
        }
        for (const c of carteraCache || []) {
          put(c.cliente_key, c.zona || c.ejecutivo)
        }

        const startStr = String(mesSel).slice(0, 10)
        const d0 = new Date(startStr + 'T12:00:00')
        const d1 = new Date(d0.getFullYear(), d0.getMonth() + 1, 1)
        const endStr = d1.toISOString().slice(0, 10)
        const agg = {}
        let from = 0
        const page = 1000
        for (let guard = 0; guard < 50; guard++) {
          const { data, error } = await supabase
            .from('ventas_lineas')
            .select('venta_neta_clp,cliente_key,zona_vendedor')
            .gte('fecha', startStr)
            .lt('fecha', endStr)
            .range(from, from + page - 1)
          if (error) {
            console.warn('mesCanales', error.message)
            break
          }
          if (!data?.length) break
          for (const r of data) {
            const ck = String(r.cliente_key || '').trim()
            let z =
              keyToZona[ck] ||
              keyToZona[ck.replace(/-.*$/, '')] ||
              (ck && !ck.endsWith('-C') ? keyToZona[ck + '-C'] : null) ||
              null
            // Fallback: canal de factura si es un canal real (no VENDEDOR_01)
            if (!z) {
              const zv = normCanal(r.zona_vendedor || '')
              if (zv && !/^VENDEDOR/.test(zv) && zv !== 'OTROS') z = zv
            }
            if (!z || /^VENDEDOR/.test(z)) z = 'NO_ASIGNADO'
            agg[z] = (agg[z] || 0) + (Number(r.venta_neta_clp) || 0)
          }
          if (data.length < page) break
          from += page
        }
        const totalSum = Object.values(agg).reduce((a, b) => a + b, 0)
        const total = totalSum || 1
        const rows = Object.entries(agg)
          .map(([canal, venta]) => ({
            canal,
            venta,
            pct: Math.round((venta / total) * 1000) / 10,
            terreno: /NOR-ORIENTE|NOR-PONIENTE|ZONA SUR/.test(canal),
          }))
          .sort((a, b) => b.venta - a.venta)
        if (!cancelled) setMesCanales({ loading: false, rows, total: totalSum })
      } catch (e) {
        if (!cancelled) setMesCanales({ loading: false, rows: [], error: String(e.message || e) })
      }
    })()
    return () => { cancelled = true }
  }, [mesSel, carteraCache, detalleCli])

  const tendencia12 = useMemo(() => {
    const rows = [...(tendencia || [])]
    const key = (m) => String(m?.mes || m?.mes_texto || '')
    rows.sort((a, b) => key(a).localeCompare(key(b)))
    return rows.slice(-12)
  }, [tendencia])
  const maxMes = useMemo(() => Math.max(1, ...tendencia12.map(t => Number(t.venta_clp) || 0)), [tendencia12])
  const anioVenta = useMemo(() => tendencia12.reduce((s, t) => s + (Number(t.venta_clp) || 0), 0), [tendencia12])
  const mesSelRow = tendencia12.find(x => x.mes === mesSel) || tendencia.find(x => x.mes === mesSel)


  // Reportes de terreno: check-ins, pedidos, bloqueos/notas
  useEffect(() => {
    if (tab !== 'actividad') return
    let cancelled = false
    ;(async () => {
      setActividad(a => ({ ...(a || {}), loading: true }))
      const start = new Date()
      if (actRango === '7d') start.setDate(start.getDate() - 6)
      start.setHours(0, 0, 0, 0)
      const iso = start.toISOString()

      const [chRes, peRes, noRes] = await Promise.all([
        supabase
          .from('checkins')
          .select('id,visita_id,hora_llegada,hora_fin,resultado,lat_real,lng_real,cliente_key')
          .gte('hora_llegada', iso)
          .order('hora_llegada', { ascending: false })
          .limit(300),
        supabase
          .from('pedidos')
          .select('id,ejecutivo_id,cliente_key,nombre_cliente,lineas,nota,estado,creado_en,total')
          .gte('creado_en', iso)
          .order('creado_en', { ascending: false })
          .limit(300),
        supabase
          .from('notas_cliente')
          .select('id,ejecutivo_id,cliente_key,nombre_local,tipo,texto,created_at,creado_en')
          .or('tipo.ilike.%bloqueo%,tipo.ilike.%no_venta%,tipo.ilike.%visita%')
          .limit(200),
      ])

      if (cancelled) return
      let checkins = chRes.data || []
      const visitaIds = [...new Set(checkins.map(c => c.visita_id).filter(Boolean))]
      let visitaMap = {}
      if (visitaIds.length) {
        const { data: vs } = await supabase
          .from('visitas')
          .select('id,cliente_key,nombre_cliente,nombre_local')
          .in('id', visitaIds.slice(0, 100))
        for (const v of vs || []) visitaMap[v.id] = v
      }
      checkins = checkins.map(c => {
        const v = visitaMap[c.visita_id]
        const ck = c.cliente_key || v?.cliente_key
        const fromCar = carteraCache.find(x => x.cliente_key === ck)
        return {
          ...c,
          cliente_key: ck,
          nombre_cliente:
            v?.nombre_cliente || v?.nombre_local || fromCar?.nombre_cliente || ck || 'Cliente',
        }
      })
      const pedidos = peRes.data || []
      let notas = noRes.data || []
      notas = notas.filter(n => {
        const tt = n.created_at || n.creado_en
        if (!tt) return true
        return new Date(tt) >= start
      })

      let $capturado = 0
      for (const p of pedidos) {
        if (p.total != null && !isNaN(Number(p.total))) {
          $capturado += Number(p.total)
          continue
        }
        const lineas = Array.isArray(p.lineas) ? p.lineas : []
        for (const l of lineas) {
          $capturado += (Number(l.precio) || 0) * (Number(l.cantidad) || 0)
        }
      }

      const conPedido = checkins.filter(c => /pedido/i.test(c.resultado || '')).length
      const noVenta = checkins.filter(c => /no.?venta|sin.?compra/i.test(c.resultado || '')).length
      const bloqueos = notas.filter(n => /bloqueo/i.test(n.tipo || '')).length

      // por día
      const byDay = {}
      const dayKey = d => {
        const x = new Date(d)
        if (isNaN(x.getTime())) return '—'
        return x.toISOString().slice(0, 10)
      }
      for (const c of checkins) {
        const k = dayKey(c.hora_llegada)
        if (!byDay[k]) byDay[k] = { day: k, checkins: 0, pedidos: 0, no_venta: 0, $: 0 }
        byDay[k].checkins++
        if (/pedido/i.test(c.resultado || '')) byDay[k].pedidos++
        if (/no.?venta/i.test(c.resultado || '')) byDay[k].no_venta++
      }
      for (const p of pedidos) {
        const k = dayKey(p.creado_en)
        if (!byDay[k]) byDay[k] = { day: k, checkins: 0, pedidos: 0, no_venta: 0, $: 0 }
        byDay[k].pedidos++
        let t = Number(p.total)
        if (isNaN(t) || !p.total) {
          t = 0
          for (const l of Array.isArray(p.lineas) ? p.lineas : []) {
            t += (Number(l.precio) || 0) * (Number(l.cantidad) || 0)
          }
        }
        byDay[k].$ += t
      }
      const dias = Object.values(byDay).sort((a, b) => String(b.day).localeCompare(String(a.day)))

      setActividad({
        loading: false,
        rango: actRango,
        checkins,
        pedidos,
        notas,
        dias,
        stats: {
          checkins: checkins.length,
          pedidos: pedidos.length,
          capturado: Math.round($capturado),
          conPedido,
          noVenta,
          bloqueos,
          conversion: checkins.length
            ? Math.round((Math.max(conPedido, pedidos.length) / checkins.length) * 100)
            : 0,
        },
      })
    })()
    return () => {
      cancelled = true
    }
  }, [tab, actRango, carteraCache])

  // Precargar SKU de los top 3 clientes de cada zona en background
  // Así cuando el usuario toca "▼ mix" ya está en cache → sin lag
  useEffect(() => {
    if (loading || !detalleCli.length) return
    const tops = detalleCli
      .filter(d => d.venta_mtd > 0 && (d.sku_detalle || d.productos_top))
      .sort((a, b) => (Number(b.venta_mtd) || 0) - (Number(a.venta_mtd) || 0))
      .slice(0, 15)
    for (const d of tops) {
      const key = d.cliente_key || d.nombre_cliente || d.nombre
      if (!key || cliSku[key]) continue
      // Precargar en background sin bloquear la UI
      setTimeout(() => {
        cargarSkuCliente(d.cliente_key, d.nombre_cliente || d.nombre)
      }, 100)
    }
  }, [loading, detalleCli]) // eslint-disable-line

  async function cargarSkuCliente(clienteKey, nombreHint) {
    const key = clienteKey || nombreHint || 'sin-key'
    if (cliSel === key) { setCliSel(null); return }
    setCliSel(key)
    if (cliSku[key]?.skus?.length) return

    setCliSku(prev => ({ ...prev, [key]: { loading: true, skus: [], oferta: null } }))

    // Normalizar cliente_key para comparaciones (con/sin dígito verificador)
    const normKey = (k) => String(k || '').replace(/-[0-9kKK]$/, '').replace(/\D/g, '')

    const fromGer =
      detalleCli.find(d => String(d.cliente_key) === String(clienteKey)) ||
      detalleCli.find(d => normKey(d.cliente_key) === normKey(clienteKey)) ||
      (nombreHint
        ? detalleCli.find(d =>
            String(d.nombre_cliente || d.nombre || '').toUpperCase()
              .includes(String(nombreHint).toUpperCase().slice(0, 18)))
        : null)

    // FAST PATH 1: gerencia_clientes tiene sku_detalle → mostrar sin queries
    if (fromGer?.sku_detalle) {
      let skusFast = parseSkuDetalle(fromGer.sku_detalle)
      try {
        const fv = await mixDesdeVentasLineas(fromGer.cliente_key)
        if (fv.length >= skusFast.length) skusFast = fv
      } catch (_) {}

      if (skusFast.length) {
        setCliSku(prev => ({ ...prev, [key]: {
          loading: false, skus: skusFast,
          oferta: fromGer.oferta_real || null,
          productos_top: fromGer.productos_top || null,
          fuente: 'gerencia_clientes' } }))
        return
      }
    }

    // FAST PATH 0: usar campo accion de gerencia (siempre tiene TOP: ...)
    // Esto da respuesta INMEDIATA sin ninguna query adicional
    if (!fromGer?.sku_detalle && !fromGer?.productos_top) {
      const canal = fromGer?.ejecutivo || fromGer?.canal || ''
      const gerRow = gerencia.find(g =>
        normCanal(g.ejecutivo) === normCanal(canal) ||
        normCanal(g.ejecutivo) === normCanal(clienteKey) ||
        normCanal(g.ejecutivo) === normCanal(nombreHint)
      )
      const accion = gerRow?.accion || ''
      const topMatch = accion.match(/TOP:\s*(.+)$/i)
      if (topMatch) {
        const skusAccion = topMatch[1].split(' | ')
          .map(x => x.trim()).filter(x => x.length > 3).slice(0, 8)
          .map(x => {
            const m = x.match(/^(.+?)\s+\$?([\d.,]+)\s*M?/i)
            return {
              nombre: m ? m[1].trim() : x,
              clpMtd: m ? Number(String(m[2]).replace(/\./g,'').replace(',','.')) * (/M/i.test(x)?1e6:1) : 0,
              udMtd: 0, promClp: 0, promUd: 0, cicloDias: null, ultima: null,
            }
          })
        if (skusAccion.length) {
          setCliSku(prev => ({ ...prev, [key]: {
            loading: false, skus: skusAccion,
            oferta: null, fuente: 'gerencia_accion' } }))
          // No retornar — seguir buscando sku_detalle real
        }
      }
    }

    // FAST PATH 2: productos_top como texto → parsear inmediatamente y mostrar
    if (fromGer?.productos_top) {
      const topTxt = typeof fromGer.productos_top === 'string'
        ? fromGer.productos_top : JSON.stringify(fromGer.productos_top)
      const skusTop = topTxt.split(/[·|,;]+/)
        .map(x => x.trim()).filter(x => x.length > 3).slice(0, 10)
        .map(x => {
          const m = x.match(/^(.+?)\s+\$?([\d.,]+)\s*M?/i)
          return { nombre: m ? m[1].trim() : x,
            clpMtd: m ? Number(String(m[2]).replace(/\./g,'').replace(',','.')) * (/M/i.test(x)?1e6:1) : 0,
            udMtd: 0, promClp: 0, promUd: 0, cicloDias: null, ultima: null }
        })
      if (skusTop.length) {
        // Mostrar inmediatamente lo que tenemos, y seguir buscando detalle
        setCliSku(prev => ({ ...prev, [key]: {
          loading: false, skus: skusTop,
          oferta: fromGer.oferta_real || null, fuente: 'productos_top' } }))
      }
    }

    // Cache de cartera de terreno
    const fromCache = carteraCache.find(c =>
      (clienteKey && (String(c.cliente_key) === String(clienteKey) ||
        normKey(c.cliente_key) === normKey(clienteKey))) ||
      (nombreHint &&
        (String(c.nombre_cliente || '').toUpperCase() === String(nombreHint).toUpperCase() ||
          String(c.razon_social || '').toUpperCase() === String(nombreHint).toUpperCase()))
    )
    if (fromCache && parseSkuDetalle(fromCache.sku_detalle).length) {
      setCliSku(prev => ({ ...prev, [key]: {
        loading: false, skus: parseSkuDetalle(fromCache.sku_detalle),
        oferta: fromCache.oferta_real || null,
        productos_top: fromCache.productos_top || null,
        venta_mtd: fromCache.venta_mtd, fuente: 'cartera' } }))
      return
    }

    let skus = []
    let oferta = fromGer?.oferta_real || fromGer?.oferta || null
    let productos_top = fromGer?.productos_top || null


    // Fuente 0: sku_detalle de gerencia_clientes
    if (fromGer?.sku_detalle) {
      skus = parseSkuDetalle(fromGer.sku_detalle)
      if (skus.length <= 1) {
        const fromVentasEarly = await mixDesdeVentasLineas(clienteKey || fromGer?.cliente_key)
        if (fromVentasEarly.length > skus.length) skus = fromVentasEarly
      }
    }
    // Fuente 0c: ventas_lineas es la verdad del mix (siempre que haya venta)
    try {
      const fromVentas = await mixDesdeVentasLineas(clienteKey || fromGer?.cliente_key)
      if (fromVentas.length >= skus.length) skus = fromVentas
      else if (fromVentas.length > 0 && skus.length === 0) skus = fromVentas
    } catch (_) { /* ignore */ }



    // Fuente 0b: productos_top de gerencia_clientes (accion field con Top SKU)
    if (!skus.length && fromGer?.accion) {
      const topMatch = String(fromGer.accion).match(/TOP:\s*(.+)/i)
      if (topMatch) {
        skus = topMatch[1].split(' | ').slice(0, 8).map(x => {
          const m = x.match(/^(.+?)\s+\$?([\d.,]+)\s*M?/i)
          return {
            nombre: m ? m[1].trim() : x.trim(),
            clpMtd: m ? Number(String(m[2]).replace(/\./g,'').replace(',','.')) * (/M/i.test(x) ? 1e6 : 1) : 0,
            udMtd: 0, promClp: 0, promUd: 0, cicloDias: null, ultima: null,
          }
        }).filter(s => s.nombre.length > 2)
      }
    }

    if (!skus.length && productos_top) {
      const topTxt = typeof productos_top === 'string' ? productos_top : JSON.stringify(productos_top)
      skus = parseSkuDetalle(topTxt)
      if (!skus.length) {
        skus = topTxt
          .split(/[·|,;]+/)
          .map(x => x.trim())
          .filter(x => x.length > 2)
          .slice(0, 10)
          .map(x => {
            const m = x.match(/^(.+?)\s+\$?([\d.,]+)\s*M?/i)
            return {
              nombre: m ? m[1].trim() : x,
              clpMtd: m
                ? Number(String(m[2]).replace(/\./g, '').replace(',', '.')) * (/M/i.test(x) ? 1e6 : 1)
                : 0,
              udMtd: 0,
              promClp: 0,
              promUd: 0,
              cicloDias: null,
              ultima: null,
            }
          })
      }
    }

    if (!skus.length && clienteKey) {
      // Normalizar cliente_key: probar con y sin dígito verificador
      const keyBase = String(clienteKey).replace(/-[0-9kK]$/, '') // "76720094-C" → "76720094"
      const keysToTry = [...new Set([clienteKey, keyBase, keyBase + '-0'])]
      for (const k of keysToTry) {
        if (skus.length) break
        const { data } = await supabase
          .from('cartera')
          .select(
            'sku_detalle,oferta_real,productos_top,venta_mtd,venta_mensual,dias_sin_comprar,ultima_compra,cliente_key,razon_social,nombre_cliente'
          )
          .eq('cliente_key', k)
          .limit(1)
        const row = data?.[0]
        if (row) {
          skus = parseSkuDetalle(row.sku_detalle)
          oferta = oferta || row.oferta_real
          productos_top = productos_top || row.productos_top
        }
      }
      // Si aún sin SKU, intentar búsqueda parcial por los primeros 8 dígitos del RUT
      if (!skus.length && keyBase.length >= 7) {
        const { data } = await supabase
          .from('cartera')
          .select('sku_detalle,oferta_real,productos_top,cliente_key,nombre_cliente')
          .like('cliente_key', `${keyBase}%`)
          .limit(3)
        const row = (data || []).find(r => parseSkuDetalle(r.sku_detalle).length > 0) || data?.[0]
        if (row) {
          skus = parseSkuDetalle(row.sku_detalle)
          oferta = oferta || row.oferta_real
          productos_top = productos_top || row.productos_top
        }
      }
    }

    if (!skus.length && nomBuscar) {
      const q = String(nomBuscar).slice(0, 48).replace(/%/g, '')
      const { data } = await supabase
        .from('cartera')
        .select('sku_detalle,oferta_real,productos_top,cliente_key,nombre_cliente,razon_social')
        .or(`nombre_cliente.ilike.%${q}%,razon_social.ilike.%${q}%`)
        .limit(8)
      const row =
        (data || []).find(r => parseSkuDetalle(r.sku_detalle).length > 0) ||
        (data || []).find(
          r =>
            String(r.nombre_cliente || '').toUpperCase() === q.toUpperCase() ||
            String(r.razon_social || '').toUpperCase() === q.toUpperCase()
        ) ||
        data?.[0]
      if (row) {
        skus = parseSkuDetalle(row.sku_detalle)
        oferta = oferta || row.oferta_real
        productos_top = productos_top || row.productos_top
      }
    }

    if (!skus.length) {
      const keys = []
      if (clienteKey) keys.push(String(clienteKey))
      if (fromGer?.rut) keys.push(String(fromGer.rut))
      if (fromGer?.cliente_key) keys.push(String(fromGer.cliente_key))
      const base = String(clienteKey || fromGer?.cliente_key || '').replace(/-.*$/, '').replace(/\D/g, '')
      if (base && base.length >= 6) {
        keys.push(base)
        keys.push(base + '-C')
        keys.push(base + '-c')
      }
      if (clienteKey && !String(clienteKey).endsWith('-C')) keys.push(String(clienteKey) + '-C')
      const aggFromVl = (vl) => {
        const agg = {}
        for (const r of vl || []) {
          const n = r.producto_nombre || r.sku_canon
          if (!n) continue
          if (!agg[n]) agg[n] = { nombre: n, clpMtd: 0, udMtd: 0, promClp: 0, promUd: 0 }
          agg[n].clpMtd += Number(r.venta_neta_clp) || 0
          agg[n].udMtd += Number(r.cantidad_unidad || r.cantidad) || 0
        }
        return Object.values(agg)
          .sort((a, b) => b.clpMtd - a.clpMtd)
          .slice(0, 12)
          .map(s => ({ ...s, promClp: s.clpMtd, promUd: s.udMtd, cicloDias: null, ultima: null }))
      }
      for (const k of [...new Set(keys.filter(Boolean))]) {
        if (skus.length) break
        try {
          const { data: vl } = await supabase
            .from('ventas_lineas')
            .select('producto_nombre,sku_canon,venta_neta_clp,cantidad,cantidad_unidad,cliente_key')
            .eq('cliente_key', k)
            .limit(300)
          if (vl?.length) skus = aggFromVl(vl)
          // Prefijo numérico del RUT/código
          if (!skus.length && base && base.length >= 7) {
            const { data: vl2 } = await supabase
              .from('ventas_lineas')
              .select('producto_nombre,sku_canon,venta_neta_clp,cantidad,cantidad_unidad,cliente_key')
              .like('cliente_key', base + '%')
              .limit(300)
            if (vl2?.length) skus = aggFromVl(vl2)
          }
        } catch {
          /* RLS */
        }
      }
    }

    if (!skus.length) {
      const nom = (nombreHint || fromGer?.nombre_cliente || fromGer?.razon_social || '').trim()
      if (nom.length > 4) {
        try {
          const token = nom.split(/\s+/)[0].slice(0, 16)
          const { data: vl } = await supabase
            .from('ventas_lineas')
            .select('producto_nombre,sku_canon,venta_neta_clp,cantidad,cantidad_unidad,cliente_key,nombre_cliente')
            .ilike('nombre_cliente', `%${token}%`)
            .limit(200)
          if (vl?.length) {
            const agg = {}
            for (const r of vl) {
              const n = r.producto_nombre || r.sku_canon
              if (!n) continue
              if (!agg[n]) agg[n] = { nombre: n, clpMtd: 0, udMtd: 0, promClp: 0, promUd: 0 }
              agg[n].clpMtd += Number(r.venta_neta_clp) || 0
              agg[n].udMtd += Number(r.cantidad_unidad || r.cantidad) || 0
            }
            skus = Object.values(agg)
              .sort((a, b) => b.clpMtd - a.clpMtd)
              .slice(0, 12)
              .map(s => ({ ...s, promClp: s.clpMtd, promUd: s.udMtd, cicloDias: null, ultima: null }))
          }
        } catch {
          /* */
        }
      }
    }

    setCliSku(prev => ({
      ...prev,
      [key]: {
        loading: false,
        skus,
        oferta,
        productos_top,
        venta_mtd: fromGer?.venta_mtd,
        dias_sin_comprar: null,
        ultima_compra: null,
        fuente: skus.length ? 'ok' : null,
      },
    }))
  }


  const pulse = useMemo(() => { const rows=gerencia||[]; const total=rows.reduce((a,r)=>a+(Number(r.venta_mtd)||0),0); const under=rows.filter(r=>Number(r.meta_mensual||0)>0&&Number(r.venta_mtd||0)<Number(r.meta_mensual||0)).sort((a,b)=>((Number(a.venta_mtd)||0)/(Number(a.meta_mensual)||1))-((Number(b.venta_mtd)||0)/(Number(b.meta_mensual)||1))).slice(0,3); const risks=(carteraCache||[]).filter(c=>{const d=Number(c.dias_sin_comprar||0);if(d>=180||d<=0)return false;return (d>=30&&d<=120)||/RIESGO|ENFRI|DORMIDO/i.test(String(c.estado_fuga||''));}).length;
  // Alerta: SKU sin precio en lista → afecta pedidos del vendedor
  const stockAll = carteraCache?.__stockAll || []
  const sinPrecio = (stockLento || []).filter ? 0 : 0 // placeholder
  return {total,under,risks,slow:(stockLento||[]).length, sinPrecio}; }, [gerencia,carteraCache,stockLento])

  const pred7 = useMemo(() => predict7Days(carteraCache || [], gerencia?.[0] || null, []), [carteraCache, gerencia])

  if (loading) {
    return (
      <div className="wrap" style={{ paddingTop: 20 }}>
        <div className="skeleton" style={{ height: 100, borderRadius: 18, marginBottom: 12 }} />
        <div className="skeleton" style={{ height: 160, borderRadius: 18, marginBottom: 12 }} />
        <div className="skeleton" style={{ height: 80, borderRadius: 14, marginBottom: 10 }} />
        <div className="skeleton" style={{ height: 80, borderRadius: 14, marginBottom: 10 }} />
        <div className="skeleton" style={{ height: 80, borderRadius: 14 }} />
        <p className="muted" style={{ textAlign: 'center', marginTop: 16, fontWeight: 700 }}>Cargando gerencia…</p>
      </div>
    )
  }

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
    <div className="gerencia-page bs-page">
      <section className="bs-executive-pulse">
        <div className="bs-pulse-top">
          <div>
            <span className="bs-command-kicker">GERENCIA · PULSE</span>
            <h2>¿Dónde actuar ahora?</h2>
            <p>Venta del mes y desviaciones que importan.</p>
          </div>
          <div className="bs-pulse-value">{money(pulse.total)}</div>
        </div>
        <div className="bs-pulse-grid">
          <div>
            <strong>{pulse.under.length}</strong>
            <span>zonas bajo meta</span>
          </div>
          <div>
            <strong>{pulse.risks}</strong>
            <span>clientes en riesgo</span>
          </div>
          <div>
            <strong>{pulse.slow}</strong>
            <span>SKUs lentos</span>
          </div>
        </div>
        {typeof window !== 'undefined' && window.__bs_foco_sin_precio > 0 && (
          <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '8px 12px', marginTop: 8, fontSize: 12, color: '#92400e', fontWeight: 700 }}>
            ⚠️ {window.__bs_foco_sin_precio} foco{window.__bs_foco_sin_precio > 1 ? 's' : ''} sin precio en lista — actualizá la lista de precios en el ciclo
          </div>
        )}
        {pulse.under.length > 0 && (
          <div className="bs-pulse-actions">
            {pulse.under.map((r, i) => {
              const pct = Math.round(
                ((Number(r.venta_mtd) || 0) / (Number(r.meta_mensual) || 1)) * 100
              )
              return (
                <button type="button" key={i} onClick={() => setCanalSel(r.ejecutivo)}>
                  <span>{r.ejecutivo}</span>
                  <strong>{pct}%</strong>
                  <em>ver causa →</em>
                </button>
              )
            })}
          </div>
        )}
        {(pred7?.ventaEsperada > 0 || pred7?.ventaEnRiesgo > 0) && (
          <div className="bs-pulse-7d">
            <span>7 días</span>
            {pred7.ventaEsperada > 0 && <strong className="ok">+{money(pred7.ventaEsperada)} esp.</strong>}
            {pred7.ventaEnRiesgo > 0 && <strong className="risk">{money(pred7.ventaEnRiesgo)} riesgo</strong>}
            {pred7.oportunidad > 0 && <strong className="opp">{money(pred7.oportunidad)} oport.</strong>}
          </div>
        )}
        {pred7?.resumen && <p className="bs-pulse-resumen">{pred7.resumen}</p>}
      </section>

      <div className="bs-page-hero">
        <div className="bs-eyebrow">Vista gerencial</div>
        <h1>Resultado del mes</h1>
        <p className="sub">Venta total · terreno · canales</p>
      </div>
      <div className="wrap">

        {(pred7?.ventaEsperada > 0 || pred7?.ventaEnRiesgo > 0 || pred7?.oportunidad > 0) && (
          <div className="bs-pred7 gerencia">
            <div className="bs-pred7-label">Próximos 7 días — predicción</div>
            <div className="bs-pred7-grid">
              {pred7.ventaEsperada > 0 && (
                <div className="bs-pred7-cell ok">
                  <strong>{money(pred7.ventaEsperada)}</strong>
                  <span>Venta esperada</span>
                </div>
              )}
              {pred7.ventaEnRiesgo > 0 && (
                <div className="bs-pred7-cell risk">
                  <strong>{money(pred7.ventaEnRiesgo)}</strong>
                  <span>En riesgo</span>
                </div>
              )}
              {pred7.oportunidad > 0 && (
                <div className="bs-pred7-cell opp">
                  <strong>{money(pred7.oportunidad)}</strong>
                  <span>Oportunidad</span>
                </div>
              )}
            </div>
            {pred7.clientesPorVencer?.length > 0 && (
              <p className="bs-pred7-hint">
                {pred7.clientesPorVencer.length} cliente(s) con ciclo por vencer
              </p>
            )}
          </div>
        )}

        <button
          type="button"
          className="admin-entry"
          onClick={() => window.open('https://black-sheep.cl/dashboard', '_blank')}
          style={{
            width: '100%', marginBottom: 12, padding: '12px 14px', borderRadius: 14,
            border: '1px solid var(--line)', background: 'var(--surface)',
            textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', gap: 10,
          }}
        >
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--brand-lt)', border: '1px solid var(--brand-ring)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--ink)' }}>Control Center ↗</div>
            <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 1 }}>Clientes · metas · precios · config — desde PC</div>
          </div>
        </button>
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
          {noAsignado > 0 && (() => {
            const cliNoAsig = (
              clientesDelCanal['NO_ASIGNADO'] ||
              clientesDelCanal['NO ASIGNADO'] ||
              Object.entries(clientesDelCanal).find(([k]) => /NO.*ASIG/i.test(k))?.[1] || []
            ).filter(d => Number(d.venta_mtd) > 0)
              .sort((a, b) => (Number(b.venta_mtd)||0) - (Number(a.venta_mtd)||0))
            const openNoAsig = canalSel === '_NO_ASIGNADO'
            return (
              <div style={{ marginTop: 10, borderRadius: 12, border: '1.5px solid #fde68a', overflow: 'hidden' }}>
                <button type="button"
                  onClick={() => setCanalSel(openNoAsig ? null : '_NO_ASIGNADO')}
                  style={{ width: '100%', display: 'flex', justifyContent: 'space-between',
                    alignItems: 'center', padding: '10px 12px', background: '#fef3c7',
                    border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                  <div style={{ fontSize: 12, color: '#92400e', textAlign: 'left' }}>
                    <b>⚠ {money(noAsignado)}</b>
                    {' '}({Math.round((noAsignado / Math.max(totalVenta, 1)) * 100)}%) sin zona en maestra
                    <span style={{ display: 'block', fontSize: 11, marginTop: 2, color: '#b45309' }}>
                      {openNoAsig ? '▲ cerrar' : `▼ ver ${cliNoAsig.length} clientes a asignar`}
                    </span>
                  </div>
                </button>
                {openNoAsig && (
                  <div style={{ background: '#fffbeb', padding: '10px 12px 14px' }}>
                    {cliNoAsig.length === 0 && (
                      <p style={{ fontSize: 12, color: '#92400e' }}>Sin detalle. Corré el ciclo v1.24.</p>
                    )}
                    {cliNoAsig.slice(0, 30).map((d, i) => (
                      <div key={d.cliente_key || i} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '7px 0', borderBottom: i < Math.min(cliNoAsig.length,30) - 1 ? '1px solid #fde68a' : 'none',
                      }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: 13, color: '#1c1917', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {d.nombre_cliente || d.cliente_key}
                          </div>
                          <div style={{ fontSize: 11, color: '#78716c' }}>
                            {d.cliente_key}{d.comuna ? ` · ${d.comuna}` : ''}
                          </div>
                        </div>
                        <div style={{ fontWeight: 700, color: '#c2410c', flexShrink: 0, marginLeft: 8, fontSize: 13 }}>
                          {money(d.venta_mtd)}
                        </div>
                      </div>
                    ))}
                    <div style={{ marginTop: 10, fontSize: 11, color: '#92400e', background: '#fef3c7', borderRadius: 8, padding: '8px 10px', lineHeight: 1.5 }}>
                      → Abrí la maestra, buscá estos RUTs y asignales el ejecutivo. El próximo ciclo los mueve a la zona correcta.
                    </div>
                  </div>
                )}
              </div>
            )
          })()}
        </div>

        {/* Tendencia ARRIBA — tocá un mes para ver detalle */}
        <div className="card" style={{ marginTop: 12 }}>
          <div className="card-label">Tendencia mensual · últimos 12</div>
          <p className="muted" style={{ fontSize: 11, marginBottom: 8 }}>
            Tocá una barra para ver el detalle del mes · Año visible: {money(anioVenta)}
          </p>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 140, paddingTop: 8 }}>
            {tendencia12.map(t => {
              const val = Number(t.venta_clp) || 0
              const hPx = Math.max(6, Math.round((val / maxMes) * 110))
              const active = mesSel === t.mes
              const isBest = val > 0 && val === maxMes
              const minPos = Math.min(...tendencia12.map(x => Number(x.venta_clp) || 0).filter(v => v > 0))
              const isWorst = val > 0 && val === minPos && tendencia12.filter(x => Number(x.venta_clp) > 0).length > 1
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
        </div>

        {/* Popup mes seleccionado */}
        {mesSelRow && (
          <div
            style={{
              position: 'fixed', inset: 0, zIndex: 400,
              background: 'rgba(28,25,23,0.45)',
              display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
            }}
            onClick={() => setMesSel(null)}
          >
            <div
              className="card"
              style={{
                width: '100%', maxWidth: 480, margin: 0, borderRadius: '20px 20px 0 0',
                maxHeight: '78vh', overflowY: 'auto', paddingBottom: 28,
              }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div>
                  <div className="card-label">Detalle del mes</div>
                  <div style={{ fontSize: 20, fontWeight: 800 }}>{mesLabel(mesSelRow.mes)}</div>
                </div>
                <button type="button" className="btn btn-soft" style={{ padding: '8px 14px' }} onClick={() => setMesSel(null)}>
                  Cerrar
                </button>
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#1e3a5f', marginBottom: 4 }}>
                {money(mesSelRow.venta_clp)}
              </div>
              {mesSelRow.clientes_activos != null && (
                <div className="muted" style={{ fontSize: 13, marginBottom: 14 }}>
                  {mesSelRow.clientes_activos} clientes activos en el mes
                </div>
              )}
              <div className="card-label" style={{ marginTop: 8 }}>
                Contribución por canal en {mesLabel(mesSelRow.mes)}
              </div>
              {mesCanales?.loading && (
                <p className="muted" style={{ fontSize: 13 }}>Calculando desglose del mes…</p>
              )}
              {!mesCanales?.loading && mesCanales?.rows?.length > 0 && (
                <>
                  {mesCanales.rows.slice(0, 14).map(p => (
                    <div key={p.canal} style={{ marginTop: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                        <span style={{ fontWeight: 700 }}>
                          {p.canal}
                          {p.terreno && <span className="muted" style={{ fontWeight: 500, marginLeft: 6 }}>terreno</span>}
                        </span>
                        <span><b>{p.pct}%</b> · {money(p.venta)}</span>
                      </div>
                      <div className="progress-bg" style={{ marginTop: 4 }}>
                        <div
                          className="progress-fill"
                          style={{
                            width: Math.min(p.pct, 100) + '%',
                            background: p.terreno ? '#2563eb' : esSinAsignar(p.canal) ? '#f59e0b' : '#94a3b8',
                          }}
                        />
                      </div>
                    </div>
                  ))}
                  <p className="muted" style={{ fontSize: 11, marginTop: 12 }}>
                    Desglose por canal de la maestra (cliente→ejecutivo). Total barras {money(mesCanales.total || 0)}.
                  </p>
                </>
              )}
              {!mesCanales?.loading && !(mesCanales?.rows?.length) && participacion?.length > 0 && (
                <>
                  <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                    Sin líneas de ese mes en ventas_lineas. Mostrando peso actual (mes en curso) como referencia.
                  </p>
                  {participacion.slice(0, 10).map(p => (
                    <div key={p.ejecutivo} style={{ marginTop: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                        <span style={{ fontWeight: 700 }}>{p.ejecutivo}</span>
                        <span><b>{p.pct}%</b> · {money(p.venta)}</span>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, margin: '12px 0', overflowX: 'auto' }}>
          {[
            { id: 'zonas', label: 'Zonas / canales' },
            { id: 'actividad', label: 'Actividad terreno' },
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

            {/* Bloqueados — señal de decisión (cerrado / deuda en terreno) */}
            <div
              className="card"
              style={{
                marginBottom: 14,
                border: bloqueados.length ? '1.5px solid #fecaca' : '1px solid #e7e5e4',
                background: bloqueados.length ? '#fef2f2' : '#fff',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', color: '#b91c1c', textTransform: 'uppercase' }}>
                    Clientes bloqueados
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: bloqueados.length ? '#b91c1c' : '#1c1917', marginTop: 2 }}>
                    {bloqueados.length}
                  </div>
                  <div style={{ fontSize: 12, color: '#78716c', marginTop: 2 }}>
                    {bloqueados.length
                      ? 'Marcados en terreno (cerrado / deuda). No empujar venta hasta desbloquear.'
                      : 'Ningún cliente bloqueado en cartera visible.'}
                  </div>
                </div>
              </div>
              {bloqueados.length > 0 && (
                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {bloqueados.slice(0, 8).map(b => (
                    <div
                      key={b.cliente_key || b.nombre_cliente}
                      style={{
                        background: '#fff',
                        borderRadius: 10,
                        padding: '8px 10px',
                        border: '1px solid #fecaca',
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 8,
                        alignItems: 'center',
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: '#1c1917', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {b.nombre_cliente || b.razon_social || b.cliente_key}
                        </div>
                        <div style={{ fontSize: 11, color: '#78716c' }}>
                          {(b.comuna || '—') + (b.zona ? ` · ${b.zona}` : '')}
                          {b.dias_sin_comprar != null ? ` · ${b.dias_sin_comprar}d` : ''}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 800, color: '#b91c1c' }}>
                          {money(Number(b.venta_mtd) || Number(b.venta_mensual) || 0)}
                        </div>
                        <div style={{ fontSize: 10, color: '#a8a29e' }}>prom / mtd</div>
                      </div>
                    </div>
                  ))}
                  {bloqueados.length > 8 && (
                    <div style={{ fontSize: 11, color: '#78716c', textAlign: 'center' }}>
                      +{bloqueados.length - 8} más (filtro Bloqueados en Clientes por zona)
                    </div>
                  )}
                </div>
              )}
            </div>

            <h3 className="section-title">Terreno (con meta)</h3>
            {terreno.map(g => {
              const venta = Number(g.venta_mtd) || 0
              const meta = Number(g.meta_mensual) || 0
              const p = meta ? Math.round((venta / meta) * 100) : 0
              const color = barColor(p)
              const open = canalSel === g.ejecutivo
              // Resolver zona canónica: "Sebastian Vargas" → "NOR-ORIENTE"
              const zonaKey = (() => {
                const k = normCanal(g.ejecutivo)
                for (const e of todosEjecutivos || []) {
                  if (normCanal(e.nombre) === k && e.zona) return normCanal(e.zona)
                  if (normCanal(e.zona) === k) return k
                }
                return k
              })()
              const cliZona = (clientesDelCanal[zonaKey] || [])
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
                        <div style={{ fontWeight: 700 }}>{(Number(g.clientes_activos) > 0 ? Number(g.clientes_activos) : (cliZona.length || '—'))}</div>
                      </div>
                    </div>
                    <div className="progress-bg" style={{ marginTop: 8 }}>
                      <div className="progress-fill" style={{ width: Math.min(p, 100) + '%', background: color }} />
                    </div>
                  </button>
                  {g.accion && (
                    <div className="muted" style={{ fontSize: 12, marginTop: 8, lineHeight: 1.35 }}>
                      {(() => {
                        const a = String(g.accion)
                        const topIdx = a.indexOf('TOP:')
                        const head = (topIdx >= 0 ? a.slice(0, topIdx) : a).trim()
                        const top = topIdx >= 0 ? a.slice(topIdx + 4).trim() : ''
                        return (
                          <>
                            <div>{head}</div>
                            {open && top && (
                              <div style={{ marginTop: 6, fontSize: 11 }}>
                                <b>Top:</b> {top.split('|').slice(0, 5).map(s => s.trim()).filter(Boolean).join(' · ')}
                              </div>
                            )}
                          </>
                        )
                      })()}
                    </div>
                  )}
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
                        const openKey = d.cliente_key || d.nombre_cliente || d.nombre
                        const openCli = cliSel === openKey || cliSel === d.cliente_key
                        const det = cliSku[openKey] || cliSku[d.cliente_key]
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
                              onClick={() => cargarSkuCliente(d.cliente_key, d.nombre_cliente || d.nombre)}
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
                                  const clp = clpEfectivo(s)
                                  // Protección: si promClp < 1000 y clp > 10000 → dato irreal del ciclo
                                  const promClpOk = s.promClp > 0 && !(s.promClp < 1000 && clp > 10000)
                                  const pct = promClpOk ? Math.min(300, Math.round((clp / s.promClp) * 100)) : s.promUd > 0 ? Math.min(300, Math.round(((Number(s.udMtd)||0) / Number(s.promUd)) * 100)) : clp > 0 ? 100 : 0
                                  const falta = Math.max(0, s.promUd - s.udMtd)
                                  const { recompra, cicloEst, diasUltima } = cicloReposicion(s)
                                  const toneColor = { bad: '#b91c1c', warn: '#b45309', ok: '#15803d', muted: '#57534e' }[recompra?.tone || 'muted']
                                  return (
                                    <div key={i} style={{ padding: '6px 0', borderBottom: '1px solid #f5f5f4' }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                                        <div style={{ fontWeight: 600 }}>{s.nombre}</div>
                                        <div style={{ fontWeight: 800, fontSize: 12, color: pct >= 100 ? '#15803d' : pct >= 50 ? '#b45309' : '#b91c1c' }}>{pct}%</div>
                                      </div>
                                      <div style={{ marginTop: 4, height: 5, borderRadius: 999, background: '#f5f5f4', overflow: 'hidden' }}>
                                        <div style={{ width: Math.min(100, Math.max(0, pct)) + '%', height: '100%', borderRadius: 999, background: pct >= 100 ? '#22c55e' : pct >= 50 ? '#f59e0b' : '#ef4444' }} />
                                      </div>
                                      <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>
                                        Mes {fmtStock(s.udMtd)} ud · {money(clpEfectivo(s))} · prom {fmtStock(s.promUd)} · {money(s.promClp)}
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
                                  <div className="muted" style={{ fontSize: 12, lineHeight: 1.4 }}>
                                    Sin historial de SKU para este cliente. Si es canal KAM o Corporativo, revisá la maestra de clientes.
                                  </div>
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
                  {g.accion && (
                    <div className="muted" style={{ fontSize: 12, marginTop: 6, lineHeight: 1.35 }}>
                      {(() => {
                        const a = String(g.accion)
                        const topIdx = a.indexOf('TOP:')
                        const head = topIdx >= 0 ? a.slice(0, topIdx).trim() : a
                        const top = topIdx >= 0 ? a.slice(topIdx + 4).trim() : ''
                        return (
                          <>
                            <div>{head || 'Canal sin meta de terreno'}</div>
                            {open && top && (
                              <div style={{ marginTop: 6, fontSize: 11, color: '#78716c' }}>
                                <b style={{ color: '#57534e' }}>Top mes:</b>{' '}
                                {top.split('|').slice(0, 5).map(s => s.trim()).filter(Boolean).join(' · ')}
                              </div>
                            )}
                            {!open && top && (
                              <div style={{ marginTop: 2, fontSize: 11, opacity: 0.85 }}>Tocá para ver top productos</div>
                            )}
                          </>
                        )
                      })()}
                    </div>
                  )}
                  {open && (
                    <div style={{ marginTop: 10, borderTop: '1px solid #e2e8f0', paddingTop: 8 }}>
                      <div className="muted" style={{ fontSize: 11, marginBottom: 6 }}>
                        Clientes (para actualizar maestra) · toca canal de nuevo para cerrar
                      </div>
                      {(clientesDelCanal[(() => {
                        const k = normCanal(g.ejecutivo)
                        for (const e of todosEjecutivos || []) {
                          if (normCanal(e.nombre) === k && e.zona) return normCanal(e.zona)
                          if (normCanal(e.zona) === k) return k
                        }
                        return k
                      })()] || [])
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
                              onClick={() => cargarSkuCliente(d.cliente_key, d.nombre_cliente || d.nombre)}
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
                                  const clp = clpEfectivo(s)
                                  // Protección: si promClp < 1000 y clp > 10000 → dato irreal del ciclo
                                  const promClpOk = s.promClp > 0 && !(s.promClp < 1000 && clp > 10000)
                                  const pct = promClpOk ? Math.min(300, Math.round((clp / s.promClp) * 100)) : s.promUd > 0 ? Math.min(300, Math.round(((Number(s.udMtd)||0) / Number(s.promUd)) * 100)) : clp > 0 ? 100 : 0
                                  const falta = Math.max(0, s.promUd - s.udMtd)
                                  const { recompra, cicloEst, diasUltima } = cicloReposicion(s)
                                  const toneColor = { bad: '#b91c1c', warn: '#b45309', ok: '#15803d', muted: '#57534e' }[recompra?.tone || 'muted']
                                  return (
                                    <div key={i} style={{ padding: '6px 0', borderBottom: '1px solid #f5f5f4' }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                                        <div style={{ fontWeight: 600 }}>{s.nombre}</div>
                                        <div style={{ fontWeight: 800, fontSize: 12, color: pct >= 100 ? '#15803d' : pct >= 50 ? '#b45309' : '#b91c1c' }}>{pct}%</div>
                                      </div>
                                      <div style={{ marginTop: 4, height: 5, borderRadius: 999, background: '#f5f5f4', overflow: 'hidden' }}>
                                        <div style={{ width: Math.min(100, Math.max(0, pct)) + '%', height: '100%', borderRadius: 999, background: pct >= 100 ? '#22c55e' : pct >= 50 ? '#f59e0b' : '#ef4444' }} />
                                      </div>
                                      <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>
                                        Mes {fmtStock(s.udMtd)} ud · {money(clpEfectivo(s))} · prom {fmtStock(s.promUd)} · {money(s.promClp)}
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
                                  <div className="gerencia-sku-empty">
                                    Sin mix de productos en el mes para este cliente.
                                    <br />
                                    <span style={{ fontSize: 11 }}>Si vendió y no aparece, re-correr el ciclo (sku_detalle en gerencia_clientes).</span>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      {!(clientesDelCanal[normCanal(g.ejecutivo)] || []).length && (
                        <p className="gerencia-sku-empty">
                          Sin clientes con venta MTD en este canal.
                          <br />
                          <span style={{ fontSize: 11 }}>Solo se listan clientes con venta &gt; 0 del mes.</span>
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
            <div className="card-label">Qué empujar este mes (foco + stock disponible)</div>
            <div style={{
              background: '#eff6ff', borderRadius: 12, padding: '10px 12px', marginBottom: 12,
              fontSize: 12, color: '#1e3a5f', lineHeight: 1.45,
            }}>
              <b>Acción gerencial:</b> estos SKU son prioridad de venta. En ruta, ofrécelos a clientes con
              ciclo de recompra vencido. Si cobertura &lt; 15 días → proteger stock. Si cobertura &gt; 60 días →
              empujar con oferta comercial.
            </div>
            {!topProd.length && (
              <p className="muted">Sin datos de productos. Corré bajada con stock/focos.</p>
            )}
            {topProd.map((s, i) => {
              const cob = Number(s.cobertura_dias)
              let accion = 'Ofrecer en visitas del día'
              let tone = '#0f766e'
              if (!isNaN(cob) && cob < 15) { accion = 'Proteger · stock bajo'; tone = '#b91c1c' }
              else if (!isNaN(cob) && cob >= 60) { accion = 'Empujar con oferta'; tone = '#c2410c' }
              else if (s.es_foco || /foco/i.test(String(s.decision || ''))) { accion = 'FOCO del mes · priorizar'; tone = '#1e3a5f' }
              return (
                <div
                  key={s.sku_canon || s.id || i}
                  style={{
                    padding: '12px 0',
                    borderBottom: '1px solid #f1f5f9',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>
                        {s.producto_nombre || s.sku_canon || 'SKU'}
                      </div>
                      <div className="muted" style={{ fontSize: 11 }}>
                        {s.sku_canon}
                        {(s.es_foco || /foco/i.test(s.decision || '')) ? ' · FOCO' : ''}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', fontSize: 12, whiteSpace: 'nowrap' }}>
                      <div>Stock <b>{fmtStock(s.stock_operativo ?? s.stock)}</b></div>
                      <div className="muted">
                        Cob. {s.cobertura_dias != null ? `${fmtStock(s.cobertura_dias)}d` : '—'}
                      </div>
                    </div>
                  </div>
                  <div style={{
                    marginTop: 6, fontSize: 11, fontWeight: 700, color: tone,
                    background: '#f8fafc', display: 'inline-block', padding: '4px 8px', borderRadius: 8,
                  }}>
                    → {accion}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {tab === 'actividad' && (
          <div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              {[
                { id: 'hoy', label: 'Hoy' },
                { id: '7d', label: '7 días' },
              ].map(r => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setActRango(r.id)}
                  style={{
                    padding: '7px 14px',
                    borderRadius: 999,
                    border: actRango === r.id ? '2px solid #c2410c' : '1px solid #e7e5e4',
                    background: actRango === r.id ? '#c2410c' : '#fff',
                    color: actRango === r.id ? '#fff' : '#57534e',
                    fontWeight: 700,
                    fontSize: 12,
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                  }}
                >
                  {r.label}
                </button>
              ))}
            </div>

            {actividad?.loading && (
              <div className="card muted" style={{ textAlign: 'center', padding: 24 }}>
                Cargando actividad de terreno…
              </div>
            )}

            {actividad && !actividad.loading && (
              <>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: 8,
                    marginBottom: 12,
                  }}
                >
                  {[
                    { n: actividad.stats.checkins, l: 'Check-ins', c: '#1c1917' },
                    { n: actividad.stats.pedidos, l: 'Pedidos', c: '#c2410c' },
                    { n: money(actividad.stats.capturado), l: 'Capturado', c: '#0d9488' },
                    { n: actividad.stats.noVenta, l: 'No venta', c: '#78716c' },
                    { n: actividad.stats.bloqueos, l: 'Bloqueos', c: '#b91c1c' },
                    {
                      n: (actividad.stats.conversion || 0) + '%',
                      l: 'Conv. visita',
                      c: '#2563eb',
                    },
                  ].map(k => (
                    <div
                      key={k.l}
                      style={{
                        background: '#fff',
                        borderRadius: 12,
                        padding: '12px 8px',
                        textAlign: 'center',
                        border: '1px solid #e7e5e4',
                      }}
                    >
                      <div style={{ fontSize: 16, fontWeight: 800, color: k.c }}>{k.n}</div>
                      <div
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          color: '#a8a29e',
                          textTransform: 'uppercase',
                          marginTop: 2,
                        }}
                      >
                        {k.l}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="card" style={{ marginBottom: 12 }}>
                  <div className="card-label" style={{ marginBottom: 8 }}>
                    Por día · {actRango === 'hoy' ? 'hoy' : 'últimos 7 días'}
                  </div>
                  {!actividad.dias?.length && (
                    <p className="muted" style={{ fontSize: 13 }}>
                      Sin check-ins ni pedidos en este período. Cuando el equipo opere en terreno,
                      acá se ve el ritmo real.
                    </p>
                  )}
                  {actividad.dias?.map(d => (
                    <div
                      key={d.day}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '10px 0',
                        borderBottom: '1px solid #f5f5f4',
                        gap: 8,
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{d.day}</div>
                        <div className="muted" style={{ fontSize: 11 }}>
                          {d.checkins} check-ins · {d.pedidos} pedidos
                          {d.no_venta ? ` · ${d.no_venta} no venta` : ''}
                        </div>
                      </div>
                      <div style={{ fontWeight: 800, color: '#0d9488', fontSize: 14 }}>
                        {money(d.$)}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="card" style={{ marginBottom: 12 }}>
                  <div className="card-label" style={{ marginBottom: 8 }}>
                    Últimos pedidos
                  </div>
                  {!actividad.pedidos?.length && (
                    <p className="muted" style={{ fontSize: 13 }}>Sin pedidos en el período.</p>
                  )}
                  {actividad.pedidos.slice(0, 12).map(p => {
                    let tot = Number(p.total)
                    if (isNaN(tot) || !p.total) {
                      tot = 0
                      for (const l of Array.isArray(p.lineas) ? p.lineas : []) {
                        tot += (Number(l.precio) || 0) * (Number(l.cantidad) || 0)
                      }
                    }
                    const hora = p.creado_en
                      ? new Date(p.creado_en).toLocaleString('es-CL', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : '—'
                    return (
                      <div
                        key={p.id}
                        style={{
                          padding: '10px 0',
                          borderBottom: '1px solid #f5f5f4',
                          display: 'flex',
                          justifyContent: 'space-between',
                          gap: 10,
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 13 }}>
                            {p.nombre_cliente || p.cliente_key || 'Cliente'}
                          </div>
                          <div className="muted" style={{ fontSize: 11 }}>
                            {hora}
                            {p.estado ? ` · ${p.estado}` : ''}
                            {Array.isArray(p.lineas) ? ` · ${p.lineas.length} líneas` : ''}
                          </div>
                        </div>
                        <div style={{ fontWeight: 800, color: '#c2410c', whiteSpace: 'nowrap' }}>
                          {money(tot)}
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div className="card" style={{ marginBottom: 12 }}>
                  <div className="card-label" style={{ marginBottom: 8 }}>
                    Check-ins recientes
                  </div>
                  {!actividad.checkins?.length && (
                    <p className="muted" style={{ fontSize: 13 }}>Sin check-ins en el período.</p>
                  )}
                  {actividad.checkins.slice(0, 15).map(c => {
                    const hora = c.hora_llegada
                      ? new Date(c.hora_llegada).toLocaleString('es-CL', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : '—'
                    const res = c.resultado || (c.hora_fin ? 'completada' : 'en curso')
                    const resLabel = String(res).replace(/_/g, ' ')
                    return (
                      <div
                        key={c.id}
                        style={{
                          padding: '10px 0',
                          borderBottom: '1px solid #f5f5f4',
                          display: 'flex',
                          justifyContent: 'space-between',
                          gap: 10,
                          alignItems: 'center',
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 13 }}>
                            {c.nombre_cliente || c.cliente_key || 'Cliente'}
                          </div>
                          <div className="muted" style={{ fontSize: 11 }}>{hora}</div>
                        </div>
                        <span style={{
                          fontWeight: 800, fontSize: 11, textTransform: 'uppercase',
                          color: /pedido/i.test(res) ? '#0d9488' : /no.?venta/i.test(res) ? '#78716c' : '#1c1917',
                          background: /pedido/i.test(res) ? '#ecfdf5' : '#f5f5f4',
                          padding: '4px 8px', borderRadius: 8, whiteSpace: 'nowrap',
                        }}>
                          {resLabel}
                        </span>
                      </div>
                    )
                  })}
                </div>

                {(actividad.notas || []).filter(n => /bloqueo/i.test(n.tipo || '')).length > 0 && (
                  <div className="card" style={{ border: '1px solid #fecaca', background: '#fef2f2' }}>
                    <div className="card-label" style={{ marginBottom: 8, color: '#b91c1c' }}>
                      Bloqueos registrados
                    </div>
                    {actividad.notas
                      .filter(n => /bloqueo/i.test(n.tipo || ''))
                      .slice(0, 10)
                      .map(n => (
                        <div
                          key={n.id}
                          style={{
                            padding: '8px 0',
                            borderBottom: '1px solid #fecaca55',
                            fontSize: 13,
                          }}
                        >
                          <div style={{ fontWeight: 700 }}>
                            {n.nombre_local || n.cliente_key || 'Cliente'}
                          </div>
                          <div className="muted" style={{ fontSize: 11 }}>
                            {n.tipo}
                            {n.texto ? ` · ${n.texto}` : ''}
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {tab === 'stock' && (
          <div className="card">
            <div className="card-label">Sobrestock → candidatos a oferta / liquidación</div>
            <div style={{
              background: '#fff7ed', borderRadius: 12, padding: '10px 12px', marginBottom: 12,
              fontSize: 12, color: '#9a3412', lineHeight: 1.45,
            }}>
              <b>Qué hacer:</b> alta cobertura = capital parado. Pedí a cada ejecutivo que los ofrezca en
              las próximas 5 visitas (descuento o combo). Priorizá los de cobertura &gt; 30 días.
              Si decisión = “sin decisión”, definí oferta esta semana.
            </div>
            {!stockLento.length && (
              <p className="muted">No hay candidatos claros a sobrestock. Si cobertura_dias viene vacía en stock, la bajada debe llenarla desde looker_04.</p>
            )}
            {stockLento.map((s, i) => {
              const cob = Number(s.cobertura_dias)
              const urg = !isNaN(cob) && cob >= 60 ? 'URGENTE oferta' : !isNaN(cob) && cob >= 30 ? 'Oferta esta semana' : 'Empujar en ruta'
              return (
                <div
                  key={s.sku_canon || i}
                  style={{
                    padding: '12px 0',
                    borderBottom: '1px solid #f1f5f9',
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{s.producto_nombre || s.sku_canon}</div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                    Stock {fmtStock(s.stock_operativo)} · Cobertura{' '}
                    {s.cobertura_dias != null ? `${fmtStock(s.cobertura_dias)} días` : '—'} ·{' '}
                    {s.decision || 'sin decisión'}
                  </div>
                  <div style={{
                    marginTop: 6, fontSize: 11, fontWeight: 700, color: '#c2410c',
                    background: '#fff7ed', display: 'inline-block', padding: '4px 8px', borderRadius: 8,
                  }}>
                    → {urg}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
