/**
 * ACCIONES DEL DASHBOARD — donde gerencia opera, no sólo mira.
 *
 * POR QUÉ ESTO EXISTE
 * El dashboard mostraba el negocio y no dejaba hacer nada con él. Todo
 * lo operativo vivía en Admin, que es móvil, o directamente sin
 * cablear: `catalogControlCenter.js` tenía 175 líneas de diff,
 * validación y plan de aplicación, con tests, y **ninguna pantalla lo
 * usaba** desde V11.4.
 *
 * Acá se conecta lo que ya estaba escrito:
 *   · exportCsv.js            → bajar la data a Excel
 *   · catalogControlCenter.js → cambiar la lista de precios
 *   · TabProspectos           → mover prospectos entre ejecutivos
 *
 * LA REGLA DE LOS CAMBIOS MASIVOS
 * Nada se escribe sin que el gerente vea ANTES qué va a pasar. Un CSV
 * mal armado que entra directo arruina la lista de precios de 400 SKU
 * sin vuelta atrás. Por eso: previsualizar → diferencia → confirmar.
 */
import { useState, useCallback, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'
import { exportCsv, stampDate } from '../lib/exportCsv.js'
import { parseCsv } from '../lib/csv.js'
import {
  normalizeRow, validateCatalogRows, diffCatalog, buildApplyPlan,
} from '../lib/catalogControlCenter.js'
import { traerTodo } from '../lib/traerTodo.js'
import { mensajeDeError } from '../lib/erroresUsuario.js'
import { TabProspectos } from './TabProspectos.jsx'
import { PanelZonas } from './PanelZonas.jsx'
import { AsignarClientes } from './AsignarClientes.jsx'

const clp = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-CL')

export function AccionesGerencia({ rows, onFlash }) {
  const [panel, setPanel] = useState(null)

  return (
    <section className="dg-panel">
      <header className="dg-panel-head">
        <h2>Acciones</h2>
        <span className="dg-panel-nota">Todo lo que gerencia puede cambiar desde acá</span>
      </header>

      <div className="dg-acciones">
        <button
          type="button"
          className={'dg-accion' + (panel === 'datos' ? ' is-on' : '')}
          onClick={() => setPanel(panel === 'datos' ? null : 'datos')}
        >
          <strong>Bajar a Excel</strong>
          <span>Negocio, cartera, stock y pedidos</span>
        </button>
        <button
          type="button"
          className={'dg-accion' + (panel === 'asignar' ? ' is-on' : '')}
          onClick={() => setPanel(panel === 'asignar' ? null : 'asignar')}
        >
          <strong>Clientes sin asignar</strong>
          <span>Nuevos y sin canal · repartir a carteras</span>
        </button>
        <button
          type="button"
          className={'dg-accion' + (panel === 'precios' ? ' is-on' : '')}
          onClick={() => setPanel(panel === 'precios' ? null : 'precios')}
        >
          <strong>Lista de precios</strong>
          <span>Cambiar precios · sumar o sacar productos</span>
        </button>
        <button
          type="button"
          className={'dg-accion' + (panel === 'zonas' ? ' is-on' : '')}
          onClick={() => setPanel(panel === 'zonas' ? null : 'zonas')}
        >
          <strong>Zonas y ejecutivos</strong>
          <span>Crear · renombrar · metas · asignar</span>
        </button>
        <button
          type="button"
          className={'dg-accion' + (panel === 'prospectos' ? ' is-on' : '')}
          onClick={() => setPanel(panel === 'prospectos' ? null : 'prospectos')}
        >
          <strong>Prospectos</strong>
          <span>Mover entre ejecutivos · arreglar zonas</span>
        </button>
      </div>

      {panel === 'datos'      && <PanelExportar rows={rows} onFlash={onFlash} />}
      {panel === 'asignar'    && <AsignarClientes onFlash={onFlash} />}
      {panel === 'precios'    && <PanelPrecios onFlash={onFlash} />}
      {panel === 'asignar'    && <PanelAsignar rows={rows} onFlash={onFlash} />}
      {panel === 'zonas'      && <PanelZonas onFlash={onFlash} />}
      {panel === 'prospectos' && (
        <div className="dg-panel-embed"><TabProspectos onFlash={onFlash} /></div>
      )}
    </section>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   BAJAR A EXCEL
   ═══════════════════════════════════════════════════════════════════ */
function PanelExportar({ rows, onFlash }) {
  const [bajando, setBajando] = useState(null)

  const bajarNegocio = useCallback(() => {
    exportCsv(`negocio_${stampDate()}.csv`, rows, [
      { key: 'canal', label: 'Canal' },
      { key: 'ejecutivo', label: 'Ejecutivo' },
      { key: 'cliente_key', label: 'RUT' },
      { key: 'nombre_cliente', label: 'Cliente' },
      { key: 'comuna', label: 'Comuna' },
      { key: 'venta_mtd', label: 'Venta del mes' },
    ])
    onFlash?.(`${rows.length} filas bajadas`, 'ok')
  }, [rows, onFlash])

  const bajarTabla = useCallback(async (tabla, nombre) => {
    setBajando(tabla)
    const r = await traerTodo(
      (d, h) => supabase.from(tabla).select('*').range(d, h),
      { label: `export_${tabla}` }
    )
    setBajando(null)
    if (!r.ok) { onFlash?.(mensajeDeError(r.error), 'error'); return }
    if (!r.rows.length) { onFlash?.(`${nombre} está vacía`, 'error'); return }

    // Sin lista de columnas: se usan las de la primera fila. Así el
    // export no se rompe cuando el ciclo agrega una columna nueva.
    const cols = Object.keys(r.rows[0]).map((k) => ({ key: k, label: k }))
    exportCsv(`${tabla}_${stampDate()}.csv`, r.rows, cols)
    onFlash?.(`${r.rows.length} filas de ${nombre}`, 'ok')
  }, [onFlash])

  return (
    <div className="dg-sub">
      <p className="dg-sub-nota">
        Se baja <strong>todo</strong>, no la primera página: usa paginación, así
        que 3.870 clientes salen 3.870, no 1.000.
      </p>
      <div className="dg-sub-botones">
        <button type="button" className="dg-btn" onClick={bajarNegocio}>
          Negocio por canal ({rows.length})
        </button>
        <button type="button" className="dg-btn" disabled={bajando === 'cartera'}
                onClick={() => bajarTabla('cartera', 'cartera')}>
          {bajando === 'cartera' ? 'Bajando…' : 'Cartera'}
        </button>
        <button type="button" className="dg-btn" disabled={bajando === 'stock'}
                onClick={() => bajarTabla('stock', 'stock')}>
          {bajando === 'stock' ? 'Bajando…' : 'Stock y precios'}
        </button>
        <button type="button" className="dg-btn" disabled={bajando === 'pedidos'}
                onClick={() => bajarTabla('pedidos', 'pedidos')}>
          {bajando === 'pedidos' ? 'Bajando…' : 'Pedidos'}
        </button>
        <button type="button" className="dg-btn" disabled={bajando === 'prospectos'}
                onClick={() => bajarTabla('prospectos', 'prospectos')}>
          {bajando === 'prospectos' ? 'Bajando…' : 'Prospectos'}
        </button>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   CLIENTES SIN ASIGNAR · mandarlos a una cartera
   ═══════════════════════════════════════════════════════════════════ */
function PanelAsignar({ rows, onFlash }) {
  const [ejecutivos, setEjecutivos] = useState([])
  const [q, setQ] = useState('')
  const [guardando, setGuardando] = useState(null)
  const [asignados, setAsignados] = useState({})

  useEffect(() => {
    supabase.from('ejecutivos').select('id, nombre, zona').order('zona')
      .then(({ data }) => setEjecutivos(data || []))
  }, [])

  // Sin canal en la maestra = nadie los trabaja. Los de más venta
  // primero: son los que más cuesta dejar sin dueño.
  const sinDuenio = rows
    .filter((r) => {
      const c = String(r.canal || '').toUpperCase().trim()
      return !c || c === 'NO_ASIGNADO' || c === 'OTROS'
    })
    .filter((r) => !asignados[r.cliente_key])
    .sort((a, b) => (Number(b.venta_mtd) || 0) - (Number(a.venta_mtd) || 0))

  const vista = q.trim()
    ? sinDuenio.filter((r) =>
        `${r.nombre_cliente} ${r.comuna}`.toLowerCase().includes(q.toLowerCase()))
    : sinDuenio.slice(0, 60)

  async function asignar(cli, ejecutivoId) {
    if (!ejecutivoId) return
    setGuardando(cli.cliente_key)
    const ej = ejecutivos.find((e) => String(e.id) === String(ejecutivoId))

    // Se escribe en cartera, que es lo que la app lee. La maestra es la
    // fuente de verdad, así que esto es un puente hasta la próxima
    // corrida del ciclo: hay que corregir la maestra también.
    const { error } = await supabase.from('cartera').upsert({
      cliente_key: cli.cliente_key,
      nombre_cliente: cli.nombre_cliente,
      comuna: cli.comuna,
      ejecutivo_id: ejecutivoId,
      zona: ej?.zona || null,
    }, { onConflict: 'ejecutivo_id,cliente_key' })

    setGuardando(null)
    if (error) { onFlash?.(mensajeDeError(error), 'error'); return }
    setAsignados((p) => ({ ...p, [cli.cliente_key]: ejecutivoId }))
    onFlash?.(`${cli.nombre_cliente} → ${ej?.nombre}`, 'ok')
  }

  const ventaSinDuenio = sinDuenio.reduce((s, r) => s + (Number(r.venta_mtd) || 0), 0)

  return (
    <div className="dg-sub">
      <p className="dg-sub-nota">
        <strong>{sinDuenio.length} clientes</strong> sin canal en la maestra,
        con <strong>{clp(ventaSinDuenio)}</strong> de venta este mes. Nadie los
        trabaja. Se listan por venta descendente: los de arriba son los que más
        cuesta dejar sin dueño.
      </p>
      <p className="dg-sub-nota dg-sub-aviso">
        Asignar acá escribe en <code>cartera</code> y el vendedor lo ve enseguida.
        Pero <strong>la maestra sigue siendo la fuente de verdad</strong>: si no la
        corregís, la próxima corrida del ciclo lo devuelve a sin asignar.
      </p>

      <input
        className="dg-buscar"
        placeholder="Buscar cliente o comuna…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      {vista.length === 0 ? (
        <p className="dg-sub-nota">No quedan clientes sin asignar.</p>
      ) : (
        <table className="dg-tabla">
          <thead>
            <tr>
              <th>Cliente</th><th>Comuna</th>
              <th className="dg-num">Venta del mes</th><th>Asignar a</th>
            </tr>
          </thead>
          <tbody>
            {vista.map((c) => (
              <tr key={c.cliente_key}>
                <td>{c.nombre_cliente || c.cliente_key}</td>
                <td>{c.comuna || '—'}</td>
                <td className="dg-num dg-fuerte">{clp(c.venta_mtd)}</td>
                <td>
                  <select
                    className="dg-select"
                    disabled={guardando === c.cliente_key}
                    defaultValue=""
                    onChange={(e) => asignar(c, e.target.value)}
                    aria-label={`Asignar ${c.nombre_cliente}`}
                  >
                    <option value="">Elegir ejecutivo…</option>
                    {ejecutivos.map((e) => (
                      <option key={e.id} value={e.id}>{e.nombre} · {e.zona}</option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   LISTA DE PRECIOS · previsualizar → diferencia → confirmar
   ═══════════════════════════════════════════════════════════════════ */
function PanelPrecios({ onFlash }) {
  const [plan, setPlan] = useState(null)
  const [errores, setErrores] = useState([])
  const [aplicando, setAplicando] = useState(false)
  const fileRef = useRef(null)

  const leerArchivo = useCallback(async (file) => {
    if (!file) return
    setPlan(null); setErrores([])

    const texto = await file.text()
    const filas = parseCsv(texto).map(normalizeRow)

    // Lo que hay hoy, para poder comparar.
    const actual = await traerTodo(
      (d, h) => supabase.from('stock')
        .select('sku_canon,producto_nombre,precio_unidad,precio_caja')
        .range(d, h),
      { label: 'stock_actual' }
    )
    if (!actual.ok) { onFlash?.(mensajeDeError(actual.error), 'error'); return }

    const skus = new Set(actual.rows.map((r) => String(r.sku_canon || '')))
    const val = validateCatalogRows(filas, skus)
    const diffs = diffCatalog(val.rows || filas, actual.rows)
    const p = buildApplyPlan(diffs, val.errors || [])

    setErrores(val.errors || [])
    setPlan(p)
  }, [onFlash])

  const aplicar = useCallback(async () => {
    if (!plan) return
    setAplicando(true)
    let ok = 0, fail = 0
    // De a 100: un lote grande que falla no dice cuál fila lo rompió.
    const items = [...(plan.updates || []), ...(plan.inserts || [])]
    for (let i = 0; i < items.length; i += 100) {
      const lote = items.slice(i, i + 100)
      const { error } = await supabase.from('stock').upsert(lote, { onConflict: 'sku_canon' })
      if (error) { fail += lote.length; console.error('[precios] lote falló', error) }
      else ok += lote.length
    }
    setAplicando(false)
    setPlan(null)
    if (fileRef.current) fileRef.current.value = ''
    onFlash?.(
      fail ? `${ok} aplicados, ${fail} fallaron` : `${ok} precios actualizados`,
      fail ? 'error' : 'ok'
    )
  }, [plan, onFlash])

  return (
    <div className="dg-sub">
      <p className="dg-sub-nota">
        Subí el CSV de la lista de precios. <strong>No se escribe nada</strong> hasta
        que veas la diferencia y confirmes: un archivo mal armado que entra
        directo arruina 400 SKU sin vuelta atrás.
      </p>

      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        className="dg-file"
        onChange={(e) => leerArchivo(e.target.files?.[0])}
      />

      {errores.length > 0 && (
        <div className="dg-errores">
          <strong>{errores.length} problema(s) en el archivo</strong>
          <ul>
            {errores.slice(0, 8).map((e, i) => (
              <li key={i}>Fila {e.row ?? '?'} · {e.code} {e.sku ? `· ${e.sku}` : ''}</li>
            ))}
          </ul>
          {errores.length > 8 && <span>…y {errores.length - 8} más</span>}
        </div>
      )}

      {plan && (
        <div className="dg-plan">
          <div className="dg-plan-nums">
            <span><strong>{plan.inserts?.length || 0}</strong> nuevos</span>
            <span><strong>{plan.updates?.length || 0}</strong> con cambio de precio</span>
            <span><strong>{plan.unchanged?.length || 0}</strong> sin cambios</span>
            {plan.blocked?.length > 0 && (
              <span className="is-mal"><strong>{plan.blocked.length}</strong> bloqueados</span>
            )}
          </div>

          {(plan.updates || []).slice(0, 10).length > 0 && (
            <table className="dg-tabla">
              <thead>
                <tr>
                  <th>SKU</th><th>Producto</th>
                  <th className="dg-num">Antes</th><th className="dg-num">Ahora</th>
                </tr>
              </thead>
              <tbody>
                {(plan.updates || []).slice(0, 10).map((u) => (
                  <tr key={u.sku_canon}>
                    <td>{u.sku_canon}</td>
                    <td>{u.producto_nombre || '—'}</td>
                    <td className="dg-num">{clp(u._antes ?? 0)}</td>
                    <td className="dg-num dg-fuerte">{clp(u.precio_unidad ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="dg-sub-botones">
            <button type="button" className="dg-btn dg-btn-primary"
                    disabled={aplicando || !((plan.updates?.length || 0) + (plan.inserts?.length || 0))}
                    onClick={aplicar}>
              {aplicando ? 'Aplicando…' : 'Confirmar y aplicar'}
            </button>
            <button type="button" className="dg-btn" onClick={() => { setPlan(null); setErrores([]) }}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default AccionesGerencia
