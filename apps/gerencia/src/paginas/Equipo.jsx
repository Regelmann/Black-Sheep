import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../../../packages/datos/supabase.js'
import { llamar } from '../../../../packages/datos/rpc.js'
import { useDatos } from '../hooks/useDatos.js'
import { Bloque } from '../componentes/Estado.jsx'
import { clp, mesActual, num, pct } from '../../../../packages/datos/formato.js'

/**
 * Ejecutivos, metas y focos. Los focos SÓLO existen si la empresa mide
 * por SKU: hay distribuidoras que siguen la venta total del cliente y
 * el producto les da igual. Capacidad apagada = la sección no existe,
 * no es un botón gris.
 */
export default function Equipo({ cap }) {
  const qc = useQueryClient()
  const [error, setError] = useState(null)
  const [mes] = useState(mesActual())

  const ejecutivos = useDatos({
    clave: ['gerencia_ejecutivo'],
    construir: () => supabase.from('gerencia_ejecutivo')
      .select('ejecutivo_id,ejecutivo,zona_id,venta_mtd,meta_mes,activos,cayendo,dormidos'),
    label: 'ejecutivos',
  })

  const [nuevo, setNuevo] = useState({ id: '', nombre: '', zona: '' })

  async function guardarMeta(ejecutivo_id, monto) {
    setError(null)
    try {
      await llamar('set_meta', { p_ejecutivo: ejecutivo_id, p_mes: mes, p_monto: Number(monto) })
      qc.invalidateQueries()
    } catch (e) { setError(e.message) }
  }

  async function crearEjecutivo() {
    setError(null)
    try {
      await llamar('alta_ejecutivo', {
        p_id: nuevo.id.toUpperCase(), p_nombre: nuevo.nombre, p_zona: nuevo.zona || null,
      })
      setNuevo({ id: '', nombre: '', zona: '' })
      qc.invalidateQueries()
    } catch (e) { setError(e.message) }
  }

  const metasActivas = cap?.tiene?.('metas_ejecutivo') !== false

  return (
    <>
      <header className="encabezado">
        <h1>Equipo y metas</h1>
        <p>Quién atiende qué zona y cuánto tiene que vender este mes.</p>
      </header>

      {error && <p className="estado error" style={{ marginBottom: 'var(--e4)' }}>{error}</p>}

      <section className="panel">
        <h2>Agregar ejecutivo</h2>
        <div className="fila-campos" style={{ marginTop: 'var(--e4)' }}>
          <div className="campo">
            <label htmlFor="ei">Código</label>
            <input id="ei" value={nuevo.id} onChange={(e) => setNuevo({ ...nuevo, id: e.target.value })} />
          </div>
          <div className="campo">
            <label htmlFor="en">Nombre</label>
            <input id="en" value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} />
          </div>
          <div className="campo">
            <label htmlFor="ez">Zona</label>
            <input id="ez" value={nuevo.zona} onChange={(e) => setNuevo({ ...nuevo, zona: e.target.value })} />
          </div>
          <button className="boton primario" disabled={!nuevo.id || !nuevo.nombre} onClick={crearEjecutivo}>
            Agregar
          </button>
        </div>
        <p className="silencio" style={{ marginTop: 'var(--e3)' }}>
          Dar de baja a alguien no borra su historial: se desactiva y puedes reasignar su cartera.
        </p>
      </section>

      <section className="panel">
        <h2>Este mes</h2>
        <Bloque datos={ejecutivos} que="el equipo" vacio="Todavía no hay ejecutivos. Sube la maestra o agrega uno.">
          <table>
            <thead>
              <tr>
                <th>Ejecutivo</th><th>Zona</th>
                <th className="num">Venta</th>
                {metasActivas && <><th className="num">Meta</th><th className="num">Avance</th></>}
                <th className="num">Activos</th><th className="num">Cayendo</th><th className="num">Dormidos</th>
              </tr>
            </thead>
            <tbody>
              {ejecutivos.rows.map((e) => {
                const avance = e.meta_mes > 0 ? (100 * Number(e.venta_mtd || 0)) / Number(e.meta_mes) : null
                return (
                  <tr key={e.ejecutivo_id}>
                    <td>{e.ejecutivo}<div className="silencio">{e.ejecutivo_id}</div></td>
                    <td className="silencio">{e.zona_id || '—'}</td>
                    <td className="num">{clp(e.venta_mtd)}</td>
                    {metasActivas && (
                      <>
                        <td className="num">
                          <input defaultValue={e.meta_mes ?? ''} style={{ width: 110, textAlign: 'right' }}
                                 onBlur={(ev) => {
                                   const v = ev.target.value
                                   if (v && v !== String(e.meta_mes ?? '')) guardarMeta(e.ejecutivo_id, v)
                                 }} />
                        </td>
                        <td className="num">{avance === null ? '—' : pct(avance, 0)}</td>
                      </>
                    )}
                    <td className="num">{num(e.activos)}</td>
                    <td className="num">{num(e.cayendo)}</td>
                    <td className="num silencio">{num(e.dormidos)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Bloque>
      </section>

      {cap?.tiene?.('foco_sku') && <Focos mes={mes} />}
    </>
  )
}

function Focos({ mes }) {
  const qc = useQueryClient()
  const [f, setF] = useState({ sku: '', meta: '', zona: '*' })
  const [error, setError] = useState(null)

  async function guardar() {
    setError(null)
    try {
      await llamar('set_foco', {
        p_mes: mes, p_sku: f.sku, p_meta_unidades: Number(f.meta), p_zona: f.zona || '*',
      })
      setF({ sku: '', meta: '', zona: '*' })
      qc.invalidateQueries()
    } catch (e) { setError(e.message) }
  }

  return (
    <section className="panel">
      <h2>Focos del mes</h2>
      <p className="silencio">Productos que el equipo tiene que empujar, con su meta en unidades.</p>
      <div className="fila-campos" style={{ marginTop: 'var(--e4)' }}>
        <div className="campo">
          <label htmlFor="fs">Código del producto</label>
          <input id="fs" value={f.sku} onChange={(e) => setF({ ...f, sku: e.target.value })} />
        </div>
        <div className="campo">
          <label htmlFor="fm">Meta en unidades</label>
          <input id="fm" value={f.meta} onChange={(e) => setF({ ...f, meta: e.target.value })} />
        </div>
        <div className="campo">
          <label htmlFor="fz">Zona</label>
          <input id="fz" value={f.zona} onChange={(e) => setF({ ...f, zona: e.target.value })}
                 placeholder="* para todas" />
        </div>
        <button className="boton primario" disabled={!f.sku || !f.meta} onClick={guardar}>Definir foco</button>
      </div>
      {error && <p className="estado error" style={{ marginTop: 'var(--e3)' }}>{error}</p>}
    </section>
  )
}
