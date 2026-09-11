import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { llamar } from '../lib/rpc.js'

/**
 * Dar de alta una empresa. Queda en prueba y con las capacidades por
 * defecto; el resto se ajusta en su ficha.
 */
export default function Nueva() {
  const ir = useNavigate()
  const [f, setF] = useState({ nombre: '', slug: '', dias: 30, color: '#a3e635', plan: '' })
  const [error, setError] = useState(null)
  const [trabajando, setTrabajando] = useState(false)
  const { data: planes = [] } = useQuery({
    queryKey: ['admin_planes'], queryFn: () => llamar('admin_planes'),
  })
  const plan = f.plan || planes[0]?.codigo || ''

  // El slug es la dirección: se sugiere del nombre y se puede corregir.
  function nombre(v) {
    const auto = v.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
    setF({ ...f, nombre: v, slug: auto })
  }

  async function crear() {
    setError(null); setTrabajando(true)
    try {
      const id = await llamar('admin_alta_empresa', {
        p_slug: f.slug, p_nombre: f.nombre,
        p_plan: plan, p_dias_trial: Number(f.dias), p_color: f.color,
      })
      ir(`/empresa/${id}`)
    } catch (e) {
      setError(e.message)
      setTrabajando(false)
    }
  }

  const slugValido = /^[a-z0-9]([a-z0-9-]{1,38}[a-z0-9])$/.test(f.slug)

  return (
    <>
      <header className="encabezado">
        <h1>Dar de alta una empresa</h1>
        <p>Queda en prueba. Después hay que configurarle los tipos de documento antes de su primera carga.</p>
      </header>

      <section className="panel">
        <div className="formulario-alta">
          <div className="campo ancho-total">
            <label htmlFor="n">Nombre de la empresa</label>
            <input id="n" value={f.nombre} onChange={(e) => nombre(e.target.value)}
                   placeholder="Distribuidora KeyFoods" autoFocus />
          </div>

          <div className="campo ancho-total">
            <label htmlFor="s">Su dirección</label>
            <input id="s" value={f.slug}
                   onChange={(e) => setF({ ...f, slug: e.target.value.toLowerCase() })} />
            <p className="silencio">
              {f.slug ? `${f.slug}.app.black-sheep.cl` : 'se arma con el nombre'}
              {f.slug && !slugValido && ' · sólo minúsculas, números y guiones'}
            </p>
          </div>

          <div className="campo">
            <label htmlFor="p">Plan</label>
            <select id="p" value={plan} onChange={(e) => setF({ ...f, plan: e.target.value })}>
              {planes.map((x) => <option key={x.codigo} value={x.codigo}>{x.nombre}</option>)}
            </select>
            <p className="silencio">{planes.find((x) => x.codigo === plan)?.descripcion}</p>
          </div>

          <div className="campo">
            <label htmlFor="d">Días de prueba</label>
            <input id="d" type="number" value={f.dias}
                   onChange={(e) => setF({ ...f, dias: e.target.value })} />
          </div>

          <div className="campo ancho-total">
            <label>Color de su marca</label>
            {/* Una paleta acotada y no el selector entero: el color del
                tenant tiene que contrastar sobre el negro de la app, y
                dejar elegir cualquiera garantiza que alguien elija uno
                ilegible. */}
            <div className="paleta">
              {['#a3e635','#c2410c','#0ea5e9','#e11d48','#8b5cf6','#f59e0b','#14b8a6','#64748b'].map((c) => (
                <button key={c} type="button" style={{ background: c }}
                        aria-pressed={f.color === c} aria-label={c}
                        onClick={() => setF({ ...f, color: c })} />
              ))}
            </div>
          </div>
        </div>

        {error && <p className="estado error" style={{ marginTop: 'var(--e3)' }}>{error}</p>}

        <p style={{ marginTop: 'var(--e4)' }}>
          <button className="boton primario"
                  disabled={!f.nombre || !slugValido || !plan || trabajando}
                  onClick={crear}>
            {trabajando ? 'Creando…' : 'Crear empresa'}
          </button>
          <span className="silencio" style={{ marginLeft: 'var(--e3)' }}>
            Después: tipos de documento, usuarios y su primera carga.
          </span>
        </p>
      </section>
    </>
  )
}
