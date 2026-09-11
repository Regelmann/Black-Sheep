import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { useSesion } from './hooks/useSesion.jsx'
import { VERSION, selloCorto } from '../../../packages/datos/version.js'
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

  if (cargando) return <p className="estado">Cargando…</p>
  if (!sesion) return <Entrar />

  if (!esSuperadmin) {
    return (
      <div className="acceso">
        <div className="panel">
          <h1 style={{ fontSize: 'var(--t-medio)', marginBottom: 'var(--e3)' }}>
            Esto es el panel de Black Sheep
          </h1>
          <p className="silencio">
            Tu cuenta ({email}) no opera la plataforma. Si buscas tu empresa,
            entra por la dirección que te dieron: termina en
            <b> .app.black-sheep.cl</b>
          </p>
          <p style={{ marginTop: 'var(--e4)' }}>
            <button className="boton" onClick={salir}>Cerrar sesión</button>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="armazon plataforma">
      <aside className="rail">
        <div className="rail-marca">
          {/* El logo viene del manual de identidad. No se dibuja una
              aproximación: ese error ya se cometió dos veces. */}
          <img src="/logo.png" alt="Black Sheep" width="32" height="32" />
          <span className="rail-marca-texto">
            <b>Black Sheep</b>
            <span>{esSuperadmin ? 'plataforma' : 'gerencia'}</span>
          </span>
        </div>
        <nav className="nav-rail">
          <NavLink to="/" end>Empresas</NavLink>
          <NavLink to="/cobranza">Cobranza</NavLink>
          <NavLink to="/nueva">Dar de alta</NavLink>
        </nav>
        <div className="rail-pie">
          <p>{email}</p>
          <button onClick={salir}>Cerrar sesión</button>
          {/* Qué versión estás mirando. Sin esto, "no se ve el cambio"
              y "el cambio no se subió" son indistinguibles. */}
          <p className="sello" title={`${VERSION.rama} · ${VERSION.fecha}`}>
            {selloCorto()}
          </p>
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
