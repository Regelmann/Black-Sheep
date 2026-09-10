import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { useSesion } from './hooks/useSesion.jsx'
import Entrar from './paginas/Entrar.jsx'
import Empresas from './paginas/Empresas.jsx'
import Empresa from './paginas/Empresa.jsx'
import Nueva from './paginas/Nueva.jsx'
import Cobranza from './paginas/Cobranza.jsx'

/**
 * Control Center · sólo Black Sheep.
 *
 * El servidor verifica es_superadmin() en cada función. Esta pantalla
 * de "sin acceso" es cortesía: si alguien llega acá con una sesión de
 * gerencia, no vería datos igual, sólo errores. Decirle por qué es
 * mejor que dejarlo mirando una tabla vacía.
 */
export default function App() {
  const { sesion, cargando, esSuperadmin, email, salir } = useSesion()

  if (cargando) return <p className="cargando">Cargando…</p>
  if (!sesion) return <Entrar />

  if (!esSuperadmin) {
    return (
      <div className="acceso">
        <div className="bloque">
          <h1 style={{ fontSize: 'var(--t-medio)', marginBottom: 'var(--e3)' }}>
            Esto es el panel de Black Sheep
          </h1>
          <p className="sub">
            Tu cuenta ({email}) no opera la plataforma. Si buscas tu empresa,
            entra por la dirección que te dieron: termina en
            <b> .app.black-sheep.cl</b>
          </p>
          <p style={{ marginTop: 'var(--e4)' }}>
            <button className="btn" onClick={salir}>Cerrar sesión</button>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="marco plataforma">
      <aside className="barra">
        <div className="marca">
          <b>Black Sheep</b>
          <span>control</span>
        </div>
        <nav className="nav">
          <NavLink to="/" end>Empresas</NavLink>
          <NavLink to="/cobranza">Cobranza</NavLink>
          <NavLink to="/nueva">Dar de alta</NavLink>
        </nav>
        <div className="pie-barra">
          <p>{email}</p>
          <button onClick={salir}>Cerrar sesión</button>
        </div>
      </aside>

      <main className="lienzo">
        <Routes>
          <Route path="/" element={<Empresas />} />
          <Route path="/empresa/:id" element={<Empresa />} />
          <Route path="/cobranza" element={<Cobranza />} />
          <Route path="/nueva" element={<Nueva />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}
