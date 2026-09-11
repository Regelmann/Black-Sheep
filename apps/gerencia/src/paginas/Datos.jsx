import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../../../packages/datos/supabase.js'
import { llamar } from '../../../../packages/datos/rpc.js'
import { useDatos } from '../hooks/useDatos.js'
import { Bloque } from '../componentes/Estado.jsx'
import { clp, num } from '../../../../packages/datos/formato.js'

/**
 * Corregir sin volver a subir archivos. Cada campo que se edita queda
 * marcado como manual y la próxima carga no lo pisa: aparece en
 * Conflictos si el archivo dice otra cosa.
 */
export default function Datos({ cap }) {
  const [pestana, setPestana] = useState('clientes')
  return (
    <>
      <header className="encabezado">
        <h1>Clientes y productos</h1>
        <p>Lo que corrijas aquí no se pierde con la próxima carga: queda marcado como cambio manual.</p>
      </header>

      <div className="fila-campos" style={{ marginBottom: 'var(--e5)' }}>
        {['clientes', 'prospectos', 'productos'].map((p) => (
          <button key={p}
                  className={`boton${pestana === p ? ' principal' : ''}`}
                  onClick={() => setPestana(p)}>
            {p[0].toUpperCase() + p.slice(1)}
          </button>
        ))}
      </div>

      {pestana === 'clientes' && <Clientes />}
      {pestana === 'prospectos' && <Prospectos cap={cap} />}
      {pestana === 'productos' && <Productos cap={cap} />}
    </>
  )
}

function Clientes() {
  const qc = useQueryClient()
  const [busca, setBusca] = useState('')
  const [error, setError] = useState(null)

  const clientes = useDatos({
    clave: ['cartera', busca],
    construir: () => {
      let q = supabase.from('cartera')
        .select('cliente_key,nombre,comuna,zona_id,ejecutivo_id,estado,venta_mtd')
        .order('venta_mtd', { ascending: false }).limit(60)
      if (busca.trim()) q = q.ilike('nombre', `%${busca.trim()}%`)
      return q
    },
    label: 'cartera',
  })

  const zonas = useDatos({
    clave: ['zonas'],
    construir: () => supabase.from('cartera').select('zona_id'),
    label: 'zonas',
  })
  const listaZonas = [...new Set((zonas.rows || []).map((z) => z.zona_id).filter(Boolean))]

  async function mover(cliente_key, zona) {
    setError(null)
    try {
      await llamar('guardar_cliente', { p_cliente_key: cliente_key, p_zona: zona })
      qc.invalidateQueries()
    } catch (e) { setError(e.message) }
  }

  return (
    <section className="panel">
      <div className="fila-campos" style={{ marginBottom: 'var(--e4)' }}>
        <div className="campo">
          <label htmlFor="busca">Buscar</label>
          <input id="busca" value={busca} onChange={(e) => setBusca(e.target.value)}
                 placeholder="Nombre del cliente" />
        </div>
      </div>
      {error && <p className="estado error">{error}</p>}

      <Bloque datos={clientes} que="los clientes" vacio="No hay clientes que coincidan.">
        <table>
          <thead>
            <tr>
              <th>Cliente</th><th>Comuna</th><th>Ejecutivo</th>
              <th>Zona</th><th className="num">Venta del mes</th><th></th>
            </tr>
          </thead>
          <tbody>
            {clientes.rows.map((c) => (
              <tr key={c.cliente_key}>
                <td>
                  {c.nombre || c.cliente_key}
                  <div className="silencio">{c.cliente_key}</div>
                </td>
                <td className="silencio">{c.comuna || '—'}</td>
                <td>{c.ejecutivo_id || '—'}</td>
                <td>
                  <select value={c.zona_id || ''} onChange={(e) => mover(c.cliente_key, e.target.value)}>
                    <option value="">—</option>
                    {listaZonas.map((z) => <option key={z} value={z}>{z}</option>)}
                  </select>
                </td>
                <td className="num">{clp(c.venta_mtd)}</td>
                <td><EnviarCatalogo cliente={c} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Bloque>
      <p className="silencio" style={{ marginTop: 'var(--e3)' }}>
        Cambiar la zona aquí deja ese campo bajo control manual: la próxima maestra no lo modifica.
      </p>
    </section>
  )
}

/**
 * Genera el enlace del catálogo de UN cliente y lo deja listo para
 * mandar por WhatsApp, que es como se manda de verdad.
 *
 * El token se muestra una sola vez: en la base sólo queda su hash. Si
 * se pierde, se genera otro y el anterior se puede revocar.
 */
function EnviarCatalogo({ cliente }) {
  const [enlace, setEnlace] = useState(null)
  const [error, setError] = useState(null)
  const [trabajando, setTrabajando] = useState(false)

  async function generar() {
    setTrabajando(true); setError(null)
    try {
      const token = await llamar('emitir_token_catalogo', { p_cliente_key: cliente.cliente_key })
      const base = import.meta.env.VITE_URL_CATALOGO || 'https://pedido.black-sheep.cl'
      setEnlace(`${base}/?t=${token}`)
    } catch (e) { setError(e.message) } finally { setTrabajando(false) }
  }

  if (error) return <span className="estado error">{error}</span>

  if (enlace) {
    const texto = encodeURIComponent(
      `Hola ${cliente.nombre || ''}, acá está tu catálogo con tus precios: ${enlace}`)
    return (
      <span style={{ display: 'inline-flex', gap: 'var(--e2)', whiteSpace: 'nowrap' }}>
        <a className="boton chico" target="_blank" rel="noopener noreferrer"
           href={`https://wa.me/?text=${texto}`}>WhatsApp</a>
        <button className="boton chico"
                onClick={() => navigator.clipboard?.writeText(enlace)}>Copiar</button>
      </span>
    )
  }

  return (
    <button className="boton chico" disabled={trabajando} onClick={generar}>
      {trabajando ? '…' : 'Catálogo'}
    </button>
  )
}

function Prospectos({ cap }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({ cliente_key: '', nombre: '', ejecutivo: '', comuna: '', rubro: '' })
  const [error, setError] = useState(null)

  const datos = useDatos({
    clave: ['prospectos'],
    construir: () => supabase.from('prospectos')
      .select('cliente_key,nombre,ejecutivo_id,zona_id,comuna,rubro'),
    label: 'prospectos',
  })

  if (cap && !cap.tiene?.('prospectos')) {
    return <section className="panel"><p className="silencio">Tu empresa no tiene contratada la gestión de prospectos.</p></section>
  }

  async function crear() {
    setError(null)
    try {
      await llamar('guardar_prospecto', {
        p_cliente_key: form.cliente_key, p_nombre: form.nombre,
        p_ejecutivo: form.ejecutivo, p_comuna: form.comuna || null,
        p_rubro: form.rubro || null,
      })
      setForm({ cliente_key: '', nombre: '', ejecutivo: '', comuna: '', rubro: '' })
      qc.invalidateQueries()
    } catch (e) { setError(e.message) }
  }

  return (
    <>
      <section className="panel">
        <h2>Agregar prospecto</h2>
        <p className="silencio">Un local que todavía no compra. No viene en la maestra y la carga no lo borra.</p>
        <div className="fila-campos" style={{ marginTop: 'var(--e4)' }}>
          {[['cliente_key', 'RUT o código'], ['nombre', 'Nombre'], ['ejecutivo', 'Ejecutivo'],
            ['comuna', 'Comuna'], ['rubro', 'Rubro']].map(([k, l]) => (
            <div className="campo" key={k}>
              <label htmlFor={k}>{l}</label>
              <input id={k} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
            </div>
          ))}
          <button className="boton primario"
                  disabled={!form.cliente_key || !form.nombre || !form.ejecutivo}
                  onClick={crear}>Agregar</button>
        </div>
        {error && <p className="estado error" style={{ marginTop: 'var(--e3)' }}>{error}</p>}
      </section>

      <section className="panel">
        <Bloque datos={datos} que="los prospectos" vacio="Todavía no hay prospectos cargados.">
          <table>
            <thead><tr><th>Prospecto</th><th>Ejecutivo</th><th>Zona</th><th>Comuna</th><th>Rubro</th></tr></thead>
            <tbody>
              {datos.rows.map((p) => (
                <tr key={p.cliente_key}>
                  <td>{p.nombre}<div className="silencio">{p.cliente_key}</div></td>
                  <td>{p.ejecutivo_id}</td>
                  <td>{p.zona_id || '—'}</td>
                  <td className="silencio">{p.comuna || '—'}</td>
                  <td className="silencio">{p.rubro || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Bloque>
      </section>
    </>
  )
}

function Productos({ cap }) {
  const qc = useQueryClient()
  const [nuevo, setNuevo] = useState({ sku: '', nombre: '', categoria: '', precio: '', costo: '', stock: '' })
  const [error, setError] = useState(null)
  const puedeCosto = cap?.tiene?.('costos_margen')

  const datos = useDatos({
    clave: ['productos'],
    construir: () => supabase.from('stock_vendible')
      .select('sku,nombre,categoria,precio_unidad,precio_caja,stock_total,es_vendible,motivo_no_vendible')
      .order('nombre').limit(100),
    label: 'productos',
  })

  async function crear() {
    setError(null)
    try {
      await llamar('guardar_producto', {
        p_sku: nuevo.sku, p_nombre: nuevo.nombre, p_categoria: nuevo.categoria || null,
      })
      if (nuevo.precio) await llamar('guardar_precio', { p_sku: nuevo.sku, p_precio_unidad: Number(nuevo.precio) })
      if (nuevo.costo && puedeCosto) await llamar('guardar_costo', { p_sku: nuevo.sku, p_costo: Number(nuevo.costo) })
      if (nuevo.stock) await llamar('guardar_stock', { p_sku: nuevo.sku, p_stock_total: Number(nuevo.stock) })
      setNuevo({ sku: '', nombre: '', categoria: '', precio: '', costo: '', stock: '' })
      qc.invalidateQueries()
    } catch (e) { setError(e.message) }
  }

  async function cambiarPrecio(sku, valor) {
    setError(null)
    try {
      await llamar('guardar_precio', { p_sku: sku, p_precio_unidad: Number(valor) })
      qc.invalidateQueries()
    } catch (e) { setError(e.message) }
  }

  return (
    <>
      <section className="panel">
        <h2>Agregar producto</h2>
        <div className="fila-campos" style={{ marginTop: 'var(--e4)' }}>
          {[['sku', 'Código'], ['nombre', 'Nombre'], ['categoria', 'Categoría'],
            ['precio', 'Precio unidad'], ...(puedeCosto ? [['costo', 'Costo']] : []), ['stock', 'Stock']]
            .map(([k, l]) => (
              <div className="campo" key={k}>
                <label htmlFor={`np-${k}`}>{l}</label>
                <input id={`np-${k}`} value={nuevo[k]}
                       onChange={(e) => setNuevo({ ...nuevo, [k]: e.target.value })} />
              </div>
            ))}
          <button className="boton primario" disabled={!nuevo.sku || !nuevo.nombre} onClick={crear}>
            Agregar
          </button>
        </div>
        {error && <p className="estado error" style={{ marginTop: 'var(--e3)' }}>{error}</p>}
      </section>

      <section className="panel">
        <Bloque datos={datos} que="los productos" vacio="Todavía no hay productos. Sube la lista de precios o agrega uno.">
          <table>
            <thead>
              <tr>
                <th>Producto</th><th>Categoría</th>
                <th className="num">Precio unidad</th><th className="num">Stock</th><th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {datos.rows.map((p) => (
                <tr key={p.sku}>
                  <td>{p.nombre}<div className="silencio">{p.sku}</div></td>
                  <td className="silencio">{p.categoria || '—'}</td>
                  <td className="num">
                    <input defaultValue={p.precio_unidad ?? ''} style={{ width: 100, textAlign: 'right' }}
                           onBlur={(e) => {
                             const v = e.target.value
                             if (v !== String(p.precio_unidad ?? '')) cambiarPrecio(p.sku, v)
                           }} />
                  </td>
                  <td className="num">{num(p.stock_total)}</td>
                  <td>
                    {p.es_vendible
                      ? <span className="insignia ok">vendible</span>
                      : <span className="insignia aviso">{p.motivo_no_vendible === 'SIN_PRECIO_LISTA' ? 'sin precio' : 'sin stock'}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Bloque>
      </section>
    </>
  )
}
