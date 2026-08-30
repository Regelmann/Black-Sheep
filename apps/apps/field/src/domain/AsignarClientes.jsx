/**
 * Asignar clientes a carteras — desde el dashboard.
 *
 * EL PROBLEMA CONCRETO
 * En Gerencia se lee: "$25.591.645 (9%) sin zona en maestra · ver 58
 * clientes a asignar". Es un aviso: no se puede hacer nada con él.
 *
 * Son 25 millones facturados que la maestra no atribuye a nadie. Ningún
 * ejecutivo los ve en su cartera, nadie los visita, y no cuentan para
 * ninguna meta.
 *
 * Acá se asignan. Uno por uno o todos los de una comuna de una vez.
 */
import { useEffect, useMemo, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase.js'
import { traerTodo } from '../lib/traerTodo.js'
import { mensajeDeError } from '../lib/erroresUsuario.js'
import { normComuna, zonaFromComuna } from '../lib/zonas.js'

const clp = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-CL')

export function AsignarClientes({ onFlash }) {
  const [rows, setRows] = useState([])
  const [ejecutivos, setEjecutivos] = useState([])
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [guardando, setGuardando] = useState(null)

  const cargar = useCallback(async () => {
    setLoading(true)
    const [rc, re] = await Promise.all([
      traerTodo(
        (d, h) => supabase
          .from('gerencia_clientes')
          .select('cliente_key,nombre_cliente,comuna,canal,ejecutivo,venta_mtd')
          .order('venta_mtd', { ascending: false, nullsFirst: false })
          .range(d, h),
        { label: 'clientes_sin_asignar' }
      ),
      traerTodo(
        (d, h) => supabase.from('ejecutivos').select('id,nombre,zona').order('zona').range(d, h),
        { label: 'ejecutivos' }
      ),
    ])
    if (!rc.ok) { setErr(mensajeDeError(rc.error)); setRows([]) }
    else {
      setErr(null)
      // Sólo los que nadie tiene: es la lista accionable.
      setRows(rc.rows.filter((r) => {
        const c = String(r.canal || '').toUpperCase().trim()
        return !c || c === 'NO_ASIGNADO' || c === 'OTROS' || !r.ejecutivo || r.ejecutivo === '—'
      }))
    }
    if (re.ok) setEjecutivos(re.rows)
    setLoading(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  /** Asigna en `cartera`, que es donde el vendedor lee su lista. */
  async function asignar(cliente, ejecutivoId) {
    if (!ejecutivoId) return
    setGuardando(cliente.cliente_key)
    const ej = ejecutivos.find((e) => String(e.id) === String(ejecutivoId))

    const { error } = await supabase.from('cartera').upsert({
      cliente_key: cliente.cliente_key,
      nombre_cliente: cliente.nombre_cliente,
      comuna: cliente.comuna,
      ejecutivo_id: ejecutivoId,
      zona: ej?.zona || null,
      venta_mtd: Number(cliente.venta_mtd) || 0,
    }, { onConflict: 'ejecutivo_id,cliente_key' })

    setGuardando(null)
    if (error) { onFlash?.(mensajeDeError(error), 'error'); return }

    setRows((prev) => prev.filter((r) => r.cliente_key !== cliente.cliente_key))
    onFlash?.(`${cliente.nombre_cliente} → ${ej?.nombre}`, 'ok')
  }

  /** Todos los de una comuna al ejecutivo de esa zona, de una vez. */
  async function asignarComuna(comuna) {
    const zona = zonaFromComuna(normComuna(comuna))
    if (!zona) { onFlash?.(`${comuna} no está en el catálogo de comunas`, 'error'); return }
    const ej = ejecutivos.find((e) => String(e.zona || '').toUpperCase() === zona)
    if (!ej) { onFlash?.(`No hay ejecutivo para ${zona}`, 'error'); return }

    const lote = rows.filter((r) => normComuna(r.comuna) === normComuna(comuna))
    setGuardando(comuna)
    const { error } = await supabase.from('cartera').upsert(
      lote.map((c) => ({
        cliente_key: c.cliente_key,
        nombre_cliente: c.nombre_cliente,
        comuna: c.comuna,
        ejecutivo_id: ej.id,
        zona,
        venta_mtd: Number(c.venta_mtd) || 0,
      })),
      { onConflict: 'ejecutivo_id,cliente_key' }
    )
    setGuardando(null)
    if (error) { onFlash?.(mensajeDeError(error), 'error'); return }

    const keys = new Set(lote.map((c) => c.cliente_key))
    setRows((prev) => prev.filter((r) => !keys.has(r.cliente_key)))
    onFlash?.(`${lote.length} clientes de ${comuna} → ${ej.nombre}`, 'ok')
  }

  const porComuna = useMemo(() => {
    const m = new Map()
    for (const r of rows) {
      const c = r.comuna || 'sin comuna'
      if (!m.has(c)) m.set(c, { comuna: c, n: 0, venta: 0 })
      const e = m.get(c)
      e.n += 1
      e.venta += Number(r.venta_mtd) || 0
    }
    return [...m.values()].sort((a, b) => b.venta - a.venta)
  }, [rows])

  const ventaTotal = rows.reduce((s, r) => s + (Number(r.venta_mtd) || 0), 0)
  const vista = q.trim()
    ? rows.filter((r) => `${r.nombre_cliente} ${r.comuna}`.toLowerCase().includes(q.toLowerCase()))
    : rows.slice(0, 100)

  if (loading) return <p className="dg-sub-nota">Buscando clientes sin asignar…</p>
  if (err) return <p className="dg-errores">{err}</p>

  if (rows.length === 0) {
    return <p className="dg-sub-nota">Todos los clientes tienen ejecutivo asignado.</p>
  }

  return (
    <div className="dg-sub">
      <p className="dg-sub-nota">
        <strong>{rows.length} clientes</strong> sin ejecutivo, con{' '}
        <strong>{clp(ventaTotal)}</strong> facturados este mes. Nadie los ve en
        su cartera y no cuentan para ninguna meta.
      </p>

      {porComuna.length > 0 && (
        <>
          <p className="dg-sub-nota">Asignar por comuna, según el catálogo de zonas:</p>
          <div className="dg-sub-botones">
            {porComuna.slice(0, 8).map((c) => {
              const zona = zonaFromComuna(normComuna(c.comuna))
              return (
                <button
                  key={c.comuna}
                  type="button"
                  className="dg-btn"
                  disabled={!zona || guardando === c.comuna}
                  onClick={() => asignarComuna(c.comuna)}
                  title={zona ? `→ ${zona}` : 'comuna sin zona en el catálogo'}
                >
                  {guardando === c.comuna ? 'Asignando…' : `${c.comuna} · ${c.n}`}
                  {zona ? '' : ' ⚠'}
                </button>
              )
            })}
          </div>
        </>
      )}

      <input
        className="dg-file"
        style={{ borderStyle: 'solid', marginTop: 14 }}
        placeholder="Buscar cliente o comuna…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      <table className="dg-tabla" style={{ marginTop: 12 }}>
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
                  defaultValue=""
                  disabled={guardando === c.cliente_key}
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
      {!q && rows.length > 100 && (
        <p className="dg-sub-nota">Mostrando 100 de {rows.length}. Buscá para ver el resto.</p>
      )}
    </div>
  )
}

export default AsignarClientes
