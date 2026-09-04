/**
 * ZONAS, EJECUTIVOS Y METAS — desde el dashboard.
 *
 * POR QUÉ ESTO EXISTE
 * Las zonas estaban escritas a mano en **10 archivos** de código. Para
 * agregar un vendedor y pasar a norte/sur/este/oeste había que editar y
 * desplegar. Y para vender a una segunda empresa —con sus propias
 * zonas— habría que mantener una versión del código por cliente.
 *
 * Eso es lo que realmente bloquea la replicación, más que cualquier
 * detalle visual.
 *
 * Ahora las zonas son DATOS: gerencia las crea, renombra, colorea y les
 * pone meta desde acá. Requiere `sql/42_ZONAS_CONFIGURABLES.sql`.
 *
 * RENOMBRAR ARRASTRA TODO
 * Cambiar NOR-ORIENTE por NORTE tiene que mover cartera, prospectos,
 * ejecutivos, comunas y metas. Si se hace a mano queda a medias y los
 * clientes desaparecen de la vista de su vendedor — el mismo bug de
 * zona/comuna contradictoria que ya nos costó caro.
 * Por eso lo hace `renombrar_zona()` en una sola transacción.
 */
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase.js'
import { safeSelect } from '../lib/query.js'
import { mensajeDeError } from '../lib/erroresUsuario.js'

const clp = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-CL')
const periodoActual = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

export function PanelZonas({ onFlash }) {
  const [zonas, setZonas] = useState([])
  const [ejecutivos, setEjecutivos] = useState([])
  const [metas, setMetas] = useState({})
  const [cargando, setCargando] = useState(true)
  const [err, setErr] = useState(null)
  const [editando, setEditando] = useState(null)
  const [nueva, setNueva] = useState('')
  const [guardando, setGuardando] = useState(false)

  const cargar = useCallback(async () => {
    setCargando(true)
    const [rz, re, rm] = await Promise.all([
      safeSelect(supabase.from('zonas').select('*').order('orden'), { label: 'zonas' }),
      safeSelect(
        supabase.from('ejecutivos').select('id,nombre,email,zona,rol,activo').order('zona'),
        { label: 'ejecutivos' }
      ),
      safeSelect(
        supabase.from('metas_zona').select('*').eq('periodo', periodoActual()),
        { label: 'metas' }
      ),
    ])

    if (!rz.ok) {
      // Sin la tabla, la pantalla lo dice en vez de mostrarse vacía.
      setErr(
        String(rz.error?.code) === '42P01'
          ? 'Falta correr sql/42_ZONAS_CONFIGURABLES.sql en Supabase.'
          : mensajeDeError(rz.error)
      )
      setCargando(false)
      return
    }
    setErr(null)
    setZonas(rz.rows)
    if (re.ok) setEjecutivos(re.rows)
    if (rm.ok) {
      const m = {}
      rm.rows.forEach((x) => { m[x.zona_id] = Number(x.meta_clp) || 0 })
      setMetas(m)
    }
    setCargando(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  /** Renombrar arrastra cartera, prospectos, ejecutivos y metas. */
  async function renombrar(zona, nuevoId, nuevoNombre) {
    if (!nuevoId || nuevoId === zona.id) { setEditando(null); return }
    setGuardando(true)
    const { data, error } = await supabase.rpc('renombrar_zona', {
      p_zona_vieja: zona.id,
      p_zona_nueva: nuevoId.toUpperCase().trim(),
      p_nombre: nuevoNombre || null,
      p_color: zona.color,
    })
    setGuardando(false)
    setEditando(null)
    if (error) { onFlash?.(mensajeDeError(error), 'error'); return }
    if (!data?.ok) { onFlash?.(data?.error || 'No se pudo renombrar', 'error'); return }
    onFlash?.(
      `${zona.id} → ${nuevoId}: ${data.cartera} clientes, ` +
      `${data.prospectos} prospectos, ${data.ejecutivos} ejecutivos`,
      'ok'
    )
    cargar()
  }

  async function crearZona() {
    const id = nueva.toUpperCase().trim()
    if (!id) return
    setGuardando(true)
    const { error } = await supabase.from('zonas').insert({
      id,
      nombre: id.charAt(0) + id.slice(1).toLowerCase(),
      nombre_corto: id,
      color: '#c2410c',
      orden: zonas.length + 1,
    })
    setGuardando(false)
    if (error) { onFlash?.(mensajeDeError(error), 'error'); return }
    setNueva('')
    onFlash?.(`Zona ${id} creada`, 'ok')
    cargar()
  }

  async function guardarMeta(zonaId, valor) {
    const meta = Number(String(valor).replace(/[^0-9]/g, '')) || 0
    const { error } = await supabase.from('metas_zona').upsert(
      { zona_id: zonaId, periodo: periodoActual(), meta_clp: meta },
      { onConflict: 'zona_id,periodo' }
    )
    if (error) { onFlash?.(mensajeDeError(error), 'error'); return }
    setMetas((p) => ({ ...p, [zonaId]: meta }))
    onFlash?.(`Meta de ${zonaId}: ${clp(meta)}`, 'ok')
  }

  async function moverEjecutivo(ej, zonaId) {
    const { error } = await supabase
      .from('ejecutivos')
      .update({ zona: zonaId, zona_id: zonaId })
      .eq('id', ej.id)
    if (error) { onFlash?.(mensajeDeError(error), 'error'); return }
    setEjecutivos((p) => p.map((x) => (x.id === ej.id ? { ...x, zona: zonaId } : x)))
    onFlash?.(`${ej.nombre} → ${zonaId}`, 'ok')
  }

  if (cargando) return <p className="dg-sub-nota">Cargando zonas…</p>
  if (err) return <div className="dg-errores"><strong>{err}</strong></div>

  const terreno = zonas.filter((z) => z.es_terreno !== false)

  return (
    <div className="dg-sub">
      <p className="dg-sub-nota">
        Las zonas son <strong>datos, no código</strong>. Cambiarlas acá mueve
        cartera, prospectos y ejecutivos en una sola operación — no hay que
        desplegar nada.
      </p>

      {/* ── Zonas ─────────────────────────────────────────── */}
      <table className="dg-tabla">
        <thead>
          <tr>
            <th>Zona</th>
            <th className="dg-num">Ejecutivos</th>
            <th className="dg-num">Meta del mes</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {terreno.map((z) => {
            const n = ejecutivos.filter((e) => e.zona === z.id).length
            const enEdicion = editando === z.id
            return (
              <tr key={z.id}>
                <td>
                  <span
                    className="dg-zona-punto"
                    style={{ background: z.color }}
                    aria-hidden="true"
                  />
                  {enEdicion ? (
                    <input
                      className="dg-buscar dg-inline"
                      defaultValue={z.id}
                      autoFocus
                      disabled={guardando}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') renombrar(z, e.currentTarget.value)
                        if (e.key === 'Escape') setEditando(null)
                      }}
                      onBlur={(e) => renombrar(z, e.currentTarget.value)}
                    />
                  ) : (
                    <strong>{z.id}</strong>
                  )}
                </td>
                <td className="dg-num">{n}</td>
                <td className="dg-num">
                  <input
                    className="dg-buscar dg-inline dg-num"
                    defaultValue={metas[z.id] || ''}
                    placeholder="sin meta"
                    inputMode="numeric"
                    onBlur={(e) => guardarMeta(z.id, e.currentTarget.value)}
                  />
                </td>
                <td className="dg-num">
                  <button
                    type="button"
                    className="dg-btn"
                    onClick={() => setEditando(enEdicion ? null : z.id)}
                  >
                    {enEdicion ? 'Cancelar' : 'Renombrar'}
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <div className="dg-sub-botones">
        <input
          className="dg-buscar"
          placeholder="Nueva zona: NORTE, SUR, ESTE, OESTE…"
          value={nueva}
          onChange={(e) => setNueva(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && crearZona()}
        />
        <button type="button" className="dg-btn dg-btn-primary"
                disabled={!nueva.trim() || guardando} onClick={crearZona}>
          Crear zona
        </button>
      </div>

      {/* ── Ejecutivos ────────────────────────────────────── */}
      <h3 className="dg-sub-titulo">Ejecutivos</h3>
      <p className="dg-sub-nota">
        Mover un ejecutivo de zona cambia qué cartera ve al abrir la app.
        Los clientes se reasignan según la <strong>maestra</strong> en la
        próxima corrida del ciclo.
      </p>
      <table className="dg-tabla">
        <thead>
          <tr><th>Ejecutivo</th><th>Rol</th><th>Zona</th></tr>
        </thead>
        <tbody>
          {ejecutivos.map((e) => (
            <tr key={e.id}>
              <td>
                {e.nombre || '—'}
                <span className="dg-sub-mail">{e.email}</span>
              </td>
              <td>{e.rol || 'vendedor'}</td>
              <td>
                <select
                  className="dg-select"
                  value={e.zona || ''}
                  onChange={(ev) => moverEjecutivo(e, ev.target.value)}
                >
                  <option value="">Sin zona</option>
                  {zonas.map((z) => (
                    <option key={z.id} value={z.id}>{z.id}</option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="dg-sub-nota dg-sub-aviso">
        Para <strong>agregar un ejecutivo nuevo</strong> hace falta crearle el
        usuario en Supabase (Authentication → Add user) y después aparece acá
        para asignarle zona. La app no puede crear usuarios: eso necesita la
        clave de servicio, que nunca debe salir del servidor.
      </p>
    </div>
  )
}

export default PanelZonas
