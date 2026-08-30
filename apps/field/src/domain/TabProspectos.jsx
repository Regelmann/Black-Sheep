/**
 * Prospectos — reasignar entre ejecutivos.
 *
 * POR QUÉ FALTABA
 * Admin tenía Clientes, Zonas, Precios, Metas y Focos, pero los
 * prospectos no se podían tocar desde ningún lado. Si uno quedaba mal
 * asignado —o con zona y comuna contradictorias, que es el caso que
 * hace que NO LO VEA NADIE— no había forma de arreglarlo sin SQL.
 *
 * Muestra primero los que nadie ve: es plata parada.
 */
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase.js'
import { safeSelect } from '../lib/query.js'
import { traerTodo } from '../lib/traerTodo.js'
import { normComuna, zonaFromComuna, zonaContradiceComuna } from '../lib/zonas.js'
import { mensajeDeError } from '../lib/erroresUsuario.js'

const money = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-CL')

export function TabProspectos({ onFlash }) {
  const [rows, setRows] = useState([])
  const [ejecutivos, setEjecutivos] = useState([])
  const [q, setQ] = useState('')
  const [filtro, setFiltro] = useState('problema')
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [guardando, setGuardando] = useState(null)

  const cargar = useCallback(async () => {
    setLoading(true)
    const [rp, re] = await Promise.all([
      traerTodo(
        (d, h) => supabase
          .from('prospectos')
          .select('cliente_key,nombre_cliente,comuna,zona,ejecutivo_id,score,potencial,estado')
          .order('score', { ascending: false, nullsFirst: false })
          .range(d, h),
        { label: 'prospectos_admin' }
      ),
      safeSelect(
        supabase.from('ejecutivos').select('id, nombre, zona').order('zona'),
        { label: 'ejecutivos' }
      ),
    ])

    if (!rp.ok) {
      setErr(mensajeDeError(rp.error))
      setRows([])
    } else {
      setErr(null)
      setRows(rp.rows)
    }
    if (re.ok) setEjecutivos(re.rows)
    setLoading(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  /** Reasigna Y alinea la zona, para no dejar la contradicción. */
  async function reasignar(p, ejecutivoId) {
    setGuardando(p.cliente_key)
    const ej = ejecutivos.find((e) => String(e.id) === String(ejecutivoId))
    const parche = { ejecutivo_id: ejecutivoId || null }

    // Si se asigna a un ejecutivo de otra zona, la zona de la fila se
    // actualiza también. Dejarla como estaba recrearía el bug de
    // "prospecto que no ve nadie".
    if (ej?.zona) parche.zona = ej.zona

    const { error } = await supabase
      .from('prospectos')
      .update(parche)
      .eq('cliente_key', p.cliente_key)

    setGuardando(null)
    if (error) { onFlash?.(mensajeDeError(error), 'error'); return }

    setRows((prev) => prev.map((x) =>
      x.cliente_key === p.cliente_key ? { ...x, ...parche } : x
    ))
    onFlash?.(`${p.nombre_cliente} → ${ej?.nombre || 'sin asignar'}`, 'ok')
  }

  /** Corrige la zona según la comuna, que es el dato de la maestra. */
  async function alinearZona(p) {
    const zona = zonaFromComuna(normComuna(p.comuna))
    if (!zona) { onFlash?.(`${p.comuna} no está en el catálogo de comunas`, 'error'); return }
    setGuardando(p.cliente_key)
    const { error } = await supabase
      .from('prospectos').update({ zona }).eq('cliente_key', p.cliente_key)
    setGuardando(null)
    if (error) { onFlash?.(mensajeDeError(error), 'error'); return }
    setRows((prev) => prev.map((x) =>
      x.cliente_key === p.cliente_key ? { ...x, zona } : x
    ))
    onFlash?.(`${p.nombre_cliente} → ${zona}`, 'ok')
  }

  const conProblema = rows.filter(zonaContradiceComuna)
  const sinAsignar = rows.filter((p) => !p.ejecutivo_id)

  const base = filtro === 'problema' ? conProblema
    : filtro === 'sin' ? sinAsignar
    : rows
  const vista = q.trim()
    ? base.filter((p) =>
        `${p.nombre_cliente} ${p.comuna}`.toLowerCase().includes(q.toLowerCase()))
    : base.slice(0, 200)

  if (loading) return <p className="bs-admin-loading">Cargando prospectos…</p>
  if (err) return <p className="bs-cache-error">{err}</p>

  return (
    <div className="bs-adm-pros">
      <div className="bs-adm-pros-stats">
        <button
          type="button"
          className={'bs-adm-stat' + (filtro === 'problema' ? ' is-on' : '') + (conProblema.length ? ' is-alert' : '')}
          onClick={() => setFiltro('problema')}
        >
          <strong>{conProblema.length}</strong>
          <span>No los ve nadie</span>
        </button>
        <button
          type="button"
          className={'bs-adm-stat' + (filtro === 'sin' ? ' is-on' : '')}
          onClick={() => setFiltro('sin')}
        >
          <strong>{sinAsignar.length}</strong>
          <span>Sin ejecutivo</span>
        </button>
        <button
          type="button"
          className={'bs-adm-stat' + (filtro === 'todos' ? ' is-on' : '')}
          onClick={() => setFiltro('todos')}
        >
          <strong>{rows.length}</strong>
          <span>Todos</span>
        </button>
      </div>

      {filtro === 'problema' && conProblema.length > 0 && (
        <p className="bs-adm-aviso">
          Estos prospectos tienen la <strong>zona</strong> en contradicción con su
          <strong> comuna</strong>. La consulta los trae por zona y el filtro los
          descarta por comuna: <strong>no los ve ningún vendedor.</strong>
        </p>
      )}

      <input
        className="bs-adm-buscar"
        placeholder="Buscar por nombre o comuna…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      {vista.length === 0 ? (
        <p className="bs-adm-vacio">
          {filtro === 'problema' ? 'Ningún prospecto con zona contradictoria.' : 'Sin resultados.'}
        </p>
      ) : (
        <ul className="bs-adm-pros-lista">
          {vista.map((p) => {
            const porComuna = zonaFromComuna(normComuna(p.comuna))
            const contradice = zonaContradiceComuna(p)
            return (
              <li key={p.cliente_key} className={'bs-adm-pros-row' + (contradice ? ' is-alert' : '')}>
                <div className="bs-adm-pros-info">
                  <strong>{p.nombre_cliente || p.cliente_key}</strong>
                  <span className="bs-adm-pros-meta">
                    {p.comuna || 'sin comuna'}
                    {p.potencial ? ` · ${money(p.potencial)}/mes` : ''}
                  </span>
                  {contradice && (
                    <span className="bs-adm-pros-conflicto">
                      dice <b>{p.zona}</b> pero {p.comuna} es <b>{porComuna}</b>
                    </span>
                  )}
                </div>

                <div className="bs-adm-pros-acciones">
                  {contradice && (
                    <button
                      type="button"
                      className="bs-adm-fix"
                      disabled={guardando === p.cliente_key}
                      onClick={() => alinearZona(p)}
                    >
                      Usar {porComuna}
                    </button>
                  )}
                  <select
                    className="bs-adm-select"
                    value={p.ejecutivo_id || ''}
                    disabled={guardando === p.cliente_key}
                    onChange={(e) => reasignar(p, e.target.value)}
                    aria-label={`Ejecutivo de ${p.nombre_cliente}`}
                  >
                    <option value="">Sin asignar</option>
                    {ejecutivos.map((e) => (
                      <option key={e.id} value={e.id}>{e.nombre} · {e.zona}</option>
                    ))}
                  </select>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export default TabProspectos
