import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { useSesion } from './hooks/useSesion.jsx'
import { useCapacidades } from './hooks/useCapacidades.js'
import { useDatos } from './hooks/useDatos.js'
import { supabase } from './lib/supabase.js'
import Entrar from './paginas/Entrar.jsx'
import Resumen from './paginas/Resumen.jsx'
import Carga from './paginas/Carga.jsx'
import Conflictos from './paginas/Conflictos.jsx'
import Datos from './paginas/Datos.jsx'
import Equipo from './paginas/Equipo.jsx'

/**
 * La navegación se dibuja desde las CAPACIDADES de la empresa, no desde
 * una lista fija. Una distribuidora que no mide por SKU no ve "Focos";
 * no es un botón deshabilitado, sencillamente no existe para ella.
 */
export default function App() {
  const { sesion, cargando, esSuperadmin, email, salir } = useSesion()
  const cap = useCapacidades()

  const conflictos = useDatos({
    clave: ['conflictos', 'conteo'],
    construir: () => supabase.from('conflictos').select('id'),
    label: 'conflictos',
    activa: !!sesion,
  })

  if (cargando) return <p className="cargando">Cargando…</p>
  if (!sesion) return <Entrar />

  const pendientes = conflictos.rows?.length || 0

  return (
    <div className="marco">
      <aside className="barra">
        <div className="marca">
          <b>Black Sheep</b>
          <span>{esSuperadmin ? 'plataforma' : 'gerencia'}</span>
        </div>

        <nav className="nav">
          <NavLink to="/">Resumen</NavLink>
          <NavLink to="/carga">Cargar datos</NavLink>
          <NavLink to="/conflictos">
            Conflictos
            {pendientes > 0 && <span className="pin">{pendientes}</span>}
          </NavLink>

          <p className="nav-titulo">Administrar</p>
          <NavLink to="/datos">Clientes y productos</NavLink>
          <NavLink to="/equipo">Equipo y metas</NavLink>

          {/* La consola de plataforma vive en apps/control-center, en
              otro dominio. Tenerla acá mezclaba dos productos con dos
              audiencias y dos niveles de privilegio en un mismo build. */}
          {esSuperadmin && (
            <p className="nav-titulo">
              Plataforma: admin.black-sheep.cl
            </p>
          )}
        </nav>

        <div className="pie-barra">
          <p>{email}</p>
          <button onClick={salir}>Cerrar sesión</button>
        </div>
      </aside>

      <main className="lienzo">
        <Routes>
          <Route path="/" element={<Resumen />} />
          <Route path="/carga" element={<Carga />} />
          <Route path="/conflictos" element={<Conflictos />} />
          <Route path="/datos" element={<Datos cap={cap} />} />
          <Route path="/equipo" element={<Equipo cap={cap} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}
