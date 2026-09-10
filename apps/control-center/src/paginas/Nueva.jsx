import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { llamar } from '../lib/rpc.js'

/**
 * Dar de alta una empresa. Queda en prueba y con las capacidades por
 * defecto; el resto se ajusta en su ficha.
 */
export default function Nueva() {
  const ir = useNavigate()
  const [f, setF] = useState({ nombre: '', slug: '', dias: 30, color: '#39ff14', monto: '' })
  const [error, setError] = useState(null)
  const [trabajando, setTrabajando] = useState(false)

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
        p_dias_trial: Number(f.dias), p_color: f.color,
      })
      if (f.monto) {
        await llamar('admin_set_suscripcion', { p_tenant: id, p_estado: 'trial' })
      }
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

      <section className="panel" style={{ maxWidth: 560 }}>
        <div className="campo">
          <label htmlFor="n">Nombre de la empresa</label>
          <input id="n" value={f.nombre} onChange={(e) => nombre(e.target.value)}
                 placeholder="Distribuidora KeyFoods" autoFocus />
        </div>
        <div className="campo">
          <label htmlFor="s">Su dirección</label>
          <input id="s" value={f.slug}
                 onChange={(e) => setF({ ...f, slug: e.target.value.toLowerCase() })} />
          <p className="silencio">
            {f.slug ? `${f.slug}.app.black-sheep.cl` : 'se arma con el nombre'}
            {f.slug && !slugValido && ' · sólo minúsculas, números y guiones'}
          </p>
        </div>
        <div className="fila-campos">
          <div className="campo">
            <label htmlFor="d">Días de prueba</label>
            <input id="d" type="number" value={f.dias}
                   onChange={(e) => setF({ ...f, dias: e.target.value })} />
          </div>
          <div className="campo">
            <label htmlFor="c">Color de su marca</label>
            <input id="c" type="color" value={f.color}
                   onChange={(e) => setF({ ...f, color: e.target.value })} />
          </div>
        </div>

        {error && <p className="estado error" style={{ marginTop: 'var(--e3)' }}>{error}</p>}

        <p style={{ marginTop: 'var(--e5)' }}>
          <button className="boton primario" disabled={!f.nombre || !slugValido || trabajando}
                  onClick={crear}>
            {trabajando ? 'Creando…' : 'Crear empresa'}
          </button>
        </p>
      </section>

      <section className="panel" style={{ maxWidth: 560 }}>
        <h2>Lo que pasa después</h2>
        <p className="silencio">
          Se crea con las capacidades por defecto y queda en prueba. En su ficha
          configuras los tipos de documento, das acceso a sus usuarios y sigues
          la puesta en marcha paso a paso.
        </p>
      </section>
    </>
  )
}
