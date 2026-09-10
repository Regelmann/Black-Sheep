import { useEffect, useState } from 'react'
import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { useSesion } from './hooks/useSesion.jsx'
import { iniciarSincronizacion, sincronizar } from './lib/sync.js'
import { loadActionQueue, itemsAgotados } from './lib/offline.js'
import { onOutboxChange } from './lib/outboxDb.js'
import Entrar from './paginas/Entrar.jsx'
import Hoy from './paginas/Hoy.jsx'
import Ruta from './paginas/Ruta.jsx'
import Cartera from './paginas/Cartera.jsx'
import Cliente from './paginas/Cliente.jsx'
import Pedidos from './paginas/Pedidos.jsx'

export default function App() {
  const { sesion, cargando, email, salir } = useSesion()
  const [cola, setCola] = useState([])
  const [enLinea, setEnLinea] = useState(navigator.onLine)
  const [sincronizando, setSincronizando] = useState(false)

  useEffect(() => {
    const refrescar = () => setCola(loadActionQueue())
    refrescar()
    const off = onOutboxChange(refrescar)
    const parar = sesion ? iniciarSincronizacion(refrescar) : null
    const red = () => setEnLinea(navigator.onLine)
    window.addEventListener('online', red)
    window.addEventListener('offline', red)
    return () => {
      off?.(); parar?.()
      window.removeEventListener('online', red)
      window.removeEventListener('offline', red)
    }
  }, [sesion])

  if (cargando) return <p className="cargando">Cargando…</p>
  if (!sesion) return <Entrar />

  const pendientes = cola.length
  const agotados = itemsAgotados().length

  return (
    <div className="app">
      <header className="cabecera">
        <div>
          <h1>Terreno</h1>
          <p className="sub">{email}</p>
        </div>
        <button className="boton" style={{ minHeight: 36, padding: '0 12px' }} onClick={salir}>
          Salir
        </button>
      </header>

      <Franja
        pendientes={pendientes} agotados={agotados} enLinea={enLinea}
        sincronizando={sincronizando}
        alSincronizar={async () => {
          setSincronizando(true)
          await sincronizar()
          setCola(loadActionQueue())
          setSincronizando(false)
        }}
      />

      <Routes>
        <Route path="/" element={<Hoy />} />
        <Route path="/ruta" element={<Ruta />} />
        <Route path="/cartera" element={<Cartera />} />
        <Route path="/cliente/:clave" element={<Cliente />} />
        <Route path="/pedidos" element={<Pedidos />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      <nav className="pestanas">
        <NavLink to="/" end>Hoy</NavLink>
        <NavLink to="/ruta">Ruta</NavLink>
        <NavLink to="/cartera">Clientes</NavLink>
        <NavLink to="/pedidos">Pedidos</NavLink>
      </nav>
    </div>
  )
}

/**
 * El vendedor tiene que saber SIEMPRE si su trabajo está guardado. Si
 * no lo sabe, vuelve al cuaderno. Por eso la franja aparece mientras
 * quede algo pendiente y desaparece sola cuando no queda nada.
 */
function Franja({ pendientes, agotados, enLinea, sincronizando, alSincronizar }) {
  if (agotados > 0) {
    return (
      <div className="franja agotado">
        <span>{agotados} {agotados === 1 ? 'registro no pudo subir' : 'registros no pudieron subir'}</span>
        <button onClick={alSincronizar}>Reintentar</button>
      </div>
    )
  }
  if (!enLinea) {
    return (
      <div className="franja sin-red">
        <span>Sin señal. Se guarda en el teléfono{pendientes ? ` · ${pendientes} por subir` : ''}.</span>
      </div>
    )
  }
  if (pendientes > 0) {
    return (
      <div className="franja pendiente">
        <span>{pendientes} {pendientes === 1 ? 'registro' : 'registros'} por subir</span>
        <button disabled={sincronizando} onClick={alSincronizar}>
          {sincronizando ? 'Subiendo…' : 'Subir ahora'}
        </button>
      </div>
    )
  }
  return null
}
