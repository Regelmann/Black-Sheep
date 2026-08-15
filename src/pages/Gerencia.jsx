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
  const [bloqueados, setBloqueados] = useState([]) // cartera.es_bloqueado para decisión gerencial

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const [{ data: g }, { data: t }, { data: stock }, { data: det }, { data: blq }] = await Promise.all([
          supabase.from('gerencia').select('*'),
          supabase.from('tendencia').select('*'),
          supabase.from('stock').select('*').limit(500),
          supabase.from('gerencia_clientes').select('*').order('venta_mtd', { ascending: false }).limit(800),
          supabase
            .from('cartera')
            .select('cliente_key,nombre_cliente,razon_social,comuna,zona,ejecutivo_id,venta_mtd,venta_mensual,dias_sin_comprar,estado_fuga,es_bloqueado')
            .eq('es_bloqueado', true)
            .limit(200),
        ])
        setBloqueados(blq || [])
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

  // Solo últimos 12 meses (evita “año” inflado con histórico largo)
  const tendencia12 = useMemo(() => {
    const rows = [...(tendencia || [])]
    const key = (m) => String(m?.mes || m?.mes_texto || '')
    rows.sort((a, b) => key(a).localeCompare(key(b)))
    return rows.slice(-12)
  }, [tendencia])
  const maxMes = useMemo(() => Math.max(1, ...tendencia12.map(t => Number(t.venta_clp) || 0)), [tendencia12])
  const anioVenta = useMemo(() => tendencia12.reduce((s, t) => s + (Number(t.venta_clp) || 0), 0), [tendencia12])
  const mesSelRow = tendencia12.find(x => x.mes === mesSel) || tendencia.find(x => x.mes === mesSel)


  async function cargarSkuCliente(clienteKey) {
    if (!clienteKey) return
    if (cliSel === clienteKey) {
      setCliSel(null)
      return
    }
    setCliSel(clienteKey)
    if (cliSku[clienteKey]?.skus?.length) return
    setCliSku(prev => ({ ...prev, [clienteKey]: { loading: true, skus: [], oferta: null } }))

    const fromGer = detalleCli.find(d => String(d.cliente_key) === String(clienteKey))
    let skus = parseSkuDetalle(fromGer?.sku_detalle)
    let oferta = fromGer?.oferta_real || fromGer?.oferta || null
    let productos_top = fromGer?.productos_top || null

    // Parse productos_top si viene como texto (común en gerencia_clientes)
    if (!skus.length && productos_top) {
      const topTxt = typeof productos_top === 'string' ? productos_top : JSON.stringify(productos_top)
      skus = parseSkuDetalle(topTxt)
      if (!skus.length) {
        // "PROD $1.2M · PROD2 $0.8M"
        skus = topTxt
          .split(/[·|,;]+/)
          .map(t => t.trim())
          .filter(t => t.length > 2)
          .slice(0, 10)
          .map(t => {
            const m = t.match(/^(.+?)\s+\$?([\d.,]+)\s*M?/i)
            return {
              nombre: m ? m[1].trim() : t,
              clpMtd: m ? Number(String(m[2]).replace(/\./g, '').replace(',', '.')) * ( /M/i.test(t) ? 1e6 : 1) : 0,
              udMtd: 0, promClp: 0, promUd: 0, cicloDias: null, ultima: null,
            }
          })
      }
    }

    // Cartera por cliente_key
    if (!skus.length) {
      const { data } = await supabase
        .from('cartera')
        .select('sku_detalle,oferta_real,productos_top,venta_mtd,venta_mensual,dias_sin_comprar,ultima_compra,cliente_key,nombre_social,nombre_cliente')
        .eq('cliente_key', clienteKey)
        .limit(1)
      const row = data?.[0]
      if (row) {
        skus = parseSkuDetalle(row.sku_detalle)
        oferta = oferta || row.oferta_real
        productos_top = productos_top || row.productos_top
      }
    }

    // Cartera por nombre (canales sin key alineada)
    if (!skus.length && fromGer) {
      const nom = fromGer.nombre_cliente || fromGer.razon_social || fromGer.nombre
      if (nom) {
        const { data } = await supabase
          .from('cartera')
          .select('sku_detalle,oferta_real,productos_top,cliente_key,nombre_cliente,razon_social')
          .ilike('nombre_cliente', `%${String(nom).slice(0, 40)}%`)
          .limit(3)
        const row = (data || []).find(r => parseSkuDetalle(r.sku_detalle).length) || data?.[0]
        if (row) {
          skus = parseSkuDetalle(row.sku_detalle)
          oferta = oferta || row.oferta_real
          productos_top = productos_top || row.productos_top
        }
      }
    }

    // Fallback ventas_lineas — probar cliente_key y variantes
    if (!skus.length) {
      const keys = [clienteKey]
      if (fromGer?.rut) keys.push(String(fromGer.rut))
      if (fromGer?.cliente_key && fromGer.cliente_key !== clienteKey) keys.push(String(fromGer.cliente_key))
      // RUT sin dígito verificador
      const base = String(clienteKey).replace(/-.*$/, '')
      if (base && base !== clienteKey) keys.push(base)

      for (const k of keys) {
        if (skus.length) break
        try {
          const { data: vl } = await supabase
            .from('ventas_lineas')
            .select('producto_nombre,sku_canon,venta_neta_clp,cantidad_unidad,cliente_key')
            .eq('cliente_key', k)
            .order('venta_neta_clp', { ascending: false })
            .limit(80)
          if (vl?.length) {
            const agg = {}
            for (const r of vl) {
              const n = r.producto_nombre || r.sku_canon
              if (!n) continue
              if (!agg[n]) agg[n] = { nombre: n, clpMtd: 0, udMtd: 0, promClp: 0, promUd: 0 }
              agg[n].clpMtd += Number(r.venta_neta_clp) || 0
              agg[n].udMtd += Number(r.cantidad_unidad) || 0
            }
            skus = Object.values(agg)
              .sort((a, b) => b.clpMtd - a.clpMtd)
              .slice(0, 12)
              .map(s => ({ ...s, promClp: s.clpMtd, promUd: s.udMtd, cicloDias: null, ultima: null }))
          }
        } catch {
          /* tabla no expuesta / RLS */
        }
      }
    }

    setCliSku(prev => ({
      ...prev,
      [clienteKey]: {
        loading: false,
        skus,
        oferta,
        productos_top,
        venta_mtd: fromGer?.venta_mtd,
        dias_sin_comprar: null,
        ultima_compra: null,
        fuente: skus.length
          ? (fromGer?.sku_detalle ? 'gerencia' : productos_top ? 'top' : 'ventas')
          : null,
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
              {/* Si es el mes actual (o el más reciente), mostrar peso por ejecutivo */}
              {String(mesSelRow.mes).slice(0, 7) === String(tendencia12[tendencia12.length - 1]?.mes || '').slice(0, 7) ? (
                <>
                  <div className="card-label" style={{ marginTop: 8 }}>Contribución por ejecutivo / canal (mes en curso)</div>
                  {participacion.slice(0, 12).map(p => (
                    <div key={p.ejecutivo} style={{ marginTop: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                        <span style={{ fontWeight: 700 }}>
                          {p.ejecutivo}
                          {p.terreno && <span className="muted" style={{ fontWeight: 500, marginLeft: 6 }}>terreno</span>}
                        </span>
                        <span><b>{p.pct}%</b> · {money(p.venta)}</span>
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
                  <p className="muted" style={{ fontSize: 11, marginTop: 12 }}>
                    Histórico por ejecutivo mes a mes requiere tabla de ventas por canal por mes. Hoy el desglose está disponible para el mes en curso.
                  </p>
                </>
              ) : (
                <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
                  Total compañía del mes. El desglose por ejecutivo está disponible al seleccionar el mes en curso.
                </p>
              )}
            </div>
          </div>
        )}

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
                                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                                        <div style={{ fontWeight: 600 }}>{s.nombre}</div>
                                        <div style={{ fontWeight: 800, fontSize: 12, color: pct >= 100 ? '#15803d' : pct >= 50 ? '#b45309' : '#b91c1c' }}>{pct}%</div>
                                      </div>
                                      <div style={{ marginTop: 4, height: 5, borderRadius: 999, background: '#f5f5f4', overflow: 'hidden' }}>
                                        <div style={{ width: Math.min(100, Math.max(0, pct)) + '%', height: '100%', borderRadius: 999, background: pct >= 100 ? '#22c55e' : pct >= 50 ? '#f59e0b' : '#ef4444' }} />
                                      </div>
                                      <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>
                                        Mes {fmtStock(s.udMtd)} ud · {money(s.clpMtd)} · prom {fmtStock(s.promUd)} · {money(s.promClp)}
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
                                    Sin mix disponible (ni en gerencia_clientes, cartera ni ventas_lineas).
                                    Revisá que el ciclo cargue sku_detalle o productos_top para este canal.
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
                                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                                        <div style={{ fontWeight: 600 }}>{s.nombre}</div>
                                        <div style={{ fontWeight: 800, fontSize: 12, color: pct >= 100 ? '#15803d' : pct >= 50 ? '#b45309' : '#b91c1c' }}>{pct}%</div>
                                      </div>
                                      <div style={{ marginTop: 4, height: 5, borderRadius: 999, background: '#f5f5f4', overflow: 'hidden' }}>
                                        <div style={{ width: Math.min(100, Math.max(0, pct)) + '%', height: '100%', borderRadius: 999, background: pct >= 100 ? '#22c55e' : pct >= 50 ? '#f59e0b' : '#ef4444' }} />
                                      </div>
                                      <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>
                                        Mes {fmtStock(s.udMtd)} ud · {money(s.clpMtd)} · prom {fmtStock(s.promUd)} · {money(s.promClp)}
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
                                  <div className="muted" style={{ fontSize: 12, lineHeight: 1.4 }}>
                                    Sin mix disponible (ni en gerencia_clientes, cartera ni ventas_lineas).
                                    Revisá que el ciclo cargue sku_detalle o productos_top para este canal.
                                  </div>
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
