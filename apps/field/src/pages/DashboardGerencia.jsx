import '../styles/dashboard.css'
/**
 * DASHBOARD DE GERENCIA — pantalla grande, negocio completo.
 *
 * QUÉ ES Y QUÉ NO ES
 * NO es `/gerencia`, que es la vista móvil del terreno. Este es el
 * tablero que el gerente mira en una pantalla de 30 pulgadas y que
 * muestra TODO el negocio: KAM, Televenta, Corporativo y las tres
 * zonas de terreno.
 *
 * Se pidió desde el principio y se confundió con la vista móvil. Acá
 * está el que corresponde.
 *
 * DE DÓNDE SALE EL DATO
 * `gerencia_clientes`, que el ciclo llena con TODA la maestra:
 *
 *   ejecutivo · canal · cliente_key · nombre_cliente · comuna
 *   venta_mtd · pct_zona · sku_detalle · productos_top · oferta_real
 *
 * **La maestra reparte las ventas.** El canal de cada cliente sale de
 * ahí — nunca del código de vendedor de la factura, que puede decir
 * VENDEDOR_07 y no significa nada comercial.
 *
 * IDENTIDAD
 * Negro + lima, que es Black Sheep. El naranja es de KeyFoods y es un
 * tenant: acá no va. El gerente ve la plataforma, no un tenant.
 */
import { useEffect, useMemo, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase.js'
import { traerTodo } from '../lib/traerTodo.js'
import { mensajeDeError } from '../lib/erroresUsuario.js'
import { AccionesGerencia } from '../domain/AccionesGerencia.jsx'
import CargaArchivos from '../domain/CargaArchivos.jsx'
import { useParams, useNavigate } from 'react-router-dom'
import { loadSavedTenantId } from '../lib/tenants.js'

const clp = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-CL')
const clpCorto = (n) => {
  const v = Number(n) || 0
  if (Math.abs(v) >= 1e9) return '$' + (v / 1e9).toFixed(1).replace('.', ',') + ' MM'
  if (Math.abs(v) >= 1e6) return '$' + (v / 1e6).toFixed(1).replace('.', ',') + ' M'
  if (Math.abs(v) >= 1e3) return '$' + Math.round(v / 1e3) + ' K'
  return clp(v)
}

/** Los canales de terreno tienen meta; los demás no. */
const ZONAS_TERRENO = new Set(['NOR-ORIENTE', 'NOR-PONIENTE', 'ZONA SUR'])

export default function DashboardGerencia({ seccion = null }) {
  const { empresa } = useParams()
  const navegar = useNavigate()
  // Si la URL trae empresa (/keyfoods/dashboard) manda esa; si no, la
  // sesión. Así el mismo componente sirve para una instalación de un
  // solo tenant y para el modo multi-empresa.
  const tenantId = empresa || loadSavedTenantId() || 'keyfoods'
  const [vista, setVista] = useState(seccion || 'tablero')
  const [rows, setRows] = useState([])
  const [metas, setMetas] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [detalle, setDetalle] = useState(null)   // canal abierto
  const [aviso, setAviso] = useState(null)

  // La URL canónica lleva la empresa: /keyfoods/dashboard.
  // Si se entró por /dashboard a secas, se reescribe — así el gerente
  // puede compartir el link y cada cliente tiene el suyo propio, que
  // es lo que hace falta para replicar a otras empresas.
  useEffect(() => {
    if (!empresa && tenantId) {
      const cola = seccion === 'datos' ? 'datos' : 'dashboard'
      navegar(`/${tenantId}/${cola}`, { replace: true })
    }
  }, [empresa, tenantId, seccion, navegar])

  const cargar = useCallback(async () => {
    setLoading(true)
    const [rg, rm] = await Promise.all([
      traerTodo(
        (d, h) => supabase
          .from('gerencia_clientes')
          .select('ejecutivo,canal,cliente_key,nombre_cliente,comuna,venta_mtd,productos_top')
          .order('venta_mtd', { ascending: false, nullsFirst: false })
          .range(d, h),
        { label: 'dashboard_gerencia' }
      ),
      traerTodo(
        (d, h) => supabase.from('gerencia').select('*').range(d, h),
        { label: 'metas_zona' }
      ),
    ])

    if (!rg.ok) { setErr(mensajeDeError(rg.error)); setRows([]) }
    else { setErr(null); setRows(rg.rows) }
    if (rm.ok) setMetas(rm.rows)
    setLoading(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  /** Agrupación por canal — la maestra manda. */
  const porCanal = useMemo(() => {
    const m = new Map()
    for (const r of rows) {
      const canal = String(r.canal || 'NO_ASIGNADO').toUpperCase().trim()
      if (!m.has(canal)) {
        m.set(canal, { canal, venta: 0, clientes: 0, activos: 0, ejecutivos: new Map() })
      }
      const c = m.get(canal)
      const v = Number(r.venta_mtd) || 0
      c.venta += v
      c.clientes += 1
      if (v > 0) c.activos += 1

      const ej = String(r.ejecutivo || '—').trim()
      if (!c.ejecutivos.has(ej)) c.ejecutivos.set(ej, { ejecutivo: ej, venta: 0, clientes: 0, activos: 0 })
      const e = c.ejecutivos.get(ej)
      e.venta += v
      e.clientes += 1
      if (v > 0) e.activos += 1
    }
    return [...m.values()].sort((a, b) => b.venta - a.venta)
  }, [rows])

  const total = useMemo(() => porCanal.reduce((s, c) => s + c.venta, 0), [porCanal])

  const metaPorZona = useMemo(() => {
    const m = new Map()
    for (const g of metas) {
      const z = String(g.zona || g.zona_comercial || '').toUpperCase().trim()
      if (z) m.set(z, Number(g.meta_mensual ?? g.meta ?? 0) || 0)
    }
    return m
  }, [metas])

  const terreno = useMemo(() => {
    const c = porCanal.filter((x) => ZONAS_TERRENO.has(x.canal))
    return {
      venta: c.reduce((s, x) => s + x.venta, 0),
      meta: [...ZONAS_TERRENO].reduce((s, z) => s + (metaPorZona.get(z) || 0), 0),
    }
  }, [porCanal, metaPorZona])

  const sinAsignar = porCanal.find((c) => c.canal === 'NO_ASIGNADO')

  if (loading) return <div className="dg-boot">Cargando el negocio completo…</div>
  if (err) return <div className="dg-error">{err}</div>

  return (
    <div className="dg">
      <header className="dg-head">
        <div>
          <p className="dg-kicker">Black Sheep · Dashboard</p>
          <h1 className="dg-title">El negocio completo</h1>
        </div>
        <nav className="dg-tabs">
          <button
            type="button"
            className={'dg-tab' + (vista === 'tablero' ? ' is-on' : '')}
            onClick={() => setVista('tablero')}
          >
            Tablero
          </button>
          <button
            type="button"
            className={'dg-tab' + (vista === 'datos' ? ' is-on' : '')}
            onClick={() => setVista('datos')}
          >
            Cargar datos
          </button>
        </nav>

        <div className="dg-head-total">
          <span className="dg-head-label">Venta del mes · todos los canales</span>
          <strong className="dg-head-monto">{clp(total)}</strong>
        </div>
      </header>

      {vista === 'datos' && (
        <CargaArchivos
          tenantId={tenantId}
          onListo={() => { setVista('tablero'); cargar() }}
        />
      )}

      {vista === 'tablero' && (<>

      {/* Fila 1 · los números que definen el mes */}
      <section className="dg-kpis">
        <article className="dg-kpi">
          <span className="dg-kpi-label">Terreno</span>
          <strong className="dg-kpi-valor">{clpCorto(terreno.venta)}</strong>
          <span className="dg-kpi-pie">
            {terreno.meta > 0
              ? `${Math.round((terreno.venta / terreno.meta) * 100)}% de ${clpCorto(terreno.meta)}`
              : 'sin meta cargada'}
          </span>
        </article>
        <article className="dg-kpi">
          <span className="dg-kpi-label">Otros canales</span>
          <strong className="dg-kpi-valor">{clpCorto(total - terreno.venta)}</strong>
          <span className="dg-kpi-pie">
            {total > 0 ? `${Math.round(((total - terreno.venta) / total) * 100)}% del total` : '—'}
          </span>
        </article>
        <article className="dg-kpi">
          <span className="dg-kpi-label">Clientes con venta</span>
          <strong className="dg-kpi-valor">
            {porCanal.reduce((s, c) => s + c.activos, 0).toLocaleString('es-CL')}
          </strong>
          <span className="dg-kpi-pie">
            de {rows.length.toLocaleString('es-CL')} en la maestra
          </span>
        </article>
        <article className={'dg-kpi' + (sinAsignar?.venta > 0 ? ' is-alert' : '')}>
          <span className="dg-kpi-label">Sin canal en maestra</span>
          <strong className="dg-kpi-valor">{clpCorto(sinAsignar?.venta || 0)}</strong>
          <span className="dg-kpi-pie">
            {sinAsignar?.clientes || 0} clientes por asignar
          </span>
        </article>
      </section>

      {/* Fila 2 · el reparto por canal, que es lo que define la maestra */}
      <section className="dg-panel">
        <header className="dg-panel-head">
          <h2>Venta por canal</h2>
          <span className="dg-panel-nota">La maestra define a qué canal va cada cliente</span>
        </header>

        <div className="dg-barras">
          {porCanal.map((c) => {
            const pct = total > 0 ? (c.venta / total) * 100 : 0
            const meta = metaPorZona.get(c.canal) || 0
            const avance = meta > 0 ? Math.round((c.venta / meta) * 100) : null
            return (
              <button
                key={c.canal}
                type="button"
                className={'dg-barra' + (detalle === c.canal ? ' is-open' : '')
                          + (c.canal === 'NO_ASIGNADO' ? ' is-alert' : '')}
                onClick={() => setDetalle(detalle === c.canal ? null : c.canal)}
              >
                <span className="dg-barra-nombre">{c.canal}</span>
                <span className="dg-barra-track">
                  <i style={{ width: `${Math.max(1.5, pct)}%` }} />
                </span>
                <span className="dg-barra-monto">{clpCorto(c.venta)}</span>
                <span className="dg-barra-pct">{pct.toFixed(1)}%</span>
                <span className={'dg-barra-meta' + (avance !== null && avance < 80 ? ' is-bajo' : '')}>
                  {avance !== null ? `${avance}% meta` : '—'}
                </span>
                <span className="dg-barra-clientes">
                  {c.activos}/{c.clientes}
                </span>
              </button>
            )
          })}
        </div>
      </section>

      {/* Fila 3 · al abrir un canal, sus ejecutivos */}
      {detalle && (
        <section className="dg-panel">
          <header className="dg-panel-head">
            <h2>{detalle} · por ejecutivo</h2>
            <button type="button" className="dg-cerrar" onClick={() => setDetalle(null)}>
              Cerrar
            </button>
          </header>
          <table className="dg-tabla">
            <thead>
              <tr>
                <th>Ejecutivo</th>
                <th className="dg-num">Venta del mes</th>
                <th className="dg-num">Clientes</th>
                <th className="dg-num">Con venta</th>
                <th className="dg-num">Cobertura</th>
              </tr>
            </thead>
            <tbody>
              {[...(porCanal.find((c) => c.canal === detalle)?.ejecutivos.values() || [])]
                .sort((a, b) => b.venta - a.venta)
                .map((e) => {
                  const cob = e.clientes > 0 ? Math.round((e.activos / e.clientes) * 100) : 0
                  return (
                    <tr key={e.ejecutivo}>
                      <td>{e.ejecutivo}</td>
                      <td className="dg-num dg-fuerte">{clp(e.venta)}</td>
                      <td className="dg-num">{e.clientes}</td>
                      <td className="dg-num">{e.activos}</td>
                      <td className={'dg-num' + (cob < 40 ? ' is-bajo' : '')}>{cob}%</td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </section>
      )}

      {/* Gerencia no sólo mira: acá opera. Bajar la data, cambiar la
          lista de precios, mover prospectos. */}
      <AccionesGerencia rows={rows} onFlash={(m, t) => setAviso({ msg: m, tipo: t })} />

      {aviso && (
        <div className={'dg-aviso' + (aviso.tipo === 'error' ? ' is-mal' : '')}
             onAnimationEnd={() => setAviso(null)}>
          {aviso.msg}
        </div>
      )}

      </>)}

      <footer className="dg-foot">
        <span>{rows.length.toLocaleString('es-CL')} clientes en la maestra · {porCanal.length} canales</span>
        <button type="button" className="dg-refrescar" onClick={cargar}>Actualizar</button>
      </footer>
    </div>
  )
}
