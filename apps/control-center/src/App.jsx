import { Navigate, Route, Routes } from 'react-router-dom'
import { Armazon } from '../../../packages/ui/Armazon.jsx'
import { useSesion } from './hooks/useSesion.jsx'
import { VERSION, selloCorto } from '../../../packages/datos/version.js'
import Entrar from './paginas/Entrar.jsx'
import Hoy from './paginas/Hoy.jsx'
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

  // La navegación es CONFIGURACIÓN, no marcado copiado. Gerencia pasa
  // otra lista al mismo componente.
  const secciones = [
    { to: '/', texto: 'Hoy', icono: 'hoy', fin: true },
    { grupo: 'Plataforma', items: [
      { to: '/empresas', texto: 'Empresas', icono: 'empresas' },
      { to: '/nueva', texto: 'Dar de alta', icono: 'carga' },
    ] },
    { grupo: 'Negocio', items: [
      { to: '/cobranza', texto: 'Cobranza', icono: 'dinero' },
    ] },
  ]

  return (
    <Armazon marca="plataforma" tono="plataforma" secciones={secciones}
             usuario={email} onSalir={salir} sello={selloCorto()}>
      <Routes>
        <Route path="/" element={<Hoy />} />
        <Route path="/empresas" element={<Empresas />} />
        <Route path="/empresa/:id" element={<Empresa />} />
        <Route path="/cobranza" element={<Cobranza />} />
        <Route path="/nueva" element={<Nueva />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Armazon>
  )
}
